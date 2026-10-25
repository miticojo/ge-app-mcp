import { AsyncLocalStorage } from 'node:async_hooks';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { config } from './config.js';

/**
 * Per-request end-user credentials. When the server runs over HTTP behind
 * Gemini Enterprise, every Google API call is executed on behalf of the calling
 * user (OBO) so that Google IAM enforces that user's own permissions.
 */
export interface UserCredentials {
  accessToken: string;
  principal?: string;
}

const credentialStore = new AsyncLocalStorage<UserCredentials>();

export function runWithUserCredentials<T>(credentials: UserCredentials, fn: () => Promise<T>): Promise<T> {
  return credentialStore.run(credentials, fn);
}

export function currentUserCredentials(): UserCredentials | undefined {
  return credentialStore.getStore();
}

let adcAuth: GoogleAuth | null = null;

// Fail closed: in HTTP mode the server identity must never be used as a fallback,
// otherwise an unauthenticated caller would inherit the service account's privileges.
function requireUserCredentialsInHttpMode(): UserCredentials | undefined {
  const creds = credentialStore.getStore();
  if (!creds && config.transport === 'http') {
    throw new Error('Unauthenticated: no end-user OAuth token bound to this request.');
  }
  return creds;
}

/**
 * Builds lowercase REST headers (see AGENTS.md §3): Authorization, quota routing and content type.
 */
export async function getAuthHeaders(projectId: string): Promise<Record<string, string>> {
  const authHeaders: Record<string, string> = {};
  const creds = requireUserCredentialsInHttpMode();

  if (creds) {
    authHeaders['authorization'] = `Bearer ${creds.accessToken}`;
  } else {
    adcAuth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const headers: any = await adcAuth.getRequestHeaders();
    if (headers && typeof headers.forEach === 'function') {
      // Node.js 18+ iterable Headers object
      headers.forEach((value: string, key: string) => {
        if (value) authHeaders[key.toLowerCase()] = value;
      });
    } else if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        if (value) authHeaders[key.toLowerCase()] = value as string;
      }
    }
  }

  authHeaders['x-goog-user-project'] = projectId;
  authHeaders['content-type'] = 'application/json';
  return authHeaders;
}

export function discoveryEngineHost(location?: string): string {
  return location && location !== 'global'
    ? `${location}-discoveryengine.googleapis.com`
    : 'discoveryengine.googleapis.com';
}

export function discoveryEngineBaseUrl(location: string | undefined, version: 'v1' | 'v1alpha' | 'v1beta' = 'v1alpha'): string {
  return `https://${discoveryEngineHost(location)}/${version}`;
}

/**
 * GAPIC client options bound to the current credentials (ADC in stdio, end-user token over HTTP).
 */
export function gapicClientOptions(projectId: string, location?: string): any {
  const options: any = { projectId };
  if (location && location !== 'global') {
    options.apiEndpoint = discoveryEngineHost(location);
  }
  const creds = requireUserCredentialsInHttpMode();
  if (creds) {
    const userClient = new OAuth2Client();
    userClient.setCredentials({ access_token: creds.accessToken });
    userClient.quotaProjectId = projectId;
    options.auth = new GoogleAuth({ authClient: userClient });
  }
  return options;
}

/**
 * fetch wrapper that always checks HTTP status and returns parsed JSON ({} for empty bodies).
 */
export async function fetchJson(url: string, init: RequestInit, operation: string): Promise<any> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${operation} failed: ${res.status} ${res.statusText}. Details: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}
