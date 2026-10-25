/**
 * Gemini Enterprise model availability (Engine.modelConfigs, discoveryengine v1alpha).
 * modelConfigs is an open map: the schema does not enumerate model ids, so typed shortcuts
 * are limited to ids observed on a live engine (2026-10-25); anything else goes through
 * the generic model_configs map.
 */
export type ModelState = 'MODEL_ENABLED' | 'MODEL_DISABLED';

export const MODEL_SHORTCUTS: Record<string, string> = {
  enable_gemini_4_argon: 'gemini-4-argon',
  enable_gemini_3_8_flash: 'gemini-3.8-flash',
  enable_gemini_3_7_flash: 'gemini-3.7-flash',
  enable_gemini_3_6_flash: 'gemini-3.6-flash',
  enable_gemini_3_1_pro: 'gemini-3.1-pro-preview',
  enable_gemini_2_5_pro: 'gemini-2.5-pro',
  enable_gemini_3_1_flash_image: 'gemini-3.1-flash-image',
  enable_gemini_3_pro_image: 'gemini-3-pro-image',
  enable_gemini_2_5_flash_image: 'gemini-2.5-flash-image',
  enable_claude_opus_5_5: 'claude-opus-5-5',
  enable_claude_sonnet_5_5: 'claude-sonnet-5-5'
};

const MODEL_ID = /^[a-z0-9][a-z0-9.\-]{1,62}$/;
const state = (enabled: boolean): ModelState => (enabled ? 'MODEL_ENABLED' : 'MODEL_DISABLED');

export function applyModelUpdates(current: Record<string, string>, args: Record<string, any>): Record<string, string> {
  if (args.enable_gemini_3_5_flash !== undefined) {
    throw new Error('enable_gemini_3_5_flash was removed: its model id never existed on Gemini Enterprise engines. Use model_configs with the exact model id.');
  }
  if (args.enable_all_models === true && args.disable_all_models === true) {
    throw new Error('enable_all_models and disable_all_models are mutually exclusive.');
  }

  const models = { ...current };
  // Bulk flags only touch ids already configured on the engine, never invented ones.
  if (args.enable_all_models === true || args.disable_all_models === true) {
    for (const id of Object.keys(models)) models[id] = state(args.enable_all_models === true);
  }
  for (const [param, id] of Object.entries(MODEL_SHORTCUTS)) {
    if (typeof args[param] === 'boolean') models[id] = state(args[param]);
  }
  if (args.model_configs !== undefined) {
    if (typeof args.model_configs !== 'object' || args.model_configs === null) {
      throw new Error('model_configs must be an object mapping model ids to booleans.');
    }
    for (const [id, enabled] of Object.entries(args.model_configs)) {
      if (!MODEL_ID.test(id)) throw new Error(`Invalid model id "${id}".`);
      if (typeof enabled !== 'boolean') throw new Error(`model_configs["${id}"] must be a boolean.`);
      models[id] = state(enabled);
    }
  }
  return models;
}

export function describeModels(models: Record<string, string>) {
  const availability: Record<string, boolean | 'SERVER_DEFAULT'> = {};
  for (const [param, id] of Object.entries(MODEL_SHORTCUTS)) {
    availability[param] = models[id] === undefined ? 'SERVER_DEFAULT' : models[id] === 'MODEL_ENABLED';
  }
  return { model_availability: availability, raw_model_configs: models };
}

export function modelSchemaProperties(): Record<string, any> {
  const props: Record<string, any> = {};
  for (const [param, id] of Object.entries(MODEL_SHORTCUTS)) {
    props[param] = { type: 'boolean', description: `Toggle "${id}".` };
  }
  return props;
}
