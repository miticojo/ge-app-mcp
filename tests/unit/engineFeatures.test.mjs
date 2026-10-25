import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURE_TOGGLES,
  VALID_FEATURE_KEYS,
  applyFeatureUpdates,
  describeFeatures,
  findInvalidFeatureKeys
} from '../../build/domain/engineFeatures.js';

// Snapshot of GoogleCloudDiscoveryengineV1alphaEngine.features supported keys (Discovery Document, 2026-10-25).
const SCHEMA_KEYS = 'agent-gallery no-code-agent-builder prompt-gallery model-selector notebook-lm people-search people-search-org-chart bi-directional-audio speech-to-text feedback session-sharing personalization-memory personalization-suggested-highlights mobile-app-access disable-agent-sharing disable-image-generation disable-video-generation disable-onedrive-upload disable-talk-to-content disable-google-drive-upload disable-welcome-emails disable-canvas canvas-workspace canvas-app-builder skills skill-sharing skill-sharing-without-admin-approval disable-projects sobi enable-end-user-sharing-with-groups single-agent-orchestration multi-agent-orchestration cross-product-intelligence workflow-agents in-app-notifications code-extraction remote-vm license-tier-badge'.split(' ');

test('toggle catalogue covers exactly the 38 schema keys', () => {
  assert.deepEqual([...VALID_FEATURE_KEYS].sort(), [...SCHEMA_KEYS].sort());
  assert.equal(Object.keys(FEATURE_TOGGLES).length, 38);
});

test('inverted "disable-*" keys flip polarity, regular keys do not', () => {
  const out = applyFeatureUpdates({}, { enable_projects: true, enable_skills: true, enable_canvas: false });
  assert.equal(out['disable-projects'], 'FEATURE_STATE_OFF');
  assert.equal(out['skills'], 'FEATURE_STATE_ON');
  assert.equal(out['disable-canvas'], 'FEATURE_STATE_ON');
});

test('orchestration toggles write the real schema keys, not the legacy disable-* keys', () => {
  const out = applyFeatureUpdates({}, { enable_single_agent_orchestration: true, enable_multi_agent_orchestration: false });
  assert.equal(out['single-agent-orchestration'], 'FEATURE_STATE_ON');
  assert.equal(out['multi-agent-orchestration'], 'FEATURE_STATE_OFF');
  assert.equal(out['disable-single-agent-orchestration'], undefined);
});

test('untouched keys are preserved as-is', () => {
  const out = applyFeatureUpdates({ 'notebook-lm': 'FEATURE_STATE_OFF' }, { enable_feedback: true });
  assert.equal(out['notebook-lm'], 'FEATURE_STATE_OFF');
  assert.equal(out['feedback'], 'FEATURE_STATE_ON');
});

test('removed legacy parameters fail loudly instead of being silent no-ops', () => {
  assert.throws(() => applyFeatureUpdates({}, { enable_cross_domain_documents: true }), /not a valid Engine feature/);
  assert.throws(() => applyFeatureUpdates({}, { enable_agent_sharing_without_approval: true }), /not a valid Engine feature/);
});

test('enable_all_features never turns on security-sensitive toggles', () => {
  const out = applyFeatureUpdates({}, { enable_all_features: true });
  for (const key of ['remote-vm', 'code-extraction', 'skill-sharing-without-admin-approval', 'sobi']) {
    assert.equal(out[key], undefined, `${key} must not be set by enable_all_features`);
  }
  assert.equal(out['agent-gallery'], 'FEATURE_STATE_ON');
  assert.equal(out['disable-canvas'], 'FEATURE_STATE_OFF');
});

test('disable_all_features disables every toggle', () => {
  const out = applyFeatureUpdates({}, { disable_all_features: true });
  assert.equal(out['remote-vm'], 'FEATURE_STATE_OFF');
  assert.equal(out['disable-projects'], 'FEATURE_STATE_ON');
});

test('bulk flags cannot be combined', () => {
  assert.throws(() => applyFeatureUpdates({}, { enable_all_features: true, disable_all_features: true }), /mutually exclusive/);
});

test('invalid keys stored on a live engine are detected (D6 regression)', () => {
  const live = {
    'disable-multi-agent-orchestration': 'FEATURE_STATE_ON',
    'agent-sharing-without-admin-approval': 'FEATURE_STATE_ON',
    'canvas': 'FEATURE_STATE_ON',
    'notebook-lm': 'FEATURE_STATE_ON'
  };
  assert.deepEqual(findInvalidFeatureKeys(live).sort(), ['agent-sharing-without-admin-approval', 'canvas', 'disable-multi-agent-orchestration']);
});

test('describeFeatures reports server default for unset keys and surfaces the wildcard', () => {
  const view = describeFeatures({ 'disable-projects': 'FEATURE_STATE_OFF', '*': 'FEATURE_STATE_ON' });
  assert.equal(view.toggles.enable_projects, true);
  assert.equal(view.toggles.enable_feedback, 'SERVER_DEFAULT');
  assert.equal(view.wildcard_override, 'FEATURE_STATE_ON');
});
