import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSPECT_TARGETS, buildInspectCall, buildLicenseInspectCall } from '../../build/domain/inspect.js';

const READ_ONLY_ADMIN_ACTIONS = new Set(['list', 'get', 'get-iam', 'list_runs', 'retrieve', 'list_revisions']);

test('every inspect target maps to a read-only admin call', () => {
  const sampleArgs = {
    apps: [
      [{}, { toolName: 'gemini_enterprise_manage_apps', cleanArgs: { action: 'list' } }],
      [{ engine_id: 'eng-1' }, { toolName: 'gemini_enterprise_manage_apps', cleanArgs: { action: 'get', engine_id: 'eng-1' } }]
    ],
    app_iam: [
      [{ engine_id: 'eng-1' }, { toolName: 'gemini_enterprise_manage_apps', cleanArgs: { action: 'get-iam', engine_id: 'eng-1' } }]
    ],
    datastores: [
      [{}, { toolName: 'gemini_enterprise_manage_datastore', cleanArgs: { action: 'list' } }],
      [{ datastore_id: 'ds-1', collection_id: 'col-1' }, { toolName: 'gemini_enterprise_manage_datastore', cleanArgs: { action: 'get', datastore_id: 'ds-1', collection_id: 'col-1' } }]
    ],
    datastore_iam: [
      [{ datastore_id: 'ds-1' }, { toolName: 'gemini_enterprise_manage_datastore', cleanArgs: { action: 'get-iam', datastore_id: 'ds-1' } }],
      [{ collection_id: 'col-1' }, { toolName: 'gemini_enterprise_manage_datastore', cleanArgs: { action: 'get-iam', collection_id: 'col-1' } }]
    ],
    connector: [
      [{ collection_id: 'col-1' }, { toolName: 'gemini_enterprise_configure_connector', cleanArgs: { action: 'get', collection_id: 'col-1' } }]
    ],
    connector_runs: [
      [{ collection_id: 'col-1' }, { toolName: 'gemini_enterprise_configure_connector', cleanArgs: { action: 'list_runs', collection_id: 'col-1' } }]
    ],
    target_sites: [
      [{ datastore_id: 'ds-1' }, { toolName: 'gemini_enterprise_manage_target_sites', cleanArgs: { action: 'list', datastore_id: 'ds-1' } }]
    ],
    schema: [
      [{ datastore_id: 'ds-1' }, { toolName: 'gemini_enterprise_manage_schema', cleanArgs: { action: 'get', datastore_id: 'ds-1' } }]
    ],
    controls: [
      [{ datastore_id: 'ds-1' }, { toolName: 'gemini_enterprise_manage_controls', cleanArgs: { action: 'list', datastore_id: 'ds-1' } }]
    ],
    agents: [
      [{ engine_id: 'eng-1' }, { toolName: 'gemini_enterprise_manage_agents', cleanArgs: { action: 'list', engine_id: 'eng-1' } }],
      [{ engine_id: 'eng-1', agent_id: 'ag-1' }, { toolName: 'gemini_enterprise_manage_agents', cleanArgs: { action: 'get', engine_id: 'eng-1', agent_id: 'ag-1' } }]
    ],
    features: [
      [{ engine_id: 'eng-1' }, { toolName: 'gemini_enterprise_manage_features', cleanArgs: { action: 'get', engine_id: 'eng-1' } }]
    ],
    models: [
      [{ engine_id: 'eng-1' }, { toolName: 'gemini_enterprise_manage_models', cleanArgs: { action: 'get', engine_id: 'eng-1' } }]
    ],
    search_ui: [
      [{ engine_id: 'eng-1' }, { toolName: 'gemini_enterprise_manage_search_ui', cleanArgs: { action: 'get', engine_id: 'eng-1' } }]
    ],
    assistant: [
      [{ engine_id: 'eng-1' }, { toolName: 'gemini_enterprise_manage_assistant', cleanArgs: { action: 'get', engine_id: 'eng-1' } }]
    ],
    observability: [
      [{ engine_id: 'eng-1' }, { toolName: 'gemini_enterprise_manage_observability', cleanArgs: { action: 'get', engine_id: 'eng-1' } }]
    ],
    knowledge_graph: [
      [{ engine_id: 'eng-1' }, { toolName: 'gemini_enterprise_manage_knowledge_graph', cleanArgs: { action: 'get', engine_id: 'eng-1' } }]
    ],
    skills: [
      [{}, { toolName: 'gemini_enterprise_manage_skills', cleanArgs: { action: 'list' } }],
      [{ skill_id: 'sk-1' }, { toolName: 'gemini_enterprise_manage_skills', cleanArgs: { action: 'get', skill_id: 'sk-1' } }],
      [{ query: 'deploy', top_k: 5 }, { toolName: 'gemini_enterprise_manage_skills', cleanArgs: { action: 'retrieve', query: 'deploy', top_k: 5 } }]
    ],
    skill_revisions: [
      [{ skill_id: 'sk-1' }, { toolName: 'gemini_enterprise_manage_skills', cleanArgs: { action: 'list_revisions', skill_id: 'sk-1' } }]
    ]
  };

  assert.deepEqual(Object.keys(sampleArgs).sort(), [...INSPECT_TARGETS].sort());

  for (const [target, cases] of Object.entries(sampleArgs)) {
    for (const [input, expected] of cases) {
      const result = buildInspectCall({ target, ...input }, { skillsUsable: true });
      assert.deepEqual(result, expected, `target=${target}`);
      assert.ok(READ_ONLY_ADMIN_ACTIONS.has(result.cleanArgs.action), `non-read action ${result.cleanArgs.action}`);
    }
  }
});

test('buildInspectCall strips every mutating field from caller arguments', () => {
  const poisoned = {
    target: 'features',
    engine_id: 'eng-1',
    project_id: 'proj-1',
    location: 'global',
    action: 'cleanup_invalid_keys',
    dry_run: false,
    enable_all_features: true,
    policy: { bindings: [] },
    schema_object: { type: 'object' },
    usernames: ['victim@example.com']
  };
  const { toolName, cleanArgs } = buildInspectCall(poisoned, { skillsUsable: true });
  assert.equal(toolName, 'gemini_enterprise_manage_features');
  assert.deepEqual(cleanArgs, {
    action: 'get',
    engine_id: 'eng-1',
    project_id: 'proj-1',
    location: 'global'
  });
});

test('buildInspectCall validates required identifiers per target', () => {
  assert.throws(() => buildInspectCall({}), /target/);
  assert.throws(() => buildInspectCall({ target: 'unknown' }), /target/);
  assert.throws(() => buildInspectCall({ target: 'app_iam' }), /engine_id/);
  assert.throws(() => buildInspectCall({ target: 'features' }), /engine_id/);
  assert.throws(() => buildInspectCall({ target: 'agents' }), /engine_id/);
  assert.throws(() => buildInspectCall({ target: 'datastore_iam' }), /datastore_id or collection_id/);
  assert.throws(() => buildInspectCall({ target: 'connector' }), /collection_id/);
  assert.throws(() => buildInspectCall({ target: 'connector_runs' }), /collection_id/);
  assert.throws(() => buildInspectCall({ target: 'target_sites' }), /datastore_id/);
  assert.throws(() => buildInspectCall({ target: 'schema' }), /datastore_id/);
  assert.throws(() => buildInspectCall({ target: 'controls' }), /datastore_id/);
  assert.throws(() => buildInspectCall({ target: 'skill_revisions' }, { skillsUsable: true }), /skill_id/);
  assert.throws(() => buildInspectCall({ target: 'skills', skill_id: 's1', query: 'q' }, { skillsUsable: true }), /either skill_id.*or query/i);
});

test('buildInspectCall blocks skill targets when cloud-platform scope is unavailable', () => {
  assert.throws(() => buildInspectCall({ target: 'skills' }, { skillsUsable: false }), /cloud-platform/);
  assert.throws(() => buildInspectCall({ target: 'skill_revisions', skill_id: 'sk-1' }, { skillsUsable: false }), /cloud-platform/);
});

test('buildLicenseInspectCall permits only list and usage_stats and strips write fields', () => {
  assert.deepEqual(
    buildLicenseInspectCall({ action: 'list', project_id: 'p1', usernames: ['a@b.com'], subscription_id: 'sub1' }),
    { action: 'list', project_id: 'p1' }
  );
  assert.deepEqual(
    buildLicenseInspectCall({ action: 'usage_stats' }),
    { action: 'usage_stats' }
  );
  assert.throws(() => buildLicenseInspectCall({ action: 'assign', usernames: ['a@b.com'] }), /list.*usage_stats/);
  assert.throws(() => buildLicenseInspectCall({ action: 'unassign', usernames: ['a@b.com'] }), /list.*usage_stats/);
  assert.throws(() => buildLicenseInspectCall({}), /list.*usage_stats/);
});
