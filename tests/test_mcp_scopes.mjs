import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '../build/index.js');

async function testWithScopes(scopes) {
  console.log(`\n=============================================`);
  console.log(`🧪 Testing MCP Server with MCP_SCOPES="${scopes}"`);
  console.log(`=============================================`);

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      GCP_PROJECT: 'giorgioc-cloud-apps',
      GCP_LOCATION: 'global',
      GCP_COLLECTION: 'default_collection',
      GOOGLE_CLOUD_QUOTA_PROJECT: 'giorgioc-cloud-apps',
      MCP_SCOPES: scopes
    }
  });

  const client = new Client({
    name: 'scopes-verifier',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  await client.connect(transport);

  // 1. List registered tools
  const response = await client.listTools();
  console.log(`✅ Server registered ${response.tools.length} tools:`);
  response.tools.forEach(t => console.log(`  - ${t.name}`));

  // 2. Verify search tools exist if 'search' scope is present
  const hasSearch = response.tools.some(t => t.name === 'gemini_enterprise_search');
  const hasAdmin = response.tools.some(t => t.name === 'gemini_enterprise_manage_apps');
  const hasBilling = response.tools.some(t => t.name === 'gemini_enterprise_manage_licenses');

  console.log(`\n🔍 Capability Checks:`);
  console.log(`  - Search tools present: ${hasSearch}`);
  console.log(`  - Admin tools present: ${hasAdmin}`);
  console.log(`  - Billing tools present: ${hasBilling}`);

  // 3. Attempt unauthorized execution if admin tools are excluded
  if (!hasAdmin) {
    try {
      console.log(`\n🛡️ Attempting unauthorized call to "gemini_enterprise_manage_apps" (should be blocked)...`);
      const res = await client.callTool({
        name: 'gemini_enterprise_manage_apps',
        arguments: { action: 'list' }
      });
      if (res.isError) {
        console.log(`✅ Success! Server blocked execution: "${res.content[0].text}"`);
      } else {
        console.error('❌ Error: The server allowed an unauthorized tool execution!');
      }
    } catch (err) {
      console.log(`✅ Success! Server blocked execution via exception: "${err.message}"`);
    }
  }

  // 4. Test authorized execution of billing list if billing scope is present
  if (hasBilling) {
    try {
      console.log(`\n💸 Calling authorized billing tool "gemini_enterprise_manage_licenses" (should succeed)...`);
      const res = await client.callTool({
        name: 'gemini_enterprise_manage_licenses',
        arguments: { action: 'list', usernames: ['admin@giorgioc.altostrat.com'] }
      });
      console.log('✅ Success! Billing response:');
      console.log(res.content[0].text);
    } catch (err) {
      console.error(`❌ Error: Billing call failed:`, err);
    }
  }

  await client.close();
}

async function run() {
  // Test 1: Search-only scope
  await testWithScopes('search');

  // Test 2: Search and Billing scopes (excluding Admin)
  await testWithScopes('search,billing');

  // Test 3: Full scope (default)
  await testWithScopes('search,admin,billing');
  
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal scopes test failure:', err);
  process.exit(1);
});
