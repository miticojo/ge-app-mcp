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
  name: 'custom-mike-bot-creator',
  version: '1.0.0'
}, {
  capabilities: {}
});

async function run() {
  await client.connect(transport);
  console.log('🤖 Creating custom A2A Mike Bot...');
  try {
    const response = await client.callTool({
      name: 'gemini_enterprise_manage_agents',
      arguments: {
        action: 'create',
        engine_id: 'gemini-enterprise-17810154_1781015455895',
        agent_id: 'mike-bot',
        display_name: 'Mike Bot',
        description: 'A purely informative agent designed to answer enterprise questions and provide curated information.',
        endpoint_url: 'https://mikebot.giorgioc.altostrat.com/api/message'
      }
    });
    console.log('\nResponse:');
    console.log(response.content[0].text);
  } catch (err) {
    console.error('Failed to create custom agent:', err.message || err);
  } finally {
    await client.close();
    process.exit(0);
  }
}

run().catch(console.error);
