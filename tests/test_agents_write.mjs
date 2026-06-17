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
  name: 'agents-write-suite',
  version: '1.0.0'
}, {
  capabilities: {}
});

async function run() {
  console.log('🤖 Starting Native Agent CRUD & Lifecycle Verification...');
  await client.connect(transport);
  console.log('✅ Connected to MCP Server!\n');

  const engineId = 'gemini-enterprise-17810154_1781015455895';
  const testAgentId = `mcp-test-agent-${Math.floor(Math.random() * 10000)}`;

  console.log(`Targeting Engine: "${engineId}"`);
  console.log(`Generated Test Agent ID: "${testAgentId}"\n`);

  // STEP 1: List existing agents (Read-only check)
  try {
    console.log('--- [1/4] Listing existing agents ---');
    const response = await client.callTool({
      name: 'gemini_enterprise_manage_agents',
      arguments: {
        action: 'list',
        engine_id: engineId
      }
    });
    
    console.log('List Agents response:');
    console.log(response.content[0].text);
  } catch (err) {
    console.warn('ℹ️ List agents failed or returned empty (expected if no agents exist yet):', err.message || err);
  }

  // STEP 2: Create a native Agent (Live write)
  let agentCreated = false;
  try {
    console.log(`\n--- [2/4] Creating a Temporary Agent: "${testAgentId}" ---`);
    const response = await client.callTool({
      name: 'gemini_enterprise_manage_agents',
      arguments: {
        action: 'create',
        engine_id: engineId,
        agent_id: testAgentId,
        display_name: `MCP Test Agent ${testAgentId}`,
        description: 'A native Gemini Enterprise Agent created for test verification.'
      }
    });
    
    console.log('Agent Creation response:');
    console.log(response.content[0].text);
    agentCreated = true;
  } catch (err) {
    console.error(`❌ Failed to create Agent "${testAgentId}":`, err.message || err);
  }

  // STEP 3: Verify the agent exists by listing and checking, and try to update it
  if (agentCreated) {
    try {
      console.log(`\n--- [3/4] Listing & Updating Agent "${testAgentId}" ---`);
      const listResponse = await client.callTool({
        name: 'gemini_enterprise_manage_agents',
        arguments: {
          action: 'list',
          engine_id: engineId
        }
      });
      
      const result = JSON.parse(listResponse.content[0].text);
      const found = result.agents && result.agents.some(a => a.name.endsWith(`/agents/${testAgentId}`));
      if (found) {
        console.log(`✅ Success! Agent "${testAgentId}" was found in the remote list.`);
      } else {
        console.log(`⚠️ Warning: Agent "${testAgentId}" was created but not found in list response.`);
      }

      console.log(`\nUpdating Agent "${testAgentId}"...`);
      const updateResponse = await client.callTool({
        name: 'gemini_enterprise_manage_agents',
        arguments: {
          action: 'update',
          engine_id: engineId,
          agent_id: testAgentId,
          display_name: `MCP Test Agent ${testAgentId} Updated`,
          description: 'An updated description for the native test agent.'
        }
      });
      console.log('Agent Update response:');
      console.log(updateResponse.content[0].text);
    } catch (err) {
      console.error('❌ Verification or update failed:', err.message || err);
    }

    // STEP 4: Clean up - Delete the Agent
    try {
      console.log(`\n--- [4/4] Cleaning up: Deleting Agent "${testAgentId}" ---`);
      const response = await client.callTool({
        name: 'gemini_enterprise_manage_agents',
        arguments: {
          action: 'delete',
          engine_id: engineId,
          agent_id: testAgentId
        }
      });
      console.log('Agent Deletion response:');
      console.log(response.content[0].text);
      console.log(`\n🧹 Clean-up completed. Temporary agent "${testAgentId}" was removed.`);
    } catch (err) {
      console.error(`❌ Failed to delete Agent "${testAgentId}":`, err.message || err);
    }
  }

  console.log('\n🏁 Native Agent Lifecycle Verification Completed.');
  await client.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal Agent write verification failure:', err);
  process.exit(1);
});
