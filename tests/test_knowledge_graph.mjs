import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '../build/index.js');

const targetEngineId = process.env.TARGET_ENGINE_ID;
if (!targetEngineId) {
  console.error('TARGET_ENGINE_ID is required (no default: test engines change over time).');
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: 'node',
  args: [serverPath],
  env: {
    ...process.env,
    PATH: `/opt/homebrew/bin:${process.env.PATH}`,
    GCP_PROJECT: process.env.GCP_PROJECT || 'giorgioc-cloud-apps',
    GCP_LOCATION: process.env.GCP_LOCATION || 'global',
    GCP_COLLECTION: process.env.GCP_COLLECTION || 'default_collection',
    GOOGLE_CLOUD_QUOTA_PROJECT: process.env.GOOGLE_CLOUD_QUOTA_PROJECT || 'giorgioc-cloud-apps',
    MCP_SCOPES: process.env.MCP_SCOPES || 'search,admin,billing',
  }
});

const client = new Client({
  name: 'test-knowledge-graph',
  version: '1.0.0'
}, {
  capabilities: {}
});

async function run() {
  console.log(`🌌 Testing new MCP tool "gemini_enterprise_manage_knowledge_graph" on app "${targetEngineId}"...\n`);
  await client.connect(transport);

  console.log('--- 1. ENABLING BOTH KNOWLEDGE GRAPHS (enable_all_knowledge_graphs: true) ---');
  const resEnable = await client.callTool({
    name: 'gemini_enterprise_manage_knowledge_graph',
    arguments: {
      action: 'update',
      engine_id: targetEngineId,
      enable_all_knowledge_graphs: true
    }
  });
  console.log('✅ Enable Result:', JSON.parse(resEnable.content[0].text).knowledge_graph);

  console.log('\n--- 2. VERIFYING ENABLED STATUS (action: "get") ---');
  const resGetOn = await client.callTool({
    name: 'gemini_enterprise_manage_knowledge_graph',
    arguments: { action: 'get', engine_id: targetEngineId }
  });
  const getOnData = JSON.parse(resGetOn.content[0].text).knowledge_graph_options;
  console.log('Google Cloud Knowledge Graph :', getOnData.google_cloud_knowledge_graph.enabled ? '✅ ENABLED' : '❌ DISABLED');
  console.log('Private Knowledge Graph      :', getOnData.private_knowledge_graph.enabled ? '✅ ENABLED' : '❌ DISABLED');

  console.log('\n--- 3. DISABLING BOTH KNOWLEDGE GRAPHS (disable_all_knowledge_graphs: true) ---');
  const resDisable = await client.callTool({
    name: 'gemini_enterprise_manage_knowledge_graph',
    arguments: {
      action: 'update',
      engine_id: targetEngineId,
      disable_all_knowledge_graphs: true
    }
  });
  console.log('✅ Disable Result:', JSON.parse(resDisable.content[0].text).knowledge_graph);

  console.log('\n--- 4. VERIFYING DISABLED STATUS (action: "get") ---');
  const resGetOff = await client.callTool({
    name: 'gemini_enterprise_manage_knowledge_graph',
    arguments: { action: 'get', engine_id: targetEngineId }
  });
  const getOffData = JSON.parse(resGetOff.content[0].text).knowledge_graph_options;
  console.log('Google Cloud Knowledge Graph :', getOffData.google_cloud_knowledge_graph.enabled ? '✅ ENABLED' : '❌ DISABLED');
  console.log('Private Knowledge Graph      :', getOffData.private_knowledge_graph.enabled ? '✅ ENABLED' : '❌ DISABLED');

  await client.close();
  console.log('\n🎉 Knowledge Graph MCP Tool Test Suite Completed Successfully!');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Test Error:', err);
  process.exit(1);
});
