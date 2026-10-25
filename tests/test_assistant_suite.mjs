import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Live, reversible test of gemini_enterprise_manage_assistant against the real
// default_assistant resource. Only the additional system instruction is changed
// and it is restored to its original value at the end.
const __dirname = dirname(fileURLToPath(import.meta.url));
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
    GCP_PROJECT: process.env.GCP_PROJECT || 'giorgioc-cloud-apps',
    GCP_LOCATION: process.env.GCP_LOCATION || 'global',
    GCP_COLLECTION: process.env.GCP_COLLECTION || 'default_collection',
    MCP_SCOPES: 'admin'
  }
});
const client = new Client({ name: 'test-assistant-suite', version: '1.0.0' }, { capabilities: {} });

async function call(args) {
  const res = await client.callTool({ name: 'gemini_enterprise_manage_assistant', arguments: { engine_id: targetEngineId, ...args } });
  if (res.isError) throw new Error(res.content[0].text);
  return JSON.parse(res.content[0].text);
}

async function run() {
  console.log(`🌌 Assistant live test on app "${targetEngineId}"`);
  await client.connect(transport);

  const before = (await call({ action: 'get' })).assistant_options;
  const original = before.additional_system_instruction || '';
  console.log('✓ get: web grounding =', before.web_grounding_type);

  const marker = `[ge-app-mcp test ${Date.now()}]`;
  const updated = await call({ action: 'update', system_instruction: marker });
  assert.equal(updated.assistant_options.additional_system_instruction, marker);
  console.log('✓ update persisted on the real Assistant resource');

  const restored = original
    ? await call({ action: 'update', system_instruction: original })
    : await call({ action: 'update', use_default_system_instruction: true });
  assert.equal(restored.assistant_options.additional_system_instruction, original);
  console.log('✓ original system instruction restored');

  await client.close();
  console.log('\n🎉 Assistant live test passed');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Test Error:', err.message);
  process.exit(1);
});
