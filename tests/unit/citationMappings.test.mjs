import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCitationMappings } from '../../build/domain/citationMappings.js';

test('accepts the documented example and default entry inheritance', () => {
  validateCitationMappings({ search_docs: { items: '/results', uri: '/link', title: '/name', snippet: '/summary', id: '/doc_id' } });
  validateCitationMappings({ '': { items: '/results', uri: '/link', title: '/name' }, get_doc: { items: '' } });
});

test('pointers must be empty or start with "/" and be at most 512 chars', () => {
  assert.throws(() => validateCitationMappings({ t: { uri: 'link' } }), /must start with/);
  assert.throws(() => validateCitationMappings({ t: { uri: '/' + 'a'.repeat(512) } }), /512/);
});

test('"~" escapes must be ~0 or ~1', () => {
  validateCitationMappings({ t: { uri: '/a~1b/c~0d' } });
  assert.throws(() => validateCitationMappings({ t: { uri: '/a~2b' } }), /escape/);
});

test('only documented roles are allowed', () => {
  assert.throws(() => validateCitationMappings({ t: { uri: '/u', author: '/a' } }), /Unknown citation role/);
});

test('every covered tool needs a uri, directly or via the default entry', () => {
  assert.throws(() => validateCitationMappings({ t: { title: '/name' } }), /uri/);
  validateCitationMappings({ '': { uri: '/link' }, t: { title: '/name' } });
});

test('at most 101 entries', () => {
  const many = Object.fromEntries(Array.from({ length: 102 }, (_, i) => [`t${i}`, { uri: '/u' }]));
  assert.throws(() => validateCitationMappings(many), /101/);
});
