import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_ANNOTATIONS, withAnnotations } from '../../build/annotations.js';
import { searchTools } from '../../build/tools/search.js';
import { adminTools } from '../../build/tools/admin.js';
import { billingTools } from '../../build/tools/billing.js';

const allTools = [...searchTools, ...adminTools, ...billingTools];

test('every tool has annotations', () => {
  for (const tool of allTools) {
    assert.ok(TOOL_ANNOTATIONS[tool.name], `missing annotations for ${tool.name}`);
  }
  assert.equal(Object.keys(TOOL_ANNOTATIONS).length, allTools.length, 'stale annotation entries');
});

test('only pure read tools are readOnly (Gemini Enterprise skips user confirmation for them)', () => {
  const readOnly = allTools.filter(t => TOOL_ANNOTATIONS[t.name].readOnlyHint).map(t => t.name).sort();
  assert.deepEqual(readOnly, [
    'gemini_enterprise_ask',
    'gemini_enterprise_get_document',
    'gemini_enterprise_get_operation',
    'gemini_enterprise_inspect',
    'gemini_enterprise_inspect_licenses',
    'gemini_enterprise_search'
  ]);
});

test('tools that can delete or unassign are flagged destructive', () => {
  for (const name of ['gemini_enterprise_manage_apps', 'gemini_enterprise_manage_datastore', 'gemini_enterprise_manage_documents', 'gemini_enterprise_manage_licenses', 'gemini_enterprise_manage_agents', 'gemini_enterprise_manage_skills']) {
    assert.equal(TOOL_ANNOTATIONS[name].destructiveHint, true, name);
  }
});

test('withAnnotations does not mutate the source definitions', () => {
  const [annotated] = withAnnotations([searchTools[0]]);
  assert.ok(annotated.annotations);
  assert.equal(searchTools[0].annotations, undefined);
});
