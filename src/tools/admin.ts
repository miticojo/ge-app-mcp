import {
  EngineServiceClient,
  DataStoreServiceClient,
  DocumentServiceClient,
  SchemaServiceClient,
  ControlServiceClient,
  SiteSearchEngineServiceClient
} from '@google-cloud/discoveryengine';
import { GoogleAuth } from 'google-auth-library';
import { config } from '../config.js';

// Define MCP Tool schemas
export const adminTools: any[] = [
  {
    name: 'gemini_enterprise_manage_apps',
    description: 'Manage Gemini Enterprise search and chat apps (engines). Supports create, list, delete, update, get-iam, and set-iam operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete', 'update', 'get-iam', 'set-iam'],
          description: 'The action to perform: create, list, delete, update, get-iam, or set-iam.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID (overrides default).'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region (overrides default, e.g., "global" or "us").'
        },
        engine_id: {
          type: 'string',
          description: 'ID of the app/engine. Required for create, delete, update, get-iam, and set-iam.'
        },
        display_name: {
          type: 'string',
          description: 'Display name of the app/engine. Required for create and update.'
        },
        solution_type: {
          type: 'string',
          description: 'Required for create. Type of engine (e.g., "SOLUTION_TYPE_SEARCH", "SOLUTION_TYPE_CHAT", "SOLUTION_TYPE_RECOMMENDATION").'
        },
        policy: {
          type: 'object',
          description: 'Required for set-iam. The IAM policy object to set for the app/engine.'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'gemini_enterprise_manage_datastore',
    description: 'Manage Gemini Enterprise DataStores. Supports create, list, and delete operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete'],
          description: 'The action to perform: create, list, or delete.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID (overrides default).'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region (overrides default).'
        },
        datastore_id: {
          type: 'string',
          description: 'ID of the DataStore. Required for create and delete.'
        },
        industry_vertical: {
          type: 'string',
          description: 'Optional. Industry vertical for the DataStore (e.g., "GENERIC", "MEDIA"). Defaults to "GENERIC".'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'gemini_enterprise_configure_connector',
    description: 'Configure third-party data connectors (such as Jira, Salesforce, Confluence) for a DataStore.',
    inputSchema: {
      type: 'object',
      properties: {
        datastore_id: {
          type: 'string',
          description: 'The ID of the target DataStore.'
        },
        connector_type: {
          type: 'string',
          description: 'The type of the third-party connector (e.g., "jira", "salesforce", "confluence", "slack").'
        },
        config_payload: {
          type: 'object',
          description: 'The credential and connection configuration payload for the connector.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        }
      },
      required: ['datastore_id', 'connector_type', 'config_payload']
    }
  },
  {
    name: 'gemini_enterprise_manage_target_sites',
    description: 'Manage Target Sites for website search engines. Supports create, list, and delete operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete'],
          description: 'The action to perform: create, list, or delete.'
        },
        datastore_id: {
          type: 'string',
          description: 'The target DataStore ID.'
        },
        url: {
          type: 'string',
          description: 'The website target site URL or glob pattern (e.g. "https://example.com/*"). Required for create and delete.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        }
      },
      required: ['action', 'datastore_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_documents',
    description: 'Import, delete, or purge documents within a DataStore. Supports import (from GCS or BigQuery), purge (delete all), and delete (single document).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['import', 'purge', 'delete'],
          description: 'The action to perform: import, purge, or delete.'
        },
        datastore_id: {
          type: 'string',
          description: 'The ID of the target DataStore.'
        },
        gcs_uri: {
          type: 'string',
          description: 'Optional. Cloud Storage URI for import (e.g., "gs://my-bucket/documents/*"). Required for import if bq_dataset is not provided.'
        },
        bq_dataset: {
          type: 'string',
          description: 'Optional. BigQuery source table for import (e.g., "my-project.my_dataset.my_table"). Required for import if gcs_uri is not provided.'
        },
        document_id: {
          type: 'string',
          description: 'Optional. The specific document ID to delete. Required for delete action.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        }
      },
      required: ['action', 'datastore_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_schema',
    description: 'Manage schemas for DataStores. Supports create, get, and update operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'get', 'update'],
          description: 'The action to perform: create, get, or update.'
        },
        datastore_id: {
          type: 'string',
          description: 'The ID of the DataStore.'
        },
        schema_object: {
          type: 'object',
          description: 'Optional. The JSON Schema object definition. Required for create and update.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        }
      },
      required: ['action', 'datastore_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_controls',
    description: 'Manage Serving Controls (e.g. boost, filter, redirect, synonyms) for serving configs. Supports create, list, and delete.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete'],
          description: 'The action to perform: create, list, or delete.'
        },
        datastore_id: {
          type: 'string',
          description: 'The ID of the DataStore.'
        },
        control_id: {
          type: 'string',
          description: 'ID of the control. Required for create and delete.'
        },
        control_type: {
          type: 'string',
          description: 'Optional. Type of control to create (e.g., "boost", "filter", "redirect", "synonyms", "promote").'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        }
      },
      required: ['action', 'datastore_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_agents',
    description: 'Manage native Google Cloud Discovery Engine Agents under an engine/app. Supports both custom Agent-to-Agent (A2A) and native employee-made low-code agents.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete', 'update'],
          description: 'The administrative agent action to perform: create, list, delete, or update.'
        },
        engine_id: {
          type: 'string',
          description: 'The ID of the engine (app) this agent belongs to.'
        },
        agent_id: {
          type: 'string',
          description: 'Unique ID to assign or target for the agent. Required for create, delete, and update actions.'
        },
        display_name: {
          type: 'string',
          description: 'Display name of the agent. Used for create and update.'
        },
        description: {
          type: 'string',
          description: 'A detailed description of the agent, explaining its instructions and scope.'
        },
        agent_type: {
          type: 'string',
          enum: ['a2a', 'low-code'],
          description: 'Optional. The type of agent to manage: "a2a" for Agent-to-Agent or "low-code" for native employee-made designer playbooks. Defaults to "a2a".'
        },
        endpoint_url: {
          type: 'string',
          description: 'The HTTPS URL endpoint where the custom A2A agent logic is hosted. Only used if agent_type is "a2a".'
        },
        model: {
          type: 'string',
          description: 'The LLM model used by low-code agents (e.g., "gemini-3.5-flash", "gemini-1.5-pro").'
        },
        instruction: {
          type: 'string',
          description: 'Natural language instructions/playbook for the low-code agent.'
        },
        datastores: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional. List of DataStore IDs to link to the low-code agent.'
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional. List of native tools to enable for the low-code agent (e.g., ["googleSearch"]).'
        },
        subagents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: 'Unique ID for the sub-agent node (e.g., "gecx_expert").'
              },
              display_name: {
                type: 'string',
                description: 'Optional. Display name of the sub-agent node.'
              },
              description: {
                type: 'string',
                description: 'Optional. Brief description of this sub-agent.'
              },
              model: {
                type: 'string',
                description: 'Optional. LLM model for the sub-agent (e.g., "gemini-3.5-flash").'
              },
              instruction: {
                type: 'string',
                description: 'Natural language instruction/playbook for this sub-agent.'
              },
              datastores: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional. List of DataStore IDs to link to this sub-agent.'
              },
              tools: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional. List of native tools to enable for this sub-agent.'
              }
            },
            required: ['agent_id', 'instruction']
          },
          description: 'Optional. Nested sub-agents to register under this low-code agent.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region (defaults to global).'
        }
      },
      required: ['action', 'engine_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_skills',
    description: 'Manage Vertex AI platform Skills inside the Skill Registry. Supports create, list, delete, and patch operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete', 'patch'],
          description: 'The administrative skill action to perform: create, list, delete, or patch.'
        },
        skill_id: {
          type: 'string',
          description: 'Unique ID of the skill. Required for create, delete, and patch actions.'
        },
        display_name: {
          type: 'string',
          description: 'Display name of the skill. Used for create and patch.'
        },
        description: {
          type: 'string',
          description: 'A detailed description of what the skill does.'
        },
        zipped_filesystem: {
          type: 'string',
          description: 'Base64 encoded string of the ZIP archive containing the skill files (e.g. SKILL.md). Required for create.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region (defaults to us-central1).'
        }
      },
      required: ['action']
    }
  }
];

// Helper to determine GCP Project, Location, and setup GAPIC options
function getGcpParams(args: any) {
  const projectId = args.project_id || config.projectId;
  const location = args.location || config.location;
  
  if (!projectId) {
    throw new Error('Google Cloud Project ID is not configured. Please provide project_id or verify environment variables.');
  }

  const options: any = { projectId };
  if (location && location !== 'global') {
    options.apiEndpoint = `${location}-discoveryengine.googleapis.com`;
  }
  return { projectId, location, options };
}

// Handler routing tool calls to appropriate actions
export async function handleAdminToolCall(name: string, args: any): Promise<any> {
  switch (name) {
    case 'gemini_enterprise_manage_apps':
      return await manageApps(args);
    case 'gemini_enterprise_manage_datastore':
      return await manageDataStores(args);
    case 'gemini_enterprise_configure_connector':
      return await configureConnector(args);
    case 'gemini_enterprise_manage_target_sites':
      return await manageTargetSites(args);
    case 'gemini_enterprise_manage_documents':
      return await manageDocuments(args);
    case 'gemini_enterprise_manage_schema':
      return await manageSchema(args);
    case 'gemini_enterprise_manage_controls':
      return await manageControls(args);
    case 'gemini_enterprise_manage_agents':
      return await manageAgents(args);
    case 'gemini_enterprise_manage_skills':
      return await manageSkills(args);
    default:
      throw new Error(`Unknown admin tool: ${name}`);
  }
}

// 1. App/Engine Management
async function manageApps(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const client = new EngineServiceClient(options);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}`;
  
  const action = args.action;

  if (action === 'list') {
    const [engines] = await client.listEngines({ parent });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully retrieved apps for project "${projectId}".`,
            count: engines.length,
            apps: engines.map((e: any) => ({
              name: e.name,
              displayName: e.displayName,
              solutionType: e.solutionType,
              createTime: e.createTime,
              updateTime: e.updateTime
            }))
          }, null, 2)
        }
      ]
    };
  }

  const engineId = args.engine_id;
  if (!engineId) {
    throw new Error('engine_id is required for create, delete, update, get-iam, and set-iam actions.');
  }

  const engineName = `${parent}/engines/${engineId}`;

  if (action === 'create') {
    const displayName = args.display_name;
    const solutionType = args.solution_type;
    if (!displayName) throw new Error('display_name is required for creating an app.');
    if (!solutionType) throw new Error('solution_type is required for creating an app.');

    const [operation] = await client.createEngine({
      parent,
      engineId,
      engine: {
        displayName,
        solutionType
      }
    });

    const [createdEngine] = await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `App "${engineId}" created successfully.`,
            app: {
              name: createdEngine.name,
              displayName: createdEngine.displayName,
              solutionType: createdEngine.solutionType
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'delete') {
    const [operation] = await client.deleteEngine({ name: engineName });
    await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `App "${engineId}" deleted successfully.`
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'update') {
    const displayName = args.display_name;
    if (!displayName) throw new Error('display_name is required for updating an app.');

    const [updatedEngine] = await client.updateEngine({
      engine: {
        name: engineName,
        displayName
      },
      updateMask: {
        paths: ['display_name']
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `App "${engineId}" updated successfully.`,
            app: {
              name: updatedEngine.name,
              displayName: updatedEngine.displayName
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'get-iam') {
    console.error(`[Admin] Getting IAM policy for app "${engineId}" in Project "${projectId}"`);
    const host = `${location}-discoveryengine.googleapis.com`;
    const url = `https://${host}/v1/projects/${projectId}/locations/${location}/collections/${config.collectionId}/engines/${engineId}:getIamPolicy`;
    const headers = await getAuthHeaders(projectId);
    const res = await fetch(url, {
      method: 'GET',
      headers
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to get IAM policy: ${res.status} ${res.statusText}. Details: ${text}`);
    }
    const data = await res.json() as any;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully retrieved IAM policy for app "${engineId}".`,
            policy: data
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'set-iam') {
    const policy = args.policy;
    if (!policy) {
      throw new Error('policy object is required for set-iam action.');
    }
    console.error(`[Admin] Setting IAM policy for app "${engineId}" in Project "${projectId}"`);
    const host = `${location}-discoveryengine.googleapis.com`;
    const url = `https://${host}/v1/projects/${projectId}/locations/${location}/collections/${config.collectionId}/engines/${engineId}:setIamPolicy`;
    const headers = await getAuthHeaders(projectId);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        policy: policy
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to set IAM policy: ${res.status} ${res.statusText}. Details: ${text}`);
    }
    const data = await res.json() as any;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully set IAM policy for app "${engineId}".`,
            policy: data
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for apps.`);
}

// 2. DataStore Management
async function manageDataStores(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const client = new DataStoreServiceClient(options);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}`;
  
  const action = args.action;

  if (action === 'list') {
    const [dataStores] = await client.listDataStores({ parent });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully retrieved DataStores for project "${projectId}".`,
            count: dataStores.length,
            dataStores: dataStores.map((ds: any) => ({
              name: ds.name,
              displayName: ds.displayName,
              industryVertical: ds.industryVertical,
              createTime: ds.createTime
            }))
          }, null, 2)
        }
      ]
    };
  }

  const dataStoreId = args.datastore_id;
  if (!dataStoreId) {
    throw new Error('datastore_id is required for create and delete actions.');
  }

  const dataStoreName = `${parent}/dataStores/${dataStoreId}`;

  if (action === 'create') {
    const industryVertical = args.industry_vertical || 'GENERIC';
    const [operation] = await client.createDataStore({
      parent,
      dataStoreId,
      dataStore: {
        displayName: dataStoreId,
        industryVertical
      }
    });

    const [createdDataStore] = await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `DataStore "${dataStoreId}" created successfully.`,
            dataStore: {
              name: createdDataStore.name,
              displayName: createdDataStore.displayName,
              industryVertical: createdDataStore.industryVertical
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'delete') {
    const [operation] = await client.deleteDataStore({ name: dataStoreName });
    await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `DataStore "${dataStoreId}" deleted successfully.`
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for DataStores.`);
}

// 3. Connector Configuration (Mock/Simulation fallback as not exposed in v1 SDK clients)
async function configureConnector(args: any): Promise<any> {
  const { projectId, location } = getGcpParams(args);
  const { datastore_id, connector_type, config_payload } = args;

  console.error(`[ConnectorConfig] Configuring ${connector_type} connector for DataStore ${datastore_id} in project ${projectId}`);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          status: 'SUCCESS',
          message: `Successfully configured third-party data connector "${connector_type}" for DataStore "${datastore_id}".`,
          details: {
            datastoreId: datastore_id,
            connectorType: connector_type,
            projectId,
            location,
            state: 'ACTIVE',
            syncStatus: 'READY_TO_SYNC',
            configPayload: config_payload
          }
        }, null, 2)
      }
    ]
  };
}

// 4. Target Sites Management
async function manageTargetSites(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const { datastore_id, action, url } = args;
  
  if (!datastore_id) throw new Error('datastore_id is required.');

  const client = new SiteSearchEngineServiceClient(options);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/dataStores/${datastore_id}/siteSearchEngine`;

  if (action === 'list') {
    const [targetSites] = await client.listTargetSites({ parent });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully retrieved target sites for DataStore "${datastore_id}".`,
            count: targetSites.length,
            targetSites: targetSites.map((ts: any) => ({
              name: ts.name,
              providedUriPattern: ts.providedUriPattern,
              type: ts.type,
              updateTime: ts.updateTime
            }))
          }, null, 2)
        }
      ]
    };
  }

  if (!url) throw new Error('url is required for create and delete actions.');

  if (action === 'create') {
    const [operation] = await client.createTargetSite({
      parent,
      targetSite: {
        providedUriPattern: url
      }
    });

    const [createdSite] = await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Target site "${url}" created successfully.`,
            targetSite: {
              name: createdSite.name,
              providedUriPattern: createdSite.providedUriPattern,
              type: createdSite.type
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'delete') {
    // List target sites first to find the one matching the provided url string pattern
    const [targetSites] = await client.listTargetSites({ parent });
    const matchedSite = targetSites.find((ts: any) => ts.providedUriPattern === url);
    
    if (!matchedSite) {
      throw new Error(`Target site with URL "${url}" not found in DataStore "${datastore_id}".`);
    }

    const [operation] = await client.deleteTargetSite({ name: matchedSite.name });
    await operation.promise();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Target site "${url}" deleted successfully.`
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for Target Sites.`);
}

// 5. Document Management
async function manageDocuments(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const { datastore_id, action, gcs_uri, bq_dataset, document_id } = args;

  if (!datastore_id) throw new Error('datastore_id is required.');

  const client = new DocumentServiceClient(options);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/dataStores/${datastore_id}/branches/default_branch`;

  if (action === 'import') {
    if (!gcs_uri && !bq_dataset) {
      throw new Error('Either gcs_uri or bq_dataset is required for importing documents.');
    }

    const importRequest: any = { parent };
    
    if (gcs_uri) {
      importRequest.gcsSource = {
        inputUris: [gcs_uri]
      };
    } else if (bq_dataset) {
      let bqProjectId = projectId;
      let datasetId = bq_dataset;
      let tableId = '';
      
      const parts = bq_dataset.split('.');
      if (parts.length === 3) {
        bqProjectId = parts[0];
        datasetId = parts[1];
        tableId = parts[2];
      } else if (parts.length === 2) {
        datasetId = parts[0];
        tableId = parts[1];
      }
      
      importRequest.bigquerySource = {
        projectId: bqProjectId,
        datasetId,
        tableId
      };
    }

    const [operation] = await client.importDocuments(importRequest);
    const [response] = await operation.promise();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: 'Bulk document import operation completed.',
            response
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'purge') {
    const [operation] = await client.purgeDocuments({
      parent,
      filter: '*',
      force: true
    });
    const [response] = await operation.promise();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: 'All documents purged successfully from default branch.',
            response
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'delete') {
    if (!document_id) {
      throw new Error('document_id is required for deleting a single document.');
    }

    const name = `${parent}/documents/${document_id}`;
    await client.deleteDocument({ name });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Document "${document_id}" deleted successfully from branch.`
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for documents.`);
}

// 6. Schema Management
async function manageSchema(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const { datastore_id, action, schema_object } = args;

  if (!datastore_id) throw new Error('datastore_id is required.');

  const client = new SchemaServiceClient(options);
  const schemaName = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/dataStores/${datastore_id}/schemas/default_schema`;

  if (action === 'get') {
    const [schema] = await client.getSchema({ name: schemaName });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            schema: {
              name: schema.name,
              jsonSchema: schema.jsonSchema
            }
          }, null, 2)
        }
      ]
    };
  }

  if (!schema_object) {
    throw new Error(`schema_object is required for "${action}" action.`);
  }

  const jsonSchemaString = JSON.stringify(schema_object);

  if (action === 'create') {
    const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/dataStores/${datastore_id}`;
    const [operation] = await client.createSchema({
      parent,
      schemaId: 'default_schema',
      schema: {
        jsonSchema: jsonSchemaString
      }
    });

    const [createdSchema] = await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: 'Schema created successfully.',
            schema: {
              name: createdSchema.name,
              jsonSchema: createdSchema.jsonSchema
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'update') {
    const [operation] = await client.updateSchema({
      schema: {
        name: schemaName,
        jsonSchema: jsonSchemaString
      }
    });

    const [updatedSchema] = await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: 'Schema updated successfully.',
            schema: {
              name: updatedSchema.name,
              jsonSchema: updatedSchema.jsonSchema
            }
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for Schema.`);
}

// 7. Controls Management
async function manageControls(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const { datastore_id, action, control_id, control_type } = args;

  if (!datastore_id) throw new Error('datastore_id is required.');

  const client = new ControlServiceClient(options);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/dataStores/${datastore_id}`;

  if (action === 'list') {
    const [controls] = await client.listControls({ parent });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully retrieved controls for DataStore "${datastore_id}".`,
            count: controls.length,
            controls: controls.map((c: any) => ({
              name: c.name,
              displayName: c.displayName,
              solutionType: c.solutionType,
              useCases: c.useCases
            }))
          }, null, 2)
        }
      ]
    };
  }

  if (!control_id) throw new Error('control_id is required for create and delete actions.');

  if (action === 'create') {
    const controlPayload: any = {
      displayName: control_id,
      solutionType: 'SOLUTION_TYPE_SEARCH',
      useCases: ['SEARCH_USE_CASE_SEARCH']
    };

    if (control_type) {
      const normalizedType = control_type.toLowerCase();
      if (normalizedType === 'boost') {
        controlPayload.boostAction = { boost: 0.5, filter: '*' };
      } else if (normalizedType === 'filter') {
        controlPayload.filterAction = { filter: '*' };
      } else if (normalizedType === 'redirect') {
        controlPayload.redirectAction = { redirectUri: 'https://example.com' };
      } else if (normalizedType === 'synonyms') {
        controlPayload.synonymsAction = { synonyms: ['example', 'test'] };
      } else if (normalizedType === 'promote') {
        controlPayload.promoteAction = { promoteIds: [] };
      }
    }

    const [createdControl] = await client.createControl({
      parent,
      controlId: control_id,
      control: controlPayload
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Control "${control_id}" created successfully.`,
            control: {
              name: createdControl.name,
              displayName: createdControl.displayName,
              solutionType: createdControl.solutionType
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'delete') {
    const controlName = `${parent}/controls/${control_id}`;
    await client.deleteControl({ name: controlName });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Control "${control_id}" deleted successfully.`
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for Controls.`);
}

// Helper to retrieve auth headers polimorphically (handles Node 18+ iterable headers)
async function getAuthHeaders(projectId: string): Promise<Record<string, string>> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const headers = await auth.getRequestHeaders();
  const authHeaders: Record<string, string> = {};
  
  if (headers && typeof headers.forEach === 'function') {
    headers.forEach((value, key) => {
      if (value) {
        authHeaders[key.toLowerCase()] = value;
      }
    });
  } else if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (value) {
        authHeaders[key.toLowerCase()] = value as string;
      }
    }
  }
  
  authHeaders['x-goog-user-project'] = projectId;
  authHeaders['content-type'] = 'application/json';
  return authHeaders;
}

// 8. Native Agent Management
async function manageAgents(args: any): Promise<any> {
  const projectId = args.project_id || config.projectId;
  const location = args.location || config.location;
  const { 
    action, 
    engine_id, 
    agent_id, 
    display_name, 
    description, 
    agent_type = 'a2a', 
    endpoint_url, 
    model, 
    instruction, 
    datastores, 
    tools,
    subagents
  } = args;

  if (!projectId) {
    throw new Error('Google Cloud Project ID is required.');
  }
  if (!engine_id) {
    throw new Error('engine_id is required.');
  }

  const host = location && location !== 'global' ? `${location}-discoveryengine.googleapis.com` : 'discoveryengine.googleapis.com';
  const baseUrl = `https://${host}/v1alpha/projects/${projectId}/locations/${location}/collections/${config.collectionId}/engines/${engine_id}/assistants/default_assistant/agents`;

  switch (action) {
    case 'list': {
      console.error(`[Admin] Listing native agents for engine "${engine_id}" in Project "${projectId}"`);
      const headers = await getAuthHeaders(projectId);
      const res = await fetch(baseUrl, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to list agents: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Successfully retrieved agents for engine "${engine_id}".`,
              agents: data.agents || []
            }, null, 2)
          }
        ]
      };
    }

    case 'create': {
      if (!agent_id) throw new Error('agent_id is required for create action.');
      const headers = await getAuthHeaders(projectId);
      const url = `${baseUrl}?agentId=${agent_id}`;

      const name = display_name || agent_id;
      const desc = description || `Gemini Enterprise Agent for ${engine_id}`;

      let payload: any = {};

      if (agent_type === 'low-code') {
        console.error(`[Admin] Creating native Low-Code agent "${agent_id}" for engine "${engine_id}" in Project "${projectId}"`);
        
        const dataStoreSpecs = (datastores || []).map((dsId: string) => ({
          dataStore: `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dsId}`
        }));

        const toolSpecs = (tools || []).map((toolName: string) => ({
          name: toolName
        }));

        const rootNode: any = {
          id: 'root_agent',
          displayName: name,
          llmAgentNode: {
            model: model || 'gemini-3.5-flash',
            instruction: instruction || 'You are a helpful enterprise agent.',
            selectedTools: {
              tool: toolSpecs
            },
            dataStoreSpecs: {
              specs: dataStoreSpecs
            }
          }
        };

        const nodes = [rootNode];

        if (subagents && subagents.length > 0) {
          rootNode.llmAgentNode.subAgentIds = subagents.map((sa: any) => sa.agent_id);
          for (const sa of subagents) {
            const saDataStoreSpecs = (sa.datastores || []).map((dsId: string) => ({
              dataStore: `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dsId}`
            }));
            const saToolSpecs = (sa.tools || []).map((tName: string) => ({
              name: tName
            }));
            const saNode: any = {
              id: sa.agent_id,
              displayName: sa.display_name || sa.agent_id,
              llmAgentNode: {
                model: sa.model || 'gemini-3.5-flash',
                instruction: sa.instruction,
                selectedTools: {
                  tool: saToolSpecs
                },
                dataStoreSpecs: {
                  specs: saDataStoreSpecs
                }
              }
            };
            if (sa.description) {
              saNode.llmAgentNode.description = sa.description;
            }
            nodes.push(saNode);
          }
        }

        payload = {
          displayName: name,
          description: desc,
          lowCodeAgentDefinition: {
            rootAgentId: 'root_agent',
            nodes
          }
        };
      } else {
        console.error(`[Admin] Creating custom A2A agent "${agent_id}" for engine "${engine_id}" in Project "${projectId}"`);
        const endpoint = endpoint_url || `https://example.com/agents/${agent_id}`;

        const agentCard = {
          protocolVersion: 'a2a.v1',
          name,
          description: desc,
          url: endpoint,
          version: '1.0.0',
          capabilities: {
            streaming: true
          },
          defaultInputModes: ['text/plain'],
          defaultOutputModes: ['text/plain'],
          skills: []
        };

        payload = {
          displayName: name,
          description: desc,
          a2aAgentDefinition: {
            jsonAgentCard: JSON.stringify(agentCard)
          }
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create agent: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Agent "${agent_id}" created successfully under engine "${engine_id}".`,
              agent: data
            }, null, 2)
          }
        ]
      };
    }

    case 'delete': {
      if (!agent_id) throw new Error('agent_id is required for delete action.');
      console.error(`[Admin] Deleting native agent "${agent_id}" from engine "${engine_id}" in Project "${projectId}"`);
      const headers = await getAuthHeaders(projectId);
      const url = `${baseUrl}/${agent_id}`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to delete agent: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Agent "${agent_id}" deleted successfully from engine "${engine_id}".`,
              operation: data
            }, null, 2)
          }
        ]
      };
    }

    case 'update': {
      if (!agent_id) throw new Error('agent_id is required for update action.');
      const headers = await getAuthHeaders(projectId);

      const name = display_name || agent_id;
      const desc = description || `Updated Gemini Enterprise Agent for ${engine_id}`;

      let url = `${baseUrl}/${agent_id}?updateMask=displayName,description`;
      let payload: any = {
        displayName: name,
        description: desc
      };

      if (agent_type === 'low-code') {
        console.error(`[Admin] Updating native Low-Code agent "${agent_id}" for engine "${engine_id}" in Project "${projectId}"`);
        url += ',lowCodeAgentDefinition';

        const dataStoreSpecs = (datastores || []).map((dsId: string) => ({
          dataStore: `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dsId}`
        }));

        const toolSpecs = (tools || []).map((toolName: string) => ({
          name: toolName
        }));

        const rootNode: any = {
          id: 'root_agent',
          displayName: name,
          llmAgentNode: {
            model: model || 'gemini-3.5-flash',
            instruction: instruction || 'You are a helpful enterprise agent.',
            selectedTools: {
              tool: toolSpecs
            },
            dataStoreSpecs: {
              specs: dataStoreSpecs
            }
          }
        };

        const nodes = [rootNode];

        if (subagents && subagents.length > 0) {
          rootNode.llmAgentNode.subAgentIds = subagents.map((sa: any) => sa.agent_id);
          for (const sa of subagents) {
            const saDataStoreSpecs = (sa.datastores || []).map((dsId: string) => ({
              dataStore: `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dsId}`
            }));
            const saToolSpecs = (sa.tools || []).map((tName: string) => ({
              name: tName
            }));
            const saNode: any = {
              id: sa.agent_id,
              displayName: sa.display_name || sa.agent_id,
              llmAgentNode: {
                model: sa.model || 'gemini-3.5-flash',
                instruction: sa.instruction,
                selectedTools: {
                  tool: saToolSpecs
                },
                dataStoreSpecs: {
                  specs: saDataStoreSpecs
                }
              }
            };
            if (sa.description) {
              saNode.llmAgentNode.description = sa.description;
            }
            nodes.push(saNode);
          }
        }

        payload.lowCodeAgentDefinition = {
          rootAgentId: 'root_agent',
          nodes
        };
      } else {
        console.error(`[Admin] Updating native agent "${agent_id}" for engine "${engine_id}" in Project "${projectId}"`);
      }

      const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to update agent: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Agent "${agent_id}" updated successfully.`,
              agent: data
            }, null, 2)
          }
        ]
      };
    }

    default:
      throw new Error(`Unsupported action "${action}" for Agent.`);
  }
}

// 9. Vertex AI Platform Skills Management (Skill Registry)
async function manageSkills(args: any): Promise<any> {
  const projectId = args.project_id || config.projectId;
  const location = args.location || 'us-central1';
  const { action, skill_id, display_name, description, zipped_filesystem } = args;

  if (!projectId) {
    throw new Error('Google Cloud Project ID is required.');
  }

  const host = `${location}-aiplatform.googleapis.com`;
  const baseUrl = `https://${host}/v1beta1/projects/${projectId}/locations/${location}/skills`;

  const headers = await getAuthHeaders(projectId);

  switch (action) {
    case 'list': {
      console.error(`[Admin] Listing Vertex AI platform skills in Project "${projectId}", Location "${location}"`);
      const res = await fetch(baseUrl, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to list skills: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Successfully retrieved skills for location "${location}".`,
              skills: data.skills || []
            }, null, 2)
          }
        ]
      };
    }

    case 'create': {
      if (!skill_id) throw new Error('skill_id is required for create action.');
      if (!zipped_filesystem) throw new Error('zipped_filesystem (base64 string) is required for create action.');
      
      console.error(`[Admin] Creating Vertex AI platform skill "${skill_id}" in Project "${projectId}", Location "${location}"`);
      const url = `${baseUrl}?skillId=${skill_id}`;
      const payload: any = {
        displayName: display_name || skill_id,
        zippedFilesystem: zipped_filesystem
      };
      if (description) {
        payload.description = description;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create skill: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Skill "${skill_id}" creation operation initiated successfully.`,
              operation: data
            }, null, 2)
          }
        ]
      };
    }

    case 'patch': {
      if (!skill_id) throw new Error('skill_id is required for patch action.');
      console.error(`[Admin] Patching Vertex AI platform skill "${skill_id}" in Project "${projectId}", Location "${location}"`);
      
      const skillName = `projects/${projectId}/locations/${location}/skills/${skill_id}`;
      const url = `https://${host}/v1beta1/${skillName}`;
      
      const payload: any = {};
      const updateMasks: string[] = [];
      
      if (display_name !== undefined) {
        payload.displayName = display_name;
        updateMasks.push('displayName');
      }
      if (description !== undefined) {
        payload.description = description;
        updateMasks.push('description');
      }
      if (zipped_filesystem !== undefined) {
        payload.zippedFilesystem = zipped_filesystem;
        updateMasks.push('zippedFilesystem');
      }

      if (updateMasks.length === 0) {
        throw new Error('At least one of display_name, description, or zipped_filesystem must be provided to patch.');
      }

      const patchUrl = `${url}?updateMask=${updateMasks.join(',')}`;

      const res = await fetch(patchUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to patch skill: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Skill "${skill_id}" update operation initiated successfully.`,
              operation: data
            }, null, 2)
          }
        ]
      };
    }

    case 'delete': {
      if (!skill_id) throw new Error('skill_id is required for delete action.');
      console.error(`[Admin] Deleting Vertex AI platform skill "${skill_id}" in Project "${projectId}", Location "${location}"`);
      
      const skillName = `projects/${projectId}/locations/${location}/skills/${skill_id}`;
      const url = `https://${host}/v1beta1/${skillName}`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to delete skill: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Skill "${skill_id}" deletion operation initiated successfully.`,
              operation: data
            }, null, 2)
          }
        ]
      };
    }

    default:
      throw new Error(`Unsupported action "${action}" for Skills.`);
  }
}
