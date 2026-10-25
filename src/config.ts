import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const list = (value: string | undefined) =>
  (value || '').split(',').map(s => s.trim()).filter(Boolean);

const transport = (process.env.MCP_TRANSPORT || 'stdio').toLowerCase();
if (transport !== 'stdio' && transport !== 'http') {
  throw new Error(`Invalid MCP_TRANSPORT "${transport}". Use "stdio" or "http".`);
}

export const config = {
  projectId: process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '',
  location: process.env.GCP_LOCATION || 'global',
  collectionId: process.env.GCP_COLLECTION || 'default_collection',

  // stdio (default, local harnesses with ADC) or http (Streamable HTTP, end-user OAuth tokens)
  transport: transport as 'stdio' | 'http',

  // Allowed security scopes: search, admin, billing
  scopes: (process.env.MCP_SCOPES || 'search,admin,billing')
    .split(',')
    .map(s => s.trim().toLowerCase()),

  // Maximum time a tool waits for a long-running operation before returning it as pending.
  lroWaitSeconds: Math.max(1, Number(process.env.MCP_LRO_WAIT_SECONDS || 20)),

  http: {
    port: Number(process.env.PORT || 8080),
    // Host header allowlist (DNS rebinding protection); empty disables the check.
    allowedHosts: list(process.env.MCP_ALLOWED_HOSTS),
    // OAuth client IDs whose access tokens are accepted (e.g. the Gemini Enterprise OAuth client).
    allowedOAuthClientIds: list(process.env.ALLOWED_OAUTH_CLIENT_IDS),
    // Optional: restrict callers to these email domains.
    allowedEmailDomains: list(process.env.ALLOWED_EMAIL_DOMAINS).map(d => d.toLowerCase()),
    // A token must carry at least one of these scopes.
    acceptedScopes: list(process.env.ACCEPTED_OAUTH_SCOPES || 'https://www.googleapis.com/auth/discoveryengine.readwrite,https://www.googleapis.com/auth/cloud-platform')
  }
};

if (!config.projectId) {
  console.warn('Warning: GCP_PROJECT environment variable is not set. Google Cloud APIs may fail without a project ID.');
}
