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
  name: 'verification-suite',
  version: '1.0.0'
}, {
  capabilities: {}
});

async function run() {
  console.log('🌌 Starting Non-Destructive Verification Suite...');
  await client.connect(transport);
  console.log('✅ Connected to MCP Server!\n');

  let activeDataStoreId = null;

  // STEP 1: List DataStores
  try {
    console.log('--- [1/5] Listing DataStores ---');
    const response = await client.callTool({
      name: 'gemini_enterprise_manage_datastore',
      arguments: { action: 'list' }
    });
    
    const resultObj = JSON.parse(response.content[0].text);
    console.log(`Status: ${resultObj.status}`);
    console.log(`Found ${resultObj.count} DataStores.`);
    
    if (resultObj.dataStores && resultObj.dataStores.length > 0) {
      console.log('DataStores:');
      resultObj.dataStores.forEach((ds) => {
        const id = ds.name.split('/').pop();
        console.log(`  - ID: "${id}" (Display Name: ${ds.displayName}, Vertical: ${ds.industryVertical})`);
      });
      // Pick the first datastore for further read-only tests
      activeDataStoreId = resultObj.dataStores[0].name.split('/').pop();
    } else {
      console.log('⚠️ No DataStores found in project. Skipping downstream datastore-specific tests.');
    }
  } catch (err) {
    console.error('❌ Failed to list DataStores:', err.message || err);
  }

  // If we found an active datastore, let's run further safe/read-only validations!
  if (activeDataStoreId) {
    console.log(`\nUsing discovered DataStore "${activeDataStoreId}" for safe verification tests:\n`);

    // STEP 2: Get DataStore Schema
    try {
      console.log(`--- [2/5] Retrieving Schema for "${activeDataStoreId}" ---`);
      const response = await client.callTool({
        name: 'gemini_enterprise_manage_schema',
        arguments: {
          action: 'get',
          datastore_id: activeDataStoreId
        }
      });
      console.log('Schema retrieved successfully:');
      console.log(response.content[0].text);
    } catch (err) {
      console.log(`ℹ️ Schema not defined or endpoint returned error: ${err.message || err}`);
    }

    // STEP 3: List Target Sites (for Website Search datastores)
    try {
      console.log(`\n--- [3/5] Listing Target Sites for "${activeDataStoreId}" ---`);
      const response = await client.callTool({
        name: 'gemini_enterprise_manage_target_sites',
        arguments: {
          action: 'list',
          datastore_id: activeDataStoreId
        }
      });
      console.log('Target Sites response:');
      console.log(response.content[0].text);
    } catch (err) {
      console.log(`ℹ️ Target Sites endpoint returned error (expected if not a Web Search datastore): ${err.message || err}`);
    }

    // STEP 4: List Serving Controls (synonyms, boost/bury rules)
    try {
      console.log(`\n--- [4/5] Listing Serving Controls for "${activeDataStoreId}" ---`);
      const response = await client.callTool({
        name: 'gemini_enterprise_manage_controls',
        arguments: {
          action: 'list',
          datastore_id: activeDataStoreId
        }
      });
      console.log('Serving Controls response:');
      console.log(response.content[0].text);
    } catch (err) {
      console.log(`ℹ/❌ Serving Controls returned error: ${err.message || err}`);
    }

    // STEP 5: Search Query (Data Plane Search verification)
    try {
      const testQuery = 'cloud';
      console.log(`\n--- [5/5] Testing Search Query: "${testQuery}" on "${activeDataStoreId}" ---`);
      const response = await client.callTool({
        name: 'gemini_enterprise_search',
        arguments: {
          query: testQuery,
          datastore_id: activeDataStoreId,
          pageSize: 2
        }
      });
      console.log('Search response received:');
      // Print first 500 characters of search output
      const text = response.content[0].text;
      console.log(text.substring(0, 1000) + (text.length > 1000 ? '\n... (truncated)' : ''));
    } catch (err) {
      console.log(`ℹ/❌ Search Query returned error (expected if datastore is newly created or empty): ${err.message || err}`);
    }
  }

  console.log('\n🏁 Non-Destructive Verification Suite Completed.');
  await client.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal Verification failure:', err);
  process.exit(1);
});
