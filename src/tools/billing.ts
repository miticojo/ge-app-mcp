import { config } from '../config.js';
import { getAuthHeaders, fetchJson } from '../gcp.js';
import { selectLicenseConfigId, summarizeSubscriptions, validateEmails } from '../domain/licensing.js';
import { buildLicenseInspectCall } from '../domain/inspect.js';

export const billingTools = [
  {
    name: 'gemini_enterprise_inspect_licenses',
    description: 'Read-only inspection of Gemini Enterprise license pools, assigned seats, indexed structured data, and active seat usage stats. Safe for parallel calls without confirmation prompts.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'usage_stats'],
          description: 'list (pools, total/assigned seats, assigned users, indexed bytes) or usage_stats (used seats per pool).'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'gemini_enterprise_manage_licenses',
    description: 'Manage Gemini Enterprise license pools and user seat assignments: list, usage_stats, assign, unassign.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'usage_stats', 'assign', 'unassign'],
          description: 'list (pools, seats, assigned users), usage_stats (used seats per pool), assign, or unassign.'
        },
        usernames: {
          type: 'array',
          items: { type: 'string' },
          description: 'User email addresses to assign or unassign.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        subscription_id: {
          type: 'string',
          description: 'License configuration ID to assign from. Required when more than one active configuration exists.'
        }
      },
      required: ['action']
    }
  }
];

// Licensing resources are global-only.
const licensingBase = (projectId: string, version: 'v1beta' | 'v1alpha' = 'v1beta') =>
  `https://discoveryengine.googleapis.com/${version}/projects/${projectId}/locations/global`;

const MAX_PAGES = 50;

async function listAll(url: string, field: string, headers: Record<string, string>, operation: string): Promise<any[]> {
  const items: any[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const sep = url.includes('?') ? '&' : '?';
    const data = await fetchJson(`${url}${pageToken ? `${sep}pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers }, operation);
    items.push(...(data[field] || []));
    pageToken = data.nextPageToken;
    if (!pageToken) return items;
  }
  throw new Error(`${operation}: more than ${MAX_PAGES} pages; narrow the request.`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(2)} ${units[i]}`;
}

const textResult = (payload: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] });

export async function handleBillingToolCall(name: string, args: any): Promise<any> {
  if (name === 'gemini_enterprise_inspect_licenses') {
    return await handleBillingToolCall('gemini_enterprise_manage_licenses', buildLicenseInspectCall(args));
  }
  if (name !== 'gemini_enterprise_manage_licenses') {
    throw new Error(`Unsupported billing tool name: ${name}`);
  }

  const { action } = args;
  const projectId = args.project_id || config.projectId;
  if (!projectId) throw new Error('Google Cloud Project ID is not configured.');
  const headers = await getAuthHeaders(projectId);
  const base = licensingBase(projectId);
  const batchUrl = `${base}/userStores/default_user_store:batchUpdateUserLicenses`;

  switch (action) {
    case 'list': {
      console.error(`[Billing] Retrieving Gemini Enterprise licenses for Project "${projectId}"`);
      const [licenseConfigs, userLicenses, dataStores] = await Promise.all([
        listAll(`${base}/licenseConfigs`, 'licenseConfigs', headers, 'List license configurations'),
        listAll(`${base}/userStores/default_user_store/userLicenses?pageSize=1000`, 'userLicenses', headers, 'List user licenses'),
        listAll(`${base}/collections/${config.collectionId}/dataStores`, 'dataStores', headers, 'List data stores')
      ]);

      const indexedBytes = dataStores.reduce((sum: number, ds: any) => {
        const size = parseInt(ds.billingEstimation?.structuredDataSize ?? '0', 10);
        return sum + (Number.isNaN(size) ? 0 : size);
      }, 0);

      const subscriptions = summarizeSubscriptions(licenseConfigs, userLicenses);
      const assignedUsers = userLicenses
        .filter((ul: any) => ul.licenseAssignmentState === 'ASSIGNED')
        .map((ul: any) => ({
          emailAddress: ul.userPrincipal,
          subscriptionId: (ul.licenseConfig || '').split('/').pop(),
          dateAssigned: (ul.createTime || '').split('T')[0],
          lastUsed: (ul.lastLoginTime || '').split('T')[0]
        }));

      return textResult({
        status: 'SUCCESS',
        message: `Retrieved licenses for Project "${projectId}".`,
        structuredDataIndexed: formatBytes(indexedBytes),
        subscriptions,
        assignedUsers
      });
    }

    case 'usage_stats': {
      const data = await fetchJson(`${licensingBase(projectId, 'v1alpha')}/userStores/default_user_store/licenseConfigsUsageStats`, { headers }, 'List license usage stats');
      return textResult({
        status: 'SUCCESS',
        usage: (data.licenseConfigUsageStats || []).map((s: any) => ({
          subscriptionId: (s.licenseConfig || '').split('/').pop(),
          usedLicenseCount: parseInt(s.usedLicenseCount, 10) || 0
        }))
      });
    }

    case 'assign': {
      const users = validateEmails(args.usernames);
      const configs = await listAll(`${base}/licenseConfigs`, 'licenseConfigs', headers, 'List license configurations');
      const configId = selectLicenseConfigId(configs, args.subscription_id);
      const licenseConfig = `projects/${projectId}/locations/global/licenseConfigs/${configId}`;
      console.error(`[Billing] Assigning ${users.length} user(s) to ${licenseConfig}`);

      const operation = await fetchJson(batchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ inlineSource: { userLicenses: users.map(email => ({ userPrincipal: email, licenseConfig })) } })
      }, 'Assign licenses');

      return textResult({
        status: 'SUCCESS',
        message: `Assigned license "${configId}" to ${users.length} user(s).`,
        assignedUsers: users,
        operation
      });
    }

    case 'unassign': {
      const users = validateEmails(args.usernames);
      console.error(`[Billing] Unassigning licenses from ${users.length} user(s)`);
      const operation = await fetchJson(batchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          deleteUnassignedUserLicenses: true,
          inlineSource: {
            userLicenses: users.map(email => ({ userPrincipal: email, licenseConfig: '' })),
            updateMask: 'licenseConfig'
          }
        })
      }, 'Unassign licenses');

      return textResult({
        status: 'SUCCESS',
        message: `Unassigned licenses from ${users.length} user(s).`,
        unassignedUsers: users,
        operation
      });
    }

    default:
      throw new Error(`Unsupported licensing action: ${action}`);
  }
}
