import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssistantPatch, parseLegacyCompanyName, legacyToArgs, describeAssistant } from '../../build/domain/assistantConfig.js';

test('maps admin options to the real Assistant fields with correct polarity', () => {
  const { assistant, updateMask } = buildAssistantPatch({}, {
    system_instruction: 'Be concise.',
    web_grounding_type: 'ENTERPRISE_WEB_SEARCH',
    default_web_search_state: false,
    enable_location_context: false,
    enable_knowledge_catalog: true
  });
  assert.equal(assistant.generationConfig.systemInstruction.additionalSystemInstruction, 'Be concise.');
  assert.equal(assistant.webGroundingType, 'WEB_GROUNDING_TYPE_ENTERPRISE_WEB_SEARCH');
  assert.equal(assistant.defaultWebGroundingToggleOff, true);
  assert.equal(assistant.disableLocationContext, true);
  assert.equal(assistant.knowledgeCatalogEnabled, true);
  assert.deepEqual(updateMask.sort(), ['defaultWebGroundingToggleOff', 'disableLocationContext', 'generationConfig.systemInstruction', 'knowledgeCatalogEnabled', 'webGroundingType'].sort());
});

test('disabling web grounding sets WEB_GROUNDING_TYPE_DISABLED', () => {
  const { assistant } = buildAssistantPatch({ webGroundingType: 'WEB_GROUNDING_TYPE_GOOGLE_SEARCH' }, { enable_web_grounding: false });
  assert.equal(assistant.webGroundingType, 'WEB_GROUNDING_TYPE_DISABLED');
});

test('use_default_system_instruction clears the instruction', () => {
  const { assistant } = buildAssistantPatch({}, { use_default_system_instruction: true });
  assert.equal(assistant.generationConfig.systemInstruction.additionalSystemInstruction, '');
});

test('banned phrases accept strings and structured entries', () => {
  const { assistant } = buildAssistantPatch({}, { banned_phrases: ['secret', { phrase: 'leak', match_type: 'WORD_BOUNDARY_STRING_MATCH', ignore_diacritics: true }] });
  assert.deepEqual(assistant.customerPolicy.bannedPhrases, [
    { phrase: 'secret', matchType: 'SIMPLE_STRING_MATCH' },
    { phrase: 'leak', matchType: 'WORD_BOUNDARY_STRING_MATCH', ignoreDiacritics: true }
  ]);
});

test('model armor and SDP policy map to customerPolicy', () => {
  const { assistant, updateMask } = buildAssistantPatch({}, {
    model_armor: { user_prompt_template: 'projects/p/locations/us/templates/a', response_template: 'projects/p/locations/us/templates/b', failure_mode: 'FAIL_CLOSED' },
    sensitive_data_protection_policy: 'projects/p/locations/global/inspectTemplates/x'
  });
  assert.equal(assistant.customerPolicy.modelArmorConfig.failureMode, 'FAIL_CLOSED');
  assert.equal(assistant.customerPolicy.dataProtectionPolicy.sensitiveDataProtectionPolicy.policy, 'projects/p/locations/global/inspectTemplates/x');
  assert.ok(updateMask.includes('customerPolicy.modelArmorConfig'));
  assert.ok(updateMask.includes('customerPolicy.dataProtectionPolicy'));
});

test('invalid enum values are rejected', () => {
  assert.throws(() => buildAssistantPatch({}, { web_grounding_type: 'BING' }), /web_grounding_type/);
  assert.throws(() => buildAssistantPatch({}, { model_armor: { failure_mode: 'MAYBE' } }), /failure_mode/);
});

test('legacy ASST_CFG suffix is parsed and the company name prefix preserved', () => {
  const legacy = parseLegacyCompanyName('Acme Corp || ASST_CFG:{"mode":"Customize","instruction":"Hi","enableWebGrounding":false,"bannedPhrases":["testbannedphrase","x"],"retentionDays":30}');
  assert.equal(legacy.prefix, 'Acme Corp');
  assert.equal(legacy.config.instruction, 'Hi');
  assert.equal(parseLegacyCompanyName('Acme Corp').config, null);
});

test('legacy values become args, dropping the injected placeholder phrase, and never override explicit args', () => {
  const args = legacyToArgs({ mode: 'Customize', instruction: 'Hi', enableWebGrounding: false, bannedPhrases: ['testbannedphrase', 'x'], retentionDays: 30 }, { enable_web_grounding: true });
  assert.equal(args.system_instruction, 'Hi');
  assert.equal(args.enable_web_grounding, undefined, 'explicit enable_web_grounding must not be overridden by legacy false');
  assert.deepEqual(args.banned_phrases, ['x']);
  assert.equal(args.chat_history_retention_days, 30);
});

test('describeAssistant exposes user-facing options with correct polarity', () => {
  const view = describeAssistant({ webGroundingType: 'WEB_GROUNDING_TYPE_DISABLED', disableLocationContext: true }, { sessionConfig: { sessionTtl: { days: 45 } } });
  assert.equal(view.enable_web_grounding, false);
  assert.equal(view.enable_location_context, false);
  assert.equal(view.chat_history_retention_days, 45);
});
