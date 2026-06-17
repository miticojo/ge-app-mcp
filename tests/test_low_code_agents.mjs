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
  name: 'lowcode-agents-test',
  version: '1.0.0'
}, {
  capabilities: {}
});

async function run() {
  console.log('🤖 Connecting to MCP Server...');
  await client.connect(transport);
  console.log('✅ Connected to MCP Server!\n');

  const engineId = 'gemini-enterprise-17810154_1781015455895';
  const testAgentId = `lowcode-test-${Math.floor(Math.random() * 10000)}`;

  console.log(`Targeting Engine: "${engineId}"`);
  console.log(`Generating Temporary Low-Code Agent ID: "${testAgentId}"\n`);

  // STEP 1: Create a Low-Code Agent
  let created = false;
  try {
    console.log(`--- [1/3] Creating Low-Code Agent with Sub-agent: "${testAgentId}" ---`);
    const response = await client.callTool({
      name: 'gemini_enterprise_manage_agents',
      arguments: {
        action: 'create',
        engine_id: engineId,
        agent_id: testAgentId,
        display_name: `MCP LowCode Test ${testAgentId}`,
        description: 'A native low-code test agent with a sub-agent node created programmatically via MCP.',
        agent_type: 'low-code',
        model: 'gemini-3.5-flash',
        instruction: 'You are a specialized enterprise assistant. When asked about specific help routing, forward to GECX Expert or test_sub_agent.',
        tools: ['googleSearch'],
        subagents: [
          {
            agent_id: 'test_sub_agent',
            display_name: 'Test Sub Agent Node',
            description: 'A programmatically created test sub-agent node.',
            model: 'gemini-3.5-flash',
            instruction: 'When routing here, respond in English with specific help on testing.',
            tools: ['googleSearch']
          }
        ]
      }
    });

    console.log('Create Response:');
    console.log(response.content[0].text);
    created = true;
  } catch (err) {
    console.error('❌ Low-code agent creation failed:', err.message || err);
  }

  // STEP 2: List agents and verify presence
  if (created) {
    try {
      console.log('\n--- [2/3] Verifying agent in roster list ---');
      const response = await client.callTool({
        name: 'gemini_enterprise_manage_agents',
        arguments: {
          action: 'list',
          engine_id: engineId
        }
      });

      const result = JSON.parse(response.content[0].text);
      const agents = result.agents || [];
      const found = agents.find(a => a.name.endsWith(`/agents/${testAgentId}`));
      if (found) {
        console.log(`✅ Success! Agent "${testAgentId}" is present in list output.`);
        console.log('Roster details of the newly created agent:');
        console.log(JSON.stringify(found, null, 2));
      } else {
        console.warn(`⚠️ Warning: Agent "${testAgentId}" was not found in listing output!`);
      }
    } catch (err) {
      console.error('❌ Listing verification failed:', err.message || err);
    }

    // STEP 3: Clean up and delete
    try {
      console.log(`\n--- [3/3] Deleting Temporary Low-Code Agent: "${testAgentId}" ---`);
      const response = await client.callTool({
        name: 'gemini_enterprise_manage_agents',
        arguments: {
          action: 'delete',
          engine_id: engineId,
          agent_id: testAgentId
        }
      });

      console.log('Delete Response:');
      console.log(response.content[0].text);
      console.log(`\n🧹 Clean-up completed. Temporary agent "${testAgentId}" was deleted successfully.`);
    } catch (err) {
      console.error(`❌ Failed to delete temporary agent "${testAgentId}":`, err.message || err);
    }
  }

  console.log('\n🏁 Low-Code Agents Integration Test Finished.');
  await client.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
