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
  name: 'mike-bot-creator',
  version: '1.0.0'
}, {
  capabilities: {}
});

async function run() {
  console.log('🤖 Connecting to MCP Server...');
  await client.connect(transport);
  console.log('✅ Connected to MCP Server!');

  const engineId = 'gemini-enterprise-17810154_1781015455895';
  const agentId = 'mike-bot';

  console.log(`\nCreating Agent "${agentId}" (Mike Bot) in engine "${engineId}"...`);

  try {
    const response = await client.callTool({
      name: 'gemini_enterprise_manage_agents',
      arguments: {
        action: 'create',
        engine_id: engineId,
        agent_id: agentId,
        display_name: 'Mike Bot',
        description: 'A purely informative agent designed to answer enterprise questions and provide curated information.'
      }
    });
    
    console.log('\n--- Tool Call Response: ---');
    console.log(response.content[0].text);
    console.log('---------------------------');
  } catch (err) {
    console.error('❌ Failed to call tool:', err.message || err);
  } finally {
    await client.close();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal failure:', err);
  process.exit(1);
});
