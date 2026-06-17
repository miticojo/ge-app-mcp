import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '../build/index.js');

const transport = new StdioClientTransport({
  command: 'node',
  args: [serverPath],
  env: {
    ...process.env,
    GCP_PROJECT: 'giorgioc-cloud-apps',
    GCP_LOCATION: 'global',
    GCP_COLLECTION: 'default_collection',
    GOOGLE_CLOUD_QUOTA_PROJECT: 'giorgioc-cloud-apps',
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
  console.log('Connected! Calling gemini_enterprise_manage_apps with action: "list"...');
  
  try {
    const response = await client.callTool({
      name: 'gemini_enterprise_manage_apps',
      arguments: {
        action: 'list'
      }
    });
    
    console.log('\n--- Tool Call Response: ---');
    if (response.isError) {
      console.error('Error returned from tool call:');
    }
    console.log(response.content[0].text);
    console.log('---------------------------n');
  } catch (err) {
    console.error('Failed to call tool:', err);
  } finally {
    await client.close();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
