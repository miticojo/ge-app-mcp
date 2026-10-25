import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_SHORTCUTS, applyModelUpdates, describeModels } from '../../build/domain/engineModels.js';

// Engine.modelConfigs observed on giorgioc-cloud-apps (read-only GET, 2026-10-25).
const LIVE_FIXTURE = {
  'gemini-2.5-pro': 'MODEL_DISABLED', 'gemini-4-argon': 'MODEL_ENABLED', 'gemini-2.5-flash-image': 'MODEL_DISABLED',
  'gemini-3.6-flash': 'MODEL_DISABLED', 'gemini-3-pro-image': 'MODEL_DISABLED', 'claude-sonnet-5-5': 'MODEL_ENABLED',
  'gemini-3.1-pro-preview': 'MODEL_DISABLED', 'gemini-3.8-flash': 'MODEL_ENABLED', 'gemini-3.7-flash': 'MODEL_DISABLED',
  'claude-opus-5-5': 'MODEL_ENABLED', 'gemini-3.1-flash-image': 'MODEL_ENABLED'
};

test('every typed shortcut maps to a model id observed on a live engine', () => {
  for (const id of Object.values(MODEL_SHORTCUTS)) {
    assert.ok(id in LIVE_FIXTURE, `${id} is not a verified model id`);
  }
});

test('get/update roundtrip uses the same key', () => {
  const out = applyModelUpdates(LIVE_FIXTURE, { enable_gemini_3_6_flash: true });
  assert.equal(out['gemini-3.6-flash'], 'MODEL_ENABLED');
  assert.equal(describeModels(out).model_availability.enable_gemini_3_6_flash, true);
});

test('generic model_configs map supports any model id', () => {
  const out = applyModelUpdates({}, { model_configs: { 'gemini-9-future': true, 'claude-x': false } });
  assert.equal(out['gemini-9-future'], 'MODEL_ENABLED');
  assert.equal(out['claude-x'], 'MODEL_DISABLED');
});

test('model ids are validated', () => {
  assert.throws(() => applyModelUpdates({}, { model_configs: { 'bad id/../x': true } }), /Invalid model id/);
});

test('bulk flags only touch models already configured on the engine (no invented ids)', () => {
  const out = applyModelUpdates({ 'gemini-2.5-pro': 'MODEL_DISABLED' }, { enable_all_models: true });
  assert.deepEqual(out, { 'gemini-2.5-pro': 'MODEL_ENABLED' });
});

test('legacy enable_gemini_3_5_flash fails loudly (its id never existed)', () => {
  assert.throws(() => applyModelUpdates({}, { enable_gemini_3_5_flash: true }), /model_configs/);
});

test('unset models are reported as server default', () => {
  assert.equal(describeModels({}).model_availability.enable_gemini_4_argon, 'SERVER_DEFAULT');
});
