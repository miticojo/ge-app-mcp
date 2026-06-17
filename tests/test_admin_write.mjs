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
  name: 'admin-write-suite',
  version: '1.0.0'
}, {
  capabilities: {}
});

async function run() {
  console.log('🏗️ Starting Control Plane (Admin) Write & Integration Verification...');
  await client.connect(transport);
  console.log('✅ Connected to MCP Server!\n');

  const datastoreId = 'drive_1712667888845';
  const testControlId = `mcp_test_control_${Math.floor(Math.random() * 10000)}`;

  console.log(`Targeting DataStore: "${datastoreId}"`);
  console.log(`Generated Test Control ID: "${testControlId}"\n`);

  // STEP 1: Test SaaS Connector Configuration (Simulation Tool)
  try {
    console.log('--- [1/4] Configuring SaaS Jira Connector (Mock Flow) ---');
    const response = await client.callTool({
      name: 'gemini_enterprise_configure_connector',
      arguments: {
        datastore_id: datastoreId,
        connector_type: 'jira',
        config_payload: {
          siteUrl: 'https://giorgioc-altostrat.atlassian.net',
          syncInterval: '24h',
          auth: {
            username: 'admin@giorgioc.altostrat.com',
            apiToken: 'mcp-api-token-secret-placeholder'
          }
        }
      }
    });
    
    console.log('SaaS Connector response:');
    console.log(response.content[0].text);
  } catch (err) {
    console.error('❌ SaaS Connector tool call failed:', err.message || err);
  }

  // STEP 2: Create a Serving Control (Live gRPC Write)
  let controlCreated = false;
  try {
    console.log(`\n--- [2/4] Creating a Temporary Serving Control: "${testControlId}" ---`);
    const response = await client.callTool({
      name: 'gemini_enterprise_manage_controls',
      arguments: {
        action: 'create',
        datastore_id: datastoreId,
        control_id: testControlId,
        control_type: 'synonyms'
      }
    });
    
    console.log('Serving Control Creation response:');
    console.log(response.content[0].text);
    controlCreated = true;
  } catch (err) {
    console.error(`❌ Failed to create Serving Control "${testControlId}":`, err.message || err);
  }

  // STEP 3: Verify the Control exists in the List
  if (controlCreated) {
    try {
      console.log(`\n--- [3/4] Listing Serving Controls to Verify "${testControlId}" ---`);
      const response = await client.callTool({
        name: 'gemini_enterprise_manage_controls',
        arguments: {
          action: 'list',
          datastore_id: datastoreId
        }
      });
      
      const result = JSON.parse(response.content[0].text);
      console.log(`Controls count: ${result.count}`);
      const found = result.controls.some(c => c.name.endsWith(`/controls/${testControlId}`));
      if (found) {
        console.log(`✅ Success! Control "${testControlId}" was found in the remote list.`);
      } else {
        console.log(`⚠️ Warning: Control "${testControlId}" was created but not found in list response.`);
      }
    } catch (err) {
      console.error('❌ Failed to list controls during verification:', err.message || err);
    }

    // STEP 4: Clean up - Delete the Serving Control
    try {
      console.log(`\n--- [4/4] Cleaning up: Deleting Serving Control "${testControlId}" ---`);
      const response = await client.callTool({
        name: 'gemini_enterprise_manage_controls',
        arguments: {
          action: 'delete',
          datastore_id: datastoreId,
          control_id: testControlId
        }
      });
      console.log('Serving Control Deletion response:');
      console.log(response.content[0].text);
      console.log(`\n🧹 Clean-up completed. Temporary control "${testControlId}" was removed.`);
    } catch (err) {
      console.error(`❌ Failed to delete Serving Control "${testControlId}":`, err.message || err);
    }
  }

  console.log('\n🏁 Control Plane Verification Completed.');
  await client.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal Admin verification failure:', err);
  process.exit(1);
});
