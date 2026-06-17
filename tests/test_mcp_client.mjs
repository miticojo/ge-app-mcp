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
  }
});

const client = new Client({
  name: 'test-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

async function run() {
  console.log('Connecting to MCP server...');
  await client.connect(transport);
  console.log('Connected! Listing tools...');
  
  const response = await client.listTools();
  console.log('\n--- Tools list returned by server: ---');
  console.log(JSON.stringify(response.tools, null, 2));
  console.log('--------------------------------------\n');
  
  await client.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
