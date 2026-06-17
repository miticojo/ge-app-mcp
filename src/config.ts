import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

export const config = {
  projectId: process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '',
  location: process.env.GCP_LOCATION || 'global',
  collectionId: process.env.GCP_COLLECTION || 'default_collection',
  
  // Port or transport config for MCP if needed (default MCP uses stdio)
  transport: process.env.MCP_TRANSPORT || 'stdio',

  // Allowed security scopes: search, admin, billing
  scopes: (process.env.MCP_SCOPES || 'search,admin,billing')
    .split(',')
    .map(s => s.trim().toLowerCase()),
};

if (!config.projectId) {
  console.warn('Warning: GCP_PROJECT environment variable is not set. Google Cloud APIs may fail without a project ID.');
}
