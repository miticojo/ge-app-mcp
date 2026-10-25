import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Live, reversible test of feature toggles and model availability: flips one explicitly
// configured toggle and one configured model, then restores their original values.
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
    MCP_SCOPES: 'admin'
  }
});
const client = new Client({ name: 'test-feature-management', version: '1.0.0' }, { capabilities: {} });

async function call(name, args) {
  const res = await client.callTool({ name, arguments: { engine_id: targetEngineId, ...args } });
  if (res.isError) throw new Error(res.content[0].text);
  return JSON.parse(res.content[0].text);
}

async function run() {
  console.log(`🌌 Feature & model live test on app "${targetEngineId}"`);
  await client.connect(transport);

  // Features: pick a toggle with an explicit value so it can be restored exactly.
  const { features } = await call('gemini_enterprise_manage_features', { action: 'get' });
  console.log(`✓ get: ${features.invalid_keys.length} invalid legacy keys on the engine`);
  const [toggle, original] = Object.entries(features.toggles).find(([, v]) => typeof v === 'boolean') || [];
  assert.ok(toggle, 'engine has no explicitly configured toggle to flip');
  const flipped = await call('gemini_enterprise_manage_features', { action: 'update', [toggle]: !original });
  assert.equal(flipped.features.toggles[toggle], !original);
  const restored = await call('gemini_enterprise_manage_features', { action: 'update', [toggle]: original });
  assert.equal(restored.features.toggles[toggle], original);
  console.log(`✓ ${toggle} flipped and restored to ${original}`);

  // Models: same approach on an explicitly configured model.
  const models = await call('gemini_enterprise_manage_models', { action: 'get' });
  const [modelId, state] = Object.entries(models.raw_model_configs)[0] || [];
  assert.ok(modelId, 'engine has no configured model to flip');
  const wasEnabled = state === 'MODEL_ENABLED';
  const m1 = await call('gemini_enterprise_manage_models', { action: 'update', model_configs: { [modelId]: !wasEnabled } });
  assert.equal(m1.raw_model_configs[modelId], wasEnabled ? 'MODEL_DISABLED' : 'MODEL_ENABLED');
  const m2 = await call('gemini_enterprise_manage_models', { action: 'update', model_configs: { [modelId]: wasEnabled } });
  assert.equal(m2.raw_model_configs[modelId], state);
  console.log(`✓ ${modelId} flipped and restored to ${state}`);

  await client.close();
  console.log('\n🎉 Feature & model live test passed');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Test Error:', err.message);
  process.exit(1);
});
