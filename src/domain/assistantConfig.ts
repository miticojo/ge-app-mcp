/**
 * Gemini Enterprise assistant governance mapped to the real Assistant resource
 * (engines/{engine}/assistants/default_assistant, discoveryengine v1alpha).
 * Replaces the legacy hack that serialized settings into commonConfig.companyName.
 */
const GROUNDING_TYPES: Record<string, string> = {
  GOOGLE_SEARCH: 'WEB_GROUNDING_TYPE_GOOGLE_SEARCH',
  ENTERPRISE_WEB_SEARCH: 'WEB_GROUNDING_TYPE_ENTERPRISE_WEB_SEARCH',
  DISABLED: 'WEB_GROUNDING_TYPE_DISABLED'
};
const MATCH_TYPES = ['SIMPLE_STRING_MATCH', 'WORD_BOUNDARY_STRING_MATCH'];
const FAILURE_MODES = ['FAIL_OPEN', 'FAIL_CLOSED'];
const LEGACY_MARKER = '|| ASST_CFG:';
// The legacy implementation injected this placeholder as a default value.
const LEGACY_PLACEHOLDER_PHRASE = 'testbannedphrase';

function normalizeGroundingType(value: string): string {
  const v = String(value).toUpperCase().replace(/^WEB_GROUNDING_TYPE_/, '');
  if (!GROUNDING_TYPES[v]) throw new Error(`Invalid web_grounding_type "${value}". Use GOOGLE_SEARCH, ENTERPRISE_WEB_SEARCH or DISABLED.`);
  return GROUNDING_TYPES[v];
}

function normalizeBannedPhrase(entry: any) {
  if (typeof entry === 'string') return { phrase: entry, matchType: 'SIMPLE_STRING_MATCH' };
  if (!entry || typeof entry.phrase !== 'string') throw new Error('Each banned phrase must be a string or {phrase, match_type, ignore_diacritics}.');
  const matchType = entry.match_type ?? 'SIMPLE_STRING_MATCH';
  if (!MATCH_TYPES.includes(matchType)) throw new Error(`Invalid banned phrase match_type "${matchType}".`);
  const out: any = { phrase: entry.phrase, matchType };
  if (entry.ignore_diacritics !== undefined) out.ignoreDiacritics = Boolean(entry.ignore_diacritics);
  return out;
}

export function buildAssistantPatch(current: any, args: Record<string, any>) {
  const assistant: any = {};
  const updateMask: string[] = [];
  const generationConfig = () => (assistant.generationConfig ??= {});
  const customerPolicy = () => (assistant.customerPolicy ??= {});

  const bulkOn = args.enable_all_assistant_features === true;
  const bulkOff = args.disable_all_assistant_features === true;
  if (bulkOn && bulkOff) throw new Error('enable_all_assistant_features and disable_all_assistant_features are mutually exclusive.');

  if (args.use_default_system_instruction === true || args.system_instruction !== undefined) {
    generationConfig().systemInstruction = {
      additionalSystemInstruction: args.use_default_system_instruction === true ? '' : String(args.system_instruction)
    };
    updateMask.push('generationConfig.systemInstruction');
  }
  if (args.default_model_id !== undefined) {
    generationConfig().defaultModelId = String(args.default_model_id);
    updateMask.push('generationConfig.defaultModelId');
  }
  if (args.allowed_model_ids !== undefined) {
    if (!Array.isArray(args.allowed_model_ids)) throw new Error('allowed_model_ids must be an array of model ids.');
    generationConfig().allowedModelIds = args.allowed_model_ids.map(String);
    updateMask.push('generationConfig.allowedModelIds');
  }
  if (args.default_language !== undefined) {
    generationConfig().defaultLanguage = String(args.default_language);
    updateMask.push('generationConfig.defaultLanguage');
  }

  const groundingEnabled = bulkOn ? true : bulkOff ? false : args.enable_web_grounding;
  if (groundingEnabled === false) {
    assistant.webGroundingType = GROUNDING_TYPES.DISABLED;
  } else if (args.web_grounding_type !== undefined) {
    assistant.webGroundingType = normalizeGroundingType(args.web_grounding_type);
  } else if (groundingEnabled === true) {
    const existing = current.webGroundingType;
    assistant.webGroundingType = existing && existing !== GROUNDING_TYPES.DISABLED && existing !== 'WEB_GROUNDING_TYPE_UNSPECIFIED'
      ? existing
      : GROUNDING_TYPES.ENTERPRISE_WEB_SEARCH;
  }
  if (assistant.webGroundingType) updateMask.push('webGroundingType');

  const defaultSearchOn = bulkOn ? true : bulkOff ? false : args.default_web_search_state;
  if (typeof defaultSearchOn === 'boolean') {
    assistant.defaultWebGroundingToggleOff = !defaultSearchOn;
    updateMask.push('defaultWebGroundingToggleOff');
  }
  const locationOn = bulkOn ? true : bulkOff ? false : args.enable_location_context;
  if (typeof locationOn === 'boolean') {
    assistant.disableLocationContext = !locationOn;
    updateMask.push('disableLocationContext');
  }
  if (typeof args.enable_knowledge_catalog === 'boolean') {
    assistant.knowledgeCatalogEnabled = args.enable_knowledge_catalog;
    updateMask.push('knowledgeCatalogEnabled');
  }

  if (args.banned_phrases !== undefined) {
    if (!Array.isArray(args.banned_phrases)) throw new Error('banned_phrases must be an array.');
    customerPolicy().bannedPhrases = args.banned_phrases.map(normalizeBannedPhrase);
    updateMask.push('customerPolicy.bannedPhrases');
  }
  if (args.model_armor !== undefined) {
    const ma = args.model_armor || {};
    const cfg: any = {};
    if (ma.user_prompt_template !== undefined) cfg.userPromptTemplate = String(ma.user_prompt_template);
    if (ma.response_template !== undefined) cfg.responseTemplate = String(ma.response_template);
    if (ma.failure_mode !== undefined) {
      if (!FAILURE_MODES.includes(ma.failure_mode)) throw new Error(`Invalid model_armor.failure_mode "${ma.failure_mode}". Use FAIL_OPEN or FAIL_CLOSED.`);
      cfg.failureMode = ma.failure_mode;
    }
    customerPolicy().modelArmorConfig = cfg;
    updateMask.push('customerPolicy.modelArmorConfig');
  }
  if (args.sensitive_data_protection_policy !== undefined) {
    customerPolicy().dataProtectionPolicy = {
      sensitiveDataProtectionPolicy: { policy: String(args.sensitive_data_protection_policy) }
    };
    updateMask.push('customerPolicy.dataProtectionPolicy');
  }

  return { assistant, updateMask };
}

export function parseLegacyCompanyName(companyName: string | undefined) {
  const value = companyName || '';
  const idx = value.indexOf(LEGACY_MARKER);
  if (idx === -1) return { prefix: value, config: null as any };
  const prefix = value.slice(0, idx).trim();
  try {
    return { prefix, config: JSON.parse(value.slice(idx + LEGACY_MARKER.length)) };
  } catch {
    // Unparseable payload: still strip it so the visible company name is restored.
    return { prefix, config: {} };
  }
}

export function legacyToArgs(legacy: any, explicit: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  const setIfAbsent = (key: string, value: any) => {
    if (value !== undefined && explicit[key] === undefined) out[key] = value;
  };
  if (legacy.mode === 'Customize' && legacy.instruction) setIfAbsent('system_instruction', legacy.instruction);
  setIfAbsent('enable_web_grounding', legacy.enableWebGrounding);
  if (legacy.enableWebGrounding !== false) setIfAbsent('web_grounding_type', legacy.webGroundingType);
  setIfAbsent('default_web_search_state', legacy.defaultWebSearchState);
  setIfAbsent('enable_location_context', legacy.enableLocationContext);
  if (Array.isArray(legacy.bannedPhrases)) {
    setIfAbsent('banned_phrases', legacy.bannedPhrases.filter((p: string) => p !== LEGACY_PLACEHOLDER_PHRASE));
  }
  setIfAbsent('chat_history_retention_days', legacy.retentionDays);
  return out;
}

export function describeAssistant(assistant: any, engine: any) {
  const grounding = assistant.webGroundingType;
  return {
    additional_system_instruction: assistant.generationConfig?.systemInstruction?.additionalSystemInstruction ?? '',
    default_model_id: assistant.generationConfig?.defaultModelId,
    allowed_model_ids: assistant.generationConfig?.allowedModelIds,
    default_language: assistant.generationConfig?.defaultLanguage,
    enable_web_grounding: grounding === undefined ? 'SERVER_DEFAULT' : grounding !== GROUNDING_TYPES.DISABLED,
    web_grounding_type: grounding,
    default_web_search_state: assistant.defaultWebGroundingToggleOff === undefined ? 'SERVER_DEFAULT' : !assistant.defaultWebGroundingToggleOff,
    enable_location_context: assistant.disableLocationContext === undefined ? 'SERVER_DEFAULT' : !assistant.disableLocationContext,
    enable_knowledge_catalog: assistant.knowledgeCatalogEnabled ?? 'SERVER_DEFAULT',
    banned_phrases: assistant.customerPolicy?.bannedPhrases ?? [],
    model_armor: assistant.customerPolicy?.modelArmorConfig,
    sensitive_data_protection_policy: assistant.customerPolicy?.dataProtectionPolicy?.sensitiveDataProtectionPolicy?.policy,
    chat_history_retention_days: engine.sessionConfig?.sessionTtl?.days ?? 'SERVER_DEFAULT'
  };
}
