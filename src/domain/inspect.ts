/**
 * Pure read-only inspection call builders.
 *
 * Gemini Enterprise requires user confirmation and blocks parallel execution for any tool with
 * readOnlyHint: false. Dedicated inspection tools keep readOnlyHint: true by building a fresh
 * argument object with a hardcoded read action and stripping every mutating field.
 */
export const INSPECT_TARGETS = [
  'apps',
  'app_iam',
  'datastores',
  'datastore_iam',
  'connector',
  'connector_runs',
  'target_sites',
  'schema',
  'controls',
  'agents',
  'features',
  'models',
  'search_ui',
  'assistant',
  'observability',
  'knowledge_graph',
  'skills',
  'skill_revisions'
] as const;

export type InspectTarget = typeof INSPECT_TARGETS[number];

export interface InspectOptions {
  skillsUsable?: boolean;
}

function copyDefined(source: Record<string, any>, keys: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== '') {
      out[key] = source[key];
    }
  }
  return out;
}

function requireString(args: Record<string, any>, key: string, target: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required for target "${target}".`);
  }
  return value;
}

export function buildInspectCall(
  rawArgs: Record<string, any> = {},
  options: InspectOptions = {}
): { toolName: string; cleanArgs: Record<string, any> } {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const target = args.target as InspectTarget;
  if (!INSPECT_TARGETS.includes(target)) {
    throw new Error(`Unsupported inspect target "${String(args.target ?? '')}". Must be one of: ${INSPECT_TARGETS.join(', ')}.`);
  }

  const scope = copyDefined(args, ['project_id', 'location']);
  const skillsUsable = options.skillsUsable ?? true;

  switch (target) {
    case 'apps': {
      const engine = copyDefined(args, ['engine_id']);
      return {
        toolName: 'gemini_enterprise_manage_apps',
        cleanArgs: { action: engine.engine_id ? 'get' : 'list', ...scope, ...engine }
      };
    }
    case 'app_iam': {
      const engine_id = requireString(args, 'engine_id', target);
      return {
        toolName: 'gemini_enterprise_manage_apps',
        cleanArgs: { action: 'get-iam', ...scope, engine_id }
      };
    }
    case 'datastores': {
      const ids = copyDefined(args, ['datastore_id', 'collection_id']);
      return {
        toolName: 'gemini_enterprise_manage_datastore',
        cleanArgs: { action: ids.datastore_id ? 'get' : 'list', ...scope, ...ids }
      };
    }
    case 'datastore_iam': {
      const ids = copyDefined(args, ['datastore_id', 'collection_id']);
      if (!ids.datastore_id && !ids.collection_id) {
        throw new Error('datastore_id or collection_id is required for target "datastore_iam".');
      }
      return {
        toolName: 'gemini_enterprise_manage_datastore',
        cleanArgs: { action: 'get-iam', ...scope, ...ids }
      };
    }
    case 'connector': {
      const collection_id = requireString(args, 'collection_id', target);
      return {
        toolName: 'gemini_enterprise_configure_connector',
        cleanArgs: { action: 'get', ...scope, collection_id }
      };
    }
    case 'connector_runs': {
      const collection_id = requireString(args, 'collection_id', target);
      return {
        toolName: 'gemini_enterprise_configure_connector',
        cleanArgs: { action: 'list_runs', ...scope, collection_id }
      };
    }
    case 'target_sites': {
      const datastore_id = requireString(args, 'datastore_id', target);
      return {
        toolName: 'gemini_enterprise_manage_target_sites',
        cleanArgs: { action: 'list', ...scope, datastore_id }
      };
    }
    case 'schema': {
      const datastore_id = requireString(args, 'datastore_id', target);
      return {
        toolName: 'gemini_enterprise_manage_schema',
        cleanArgs: { action: 'get', ...scope, datastore_id }
      };
    }
    case 'controls': {
      const datastore_id = requireString(args, 'datastore_id', target);
      return {
        toolName: 'gemini_enterprise_manage_controls',
        cleanArgs: { action: 'list', ...scope, datastore_id }
      };
    }
    case 'agents': {
      const engine_id = requireString(args, 'engine_id', target);
      const agent = copyDefined(args, ['agent_id']);
      return {
        toolName: 'gemini_enterprise_manage_agents',
        cleanArgs: { action: agent.agent_id ? 'get' : 'list', ...scope, engine_id, ...agent }
      };
    }
    case 'features':
    case 'models':
    case 'search_ui':
    case 'assistant':
    case 'observability':
    case 'knowledge_graph': {
      const engine_id = requireString(args, 'engine_id', target);
      return {
        toolName: `gemini_enterprise_manage_${target}`,
        cleanArgs: { action: 'get', ...scope, engine_id }
      };
    }
    case 'skills': {
      if (!skillsUsable) {
        throw new Error('Vertex AI Skill Registry requires the cloud-platform OAuth scope, which is not enabled on this HTTP server.');
      }
      const extra = copyDefined(args, ['skill_id', 'query', 'top_k']);
      if (extra.skill_id && extra.query) {
        throw new Error('Provide either skill_id (get) or query (retrieve), not both, for target "skills".');
      }
      if (extra.skill_id) {
        return {
          toolName: 'gemini_enterprise_manage_skills',
          cleanArgs: { action: 'get', ...scope, skill_id: extra.skill_id }
        };
      }
      if (extra.query) {
        return {
          toolName: 'gemini_enterprise_manage_skills',
          cleanArgs: { action: 'retrieve', ...scope, query: extra.query, ...(extra.top_k !== undefined ? { top_k: extra.top_k } : {}) }
        };
      }
      return {
        toolName: 'gemini_enterprise_manage_skills',
        cleanArgs: { action: 'list', ...scope }
      };
    }
    case 'skill_revisions': {
      if (!skillsUsable) {
        throw new Error('Vertex AI Skill Registry requires the cloud-platform OAuth scope, which is not enabled on this HTTP server.');
      }
      const skill_id = requireString(args, 'skill_id', target);
      return {
        toolName: 'gemini_enterprise_manage_skills',
        cleanArgs: { action: 'list_revisions', ...scope, skill_id }
      };
    }
  }
}

export function buildLicenseInspectCall(rawArgs: Record<string, any> = {}): Record<string, any> {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const action = args.action;
  if (action !== 'list' && action !== 'usage_stats') {
    throw new Error(`Unsupported license inspection action "${String(action ?? '')}". Use "list" or "usage_stats".`);
  }
  return {
    action,
    ...copyDefined(args, ['project_id'])
  };
}
