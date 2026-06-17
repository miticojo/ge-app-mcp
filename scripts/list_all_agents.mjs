import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/Users/giorgioc/Repos/ge-app-mcp/build/index.js'],
  env: {
    ...process.env,
    GCP_PROJECT: 'giorgioc-cloud-apps',
    GCP_LOCATION: 'global',
    GCP_COLLECTION: 'default_collection',
    GOOGLE_CLOUD_QUOTA_PROJECT: 'giorgioc-cloud-apps',
  }
});

const client = new Client({
  name: 'agent-lister',
  version: '1.0.0'
}, {
  capabilities: {}
});

async function run() {
  await client.connect(transport);
  const response = await client.callTool({
    name: 'gemini_enterprise_manage_agents',
    arguments: {
      action: 'list',
      engine_id: 'gemini-enterprise-17810154_1781015455895'
    }
  });
  console.log(response.content[0].text);
  await client.close();
  process.exit(0);
}

run().catch(console.error);
