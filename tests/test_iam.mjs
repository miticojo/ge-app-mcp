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
  name: 'test-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

async function run() {
  console.log('Connecting to MCP server...');
  await client.connect(transport);
  console.log('Connected!');
  
  try {
    console.log('1. Calling get-iam...');
    const getRes = await client.callTool({
      name: 'gemini_enterprise_manage_apps',
      arguments: {
        action: 'get-iam',
        engine_id: 'gemini-enterprise-17810154_1781015455895'
      }
    });
    
    if (getRes.isError) {
      throw new Error(`get-iam failed: ${getRes.content[0].text}`);
    }
    
    const getData = JSON.parse(getRes.content[0].text);
    console.log('Successfully retrieved IAM policy:', JSON.stringify(getData.policy, null, 2));
    
    const policy = getData.policy;
    
    console.log('\n2. Calling set-iam to write the identical policy back (safe, non-destructive check)...');
    const setRes = await client.callTool({
      name: 'gemini_enterprise_manage_apps',
      arguments: {
        action: 'set-iam',
        engine_id: 'gemini-enterprise-17810154_1781015455895',
        policy: policy
      }
    });
    
    if (setRes.isError) {
      throw new Error(`set-iam failed: ${setRes.content[0].text}`);
    }
    
    const setData = JSON.parse(setRes.content[0].text);
    console.log('Successfully set IAM policy! Response:', JSON.stringify(setData, null, 2));
    
  } catch (err) {
    console.error('Failed test:', err);
  } finally {
    await client.close();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
