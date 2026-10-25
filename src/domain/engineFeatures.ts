/**
 * Gemini Enterprise web app feature toggles (Engine.features, discoveryengine v1alpha).
 * Keys mirror the Discovery Document snapshot of 2026-10-25. Keys prefixed with
 * "disable-" have inverted polarity: FEATURE_STATE_ON means the capability is OFF.
 */
export type FeatureState = 'FEATURE_STATE_ON' | 'FEATURE_STATE_OFF';

interface Toggle {
  key: string;
  inverted: boolean;
  label: string;
}

const t = (key: string, label: string): Toggle => ({ key, label, inverted: key.startsWith('disable-') });

export const FEATURE_TOGGLES: Record<string, Toggle> = {
  enable_agent_gallery: t('agent-gallery', 'Agent Gallery'),
  enable_agent_designer: t('no-code-agent-builder', 'Agent Designer (no-code chat agents)'),
  enable_workflow_agents: t('workflow-agents', 'Workflow Builder agents'),
  enable_prompt_gallery: t('prompt-gallery', 'Prompt Gallery'),
  enable_model_selector: t('model-selector', 'Model selector'),
  enable_notebook_lm: t('notebook-lm', 'NotebookLM'),
  enable_people_search: t('people-search', 'People search'),
  enable_people_search_org_chart: t('people-search-org-chart', 'People search org chart'),
  enable_bi_directional_audio: t('bi-directional-audio', 'Bi-directional audio'),
  enable_speech_to_text: t('speech-to-text', 'Voice dictation (speech-to-text)'),
  enable_feedback: t('feedback', 'End-user feedback'),
  enable_session_sharing: t('session-sharing', 'Session sharing'),
  enable_memory: t('personalization-memory', 'Personalization memory'),
  enable_suggested_highlights: t('personalization-suggested-highlights', 'Suggested highlights'),
  enable_mobile_app_access: t('mobile-app-access', 'Mobile app access'),
  enable_agent_sharing: t('disable-agent-sharing', 'Agent sharing'),
  enable_end_user_sharing_with_groups: t('enable-end-user-sharing-with-groups', 'End-user sharing with groups'),
  enable_image_generation: t('disable-image-generation', 'Image generation'),
  enable_video_generation: t('disable-video-generation', 'Video generation'),
  enable_onedrive_upload: t('disable-onedrive-upload', 'OneDrive upload'),
  enable_google_drive_upload: t('disable-google-drive-upload', 'Google Drive upload'),
  enable_talk_to_content: t('disable-talk-to-content', 'Talk to content'),
  enable_welcome_emails: t('disable-welcome-emails', 'Welcome emails'),
  enable_canvas: t('disable-canvas', 'Canvas'),
  enable_canvas_workspace: t('canvas-workspace', 'Canvas workspace'),
  enable_canvas_app_builder: t('canvas-app-builder', 'Canvas app builder'),
  enable_projects: t('disable-projects', 'Projects'),
  enable_skills: t('skills', 'Skills'),
  enable_skill_sharing: t('skill-sharing', 'Skill sharing'),
  enable_skill_sharing_without_approval: t('skill-sharing-without-admin-approval', 'Skill sharing without admin approval'),
  enable_single_agent_orchestration: t('single-agent-orchestration', 'Single-agent orchestration'),
  enable_multi_agent_orchestration: t('multi-agent-orchestration', 'Multi-agent orchestration'),
  enable_cross_product_intelligence: t('cross-product-intelligence', 'Cross-product intelligence'),
  enable_in_app_notifications: t('in-app-notifications', 'In-app notifications'),
  enable_code_extraction: t('code-extraction', 'Code extraction'),
  enable_remote_vm: t('remote-vm', 'Remote VM'),
  enable_license_tier_badge: t('license-tier-badge', 'License tier badge'),
  enable_sobi: t('sobi', '"sobi" (undocumented key)')
};

export const VALID_FEATURE_KEYS = new Set(Object.values(FEATURE_TOGGLES).map(x => x.key));

// Excluded from enable_all_features: they widen the attack surface or bypass admin review,
// so an administrator must turn them on explicitly.
const NOT_IN_SAFE_BULK = new Set(['remote-vm', 'code-extraction', 'skill-sharing-without-admin-approval', 'sobi']);

const REMOVED_PARAMS: Record<string, string> = {
  enable_cross_domain_documents: 'Cross-domain documents is a Google Drive connector setting, not a valid Engine feature key.',
  enable_agent_sharing_without_approval: '"agent-sharing-without-admin-approval" is not a valid Engine feature key; use enable_agent_sharing.'
};

const stateFor = (toggle: Toggle, enabled: boolean): FeatureState =>
  (enabled !== toggle.inverted) ? 'FEATURE_STATE_ON' : 'FEATURE_STATE_OFF';

export function applyFeatureUpdates(current: Record<string, string>, args: Record<string, any>): Record<string, string> {
  for (const [param, reason] of Object.entries(REMOVED_PARAMS)) {
    if (args[param] !== undefined) throw new Error(`${param} is not a valid Engine feature parameter. ${reason}`);
  }
  if (args.enable_all_features === true && args.disable_all_features === true) {
    throw new Error('enable_all_features and disable_all_features are mutually exclusive.');
  }

  const features = { ...current };
  for (const [param, toggle] of Object.entries(FEATURE_TOGGLES)) {
    if (args.enable_all_features === true && !NOT_IN_SAFE_BULK.has(toggle.key)) {
      features[toggle.key] = stateFor(toggle, true);
    } else if (args.disable_all_features === true) {
      features[toggle.key] = stateFor(toggle, false);
    }
    // Explicit per-toggle values always win over bulk flags.
    if (typeof args[param] === 'boolean') {
      features[toggle.key] = stateFor(toggle, args[param]);
    }
  }
  return features;
}

export function findInvalidFeatureKeys(features: Record<string, string>): string[] {
  return Object.keys(features).filter(k => k !== '*' && !VALID_FEATURE_KEYS.has(k));
}

export function describeFeatures(features: Record<string, string>) {
  const toggles: Record<string, boolean | 'SERVER_DEFAULT'> = {};
  for (const [param, toggle] of Object.entries(FEATURE_TOGGLES)) {
    const state = features[toggle.key];
    toggles[param] = state === undefined ? 'SERVER_DEFAULT' : ((state === 'FEATURE_STATE_ON') !== toggle.inverted);
  }
  return {
    toggles,
    wildcard_override: features['*'],
    invalid_keys: findInvalidFeatureKeys(features)
  };
}

export function featureToggleSchemaProperties(): Record<string, any> {
  const props: Record<string, any> = {};
  for (const [param, toggle] of Object.entries(FEATURE_TOGGLES)) {
    props[param] = { type: 'boolean', description: `${toggle.label} (key "${toggle.key}").` };
  }
  return props;
}
