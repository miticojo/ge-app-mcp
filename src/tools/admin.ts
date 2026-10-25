import {
  EngineServiceClient,
  DataStoreServiceClient,
  DocumentServiceClient,
  SchemaServiceClient,
  ControlServiceClient,
  SiteSearchEngineServiceClient,
  ServingConfigServiceClient
} from '@google-cloud/discoveryengine';
import { config } from '../config.js';
import { applyFeatureUpdates, describeFeatures, findInvalidFeatureKeys, featureToggleSchemaProperties } from '../domain/engineFeatures.js';
import { applyModelUpdates, describeModels, modelSchemaProperties } from '../domain/engineModels.js';
import { buildAssistantPatch, describeAssistant, legacyToArgs, parseLegacyCompanyName } from '../domain/assistantConfig.js';
import { validateCitationMappings } from '../domain/citationMappings.js';
import { getAuthHeaders, gapicClientOptions, discoveryEngineHost, discoveryEngineBaseUrl, fetchJson } from '../gcp.js';

// Define MCP Tool schemas
export const adminTools: any[] = [
  {
    name: 'gemini_enterprise_manage_apps',
    description: 'Manage Gemini Enterprise search and chat apps (engines). Supports create, list, delete, update, get, get-iam, and set-iam operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete', 'update', 'get', 'get-iam', 'set-iam'],
          description: 'The action to perform: create, list, delete, update, get, get-iam, or set-iam.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID (overrides default).'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region (overrides default, e.g., "global" or "us").'
        },
        engine_id: {
          type: 'string',
          description: 'ID of the app/engine. Required for create, delete, update, get-iam, and set-iam.'
        },
        display_name: {
          type: 'string',
          description: 'Display name of the app/engine. Required for create and update.'
        },
        solution_type: {
          type: 'string',
          description: 'Required for create. Type of engine (e.g., "SOLUTION_TYPE_SEARCH", "SOLUTION_TYPE_CHAT", "SOLUTION_TYPE_RECOMMENDATION").'
        },
        policy: {
          type: 'object',
          description: 'Required for set-iam. The IAM policy object to set for the app/engine.'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'gemini_enterprise_manage_datastore',
    description: 'Manage Gemini Enterprise DataStores. Supports create, list, and delete operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete'],
          description: 'The action to perform: create, list, or delete.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID (overrides default).'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region (overrides default).'
        },
        datastore_id: {
          type: 'string',
          description: 'ID of the DataStore. Required for create and delete.'
        },
        industry_vertical: {
          type: 'string',
          description: 'Optional. Industry vertical for the DataStore (e.g., "GENERIC", "MEDIA"). Defaults to "GENERIC".'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'gemini_enterprise_configure_connector',
    description: 'Manage the data connector of a connector collection (third-party SaaS or custom MCP data stores): get, setup, update_citation_mappings, list_runs, start_run.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'setup', 'update_citation_mappings', 'list_runs', 'start_run'],
          description: 'get, setup (create collection + connector, returns an operation), update_citation_mappings (custom MCP data stores), list_runs, or start_run.'
        },
        collection_id: { type: 'string', description: 'ID of the connector collection. Required.' },
        collection_display_name: { type: 'string', description: 'For setup. Human readable collection name.' },
        data_connector: { type: 'object', description: 'For setup. DataConnector resource body (dataSource, params, entities, refreshInterval, ...).' },
        citation_mappings: {
          type: 'object',
          description: 'For update_citation_mappings. Tool name ("" = default) -> {items, uri, title, snippet, id} RFC 6901 JSON Pointers. Replaces the whole mapping.'
        },
        entities: { type: 'array', items: { type: 'string' }, description: 'For start_run. Entities to sync (all if omitted).' },
        force_refresh_content: { type: 'boolean', description: 'For start_run. Re-ingest all content.' },
        project_id: { type: 'string', description: 'Optional. Google Cloud Project ID.' },
        location: { type: 'string', description: 'Optional. Google Cloud Region.' }
      },
      required: ['action', 'collection_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_target_sites',
    description: 'Manage Target Sites for website search engines. Supports create, list, and delete operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete'],
          description: 'The action to perform: create, list, or delete.'
        },
        datastore_id: {
          type: 'string',
          description: 'The target DataStore ID.'
        },
        url: {
          type: 'string',
          description: 'The website target site URL or glob pattern (e.g. "https://example.com/*"). Required for create and delete.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        }
      },
      required: ['action', 'datastore_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_documents',
    description: 'Import, delete, or purge documents within a DataStore. Supports import (from GCS or BigQuery), purge (delete all), and delete (single document).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['import', 'purge', 'delete'],
          description: 'The action to perform: import, purge, or delete.'
        },
        datastore_id: {
          type: 'string',
          description: 'The ID of the target DataStore.'
        },
        gcs_uri: {
          type: 'string',
          description: 'Optional. Cloud Storage URI for import (e.g., "gs://my-bucket/documents/*"). Required for import if bq_dataset is not provided.'
        },
        bq_dataset: {
          type: 'string',
          description: 'Optional. BigQuery source table for import (e.g., "my-project.my_dataset.my_table"). Required for import if gcs_uri is not provided.'
        },
        document_id: {
          type: 'string',
          description: 'Optional. The specific document ID to delete. Required for delete action.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        }
      },
      required: ['action', 'datastore_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_schema',
    description: 'Manage schemas for DataStores. Supports create, get, and update operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'get', 'update'],
          description: 'The action to perform: create, get, or update.'
        },
        datastore_id: {
          type: 'string',
          description: 'The ID of the DataStore.'
        },
        schema_object: {
          type: 'object',
          description: 'Optional. The JSON Schema object definition. Required for create and update.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        }
      },
      required: ['action', 'datastore_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_controls',
    description: 'Manage Serving Controls (e.g. boost, filter, redirect, synonyms) for serving configs. Supports create, list, and delete.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete'],
          description: 'The action to perform: create, list, or delete.'
        },
        datastore_id: {
          type: 'string',
          description: 'The ID of the DataStore.'
        },
        control_id: {
          type: 'string',
          description: 'ID of the control. Required for create and delete.'
        },
        control_type: {
          type: 'string',
          description: 'Optional. Type of control to create (e.g., "boost", "filter", "redirect", "synonyms", "promote").'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        }
      },
      required: ['action', 'datastore_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_agents',
    description: 'Manage native Google Cloud Discovery Engine Agents under an engine/app. Supports both custom Agent-to-Agent (A2A) and native employee-made low-code agents.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete', 'update'],
          description: 'The administrative agent action to perform: create, list, delete, or update.'
        },
        engine_id: {
          type: 'string',
          description: 'The ID of the engine (app) this agent belongs to.'
        },
        agent_id: {
          type: 'string',
          description: 'Unique ID to assign or target for the agent. Required for create, delete, and update actions.'
        },
        display_name: {
          type: 'string',
          description: 'Display name of the agent. Used for create and update.'
        },
        description: {
          type: 'string',
          description: 'A detailed description of the agent, explaining its instructions and scope.'
        },
        agent_type: {
          type: 'string',
          enum: ['a2a', 'low-code'],
          description: 'Optional. The type of agent to manage: "a2a" for Agent-to-Agent or "low-code" for native employee-made designer playbooks. Defaults to "a2a".'
        },
        endpoint_url: {
          type: 'string',
          description: 'The HTTPS URL endpoint where the custom A2A agent logic is hosted. Only used if agent_type is "a2a".'
        },
        model: {
          type: 'string',
          description: 'The LLM model used by low-code agents (e.g., "gemini-3.5-flash", "gemini-1.5-pro").'
        },
        instruction: {
          type: 'string',
          description: 'Natural language instructions/playbook for the low-code agent.'
        },
        datastores: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional. List of DataStore IDs to link to the low-code agent.'
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional. List of native tools to enable for the low-code agent (e.g., ["googleSearch"]).'
        },
        subagents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agent_id: {
                type: 'string',
                description: 'Unique ID for the sub-agent node (e.g., "gecx_expert").'
              },
              display_name: {
                type: 'string',
                description: 'Optional. Display name of the sub-agent node.'
              },
              description: {
                type: 'string',
                description: 'Optional. Brief description of this sub-agent.'
              },
              model: {
                type: 'string',
                description: 'Optional. LLM model for the sub-agent (e.g., "gemini-3.5-flash").'
              },
              instruction: {
                type: 'string',
                description: 'Natural language instruction/playbook for this sub-agent.'
              },
              datastores: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional. List of DataStore IDs to link to this sub-agent.'
              },
              tools: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional. List of native tools to enable for this sub-agent.'
              }
            },
            required: ['agent_id', 'instruction']
          },
          description: 'Optional. Nested sub-agents to register under this low-code agent.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region (defaults to global).'
        }
      },
      required: ['action', 'engine_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_skills',
    description: 'Manage Vertex AI platform Skills inside the Skill Registry. Supports create, list, delete, and patch operations.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'delete', 'patch'],
          description: 'The administrative skill action to perform: create, list, delete, or patch.'
        },
        skill_id: {
          type: 'string',
          description: 'Unique ID of the skill. Required for create, delete, and patch actions.'
        },
        display_name: {
          type: 'string',
          description: 'Display name of the skill. Used for create and patch.'
        },
        description: {
          type: 'string',
          description: 'A detailed description of what the skill does.'
        },
        zipped_filesystem: {
          type: 'string',
          description: 'Base64 encoded string of the ZIP archive containing the skill files (e.g. SKILL.md). Required for create.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region (defaults to us-central1).'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'gemini_enterprise_manage_features',
    description: 'Get or update Gemini Enterprise web app feature toggles (Engine.features), or remove invalid legacy keys stored on the engine.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'update', 'cleanup_invalid_keys'],
          description: 'get, update, or cleanup_invalid_keys (removes keys not supported by the API; dry run unless dry_run is false).'
        },
        project_id: { type: 'string', description: 'Optional. Google Cloud Project ID.' },
        location: { type: 'string', description: 'Optional. Google Cloud Region.' },
        engine_id: { type: 'string', description: 'ID of the app/engine. Required.' },
        ...featureToggleSchemaProperties(),
        enable_all_features: { type: 'boolean', description: 'Enable all toggles except remote-vm, code-extraction, skill sharing without approval and sobi.' },
        disable_all_features: { type: 'boolean', description: 'Disable all toggles.' },
        dry_run: { type: 'boolean', description: 'For cleanup_invalid_keys. Defaults to true (report only).' }
      },
      required: ['action', 'engine_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_models',
    description: 'Get or update Gemini Enterprise model availability (Engine.modelConfigs). Anthropic models also require pay-as-you-go overages.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'update'], description: 'get or update.' },
        project_id: { type: 'string', description: 'Optional. Google Cloud Project ID.' },
        location: { type: 'string', description: 'Optional. Google Cloud Region.' },
        engine_id: { type: 'string', description: 'The target App / Engine ID.' },
        ...modelSchemaProperties(),
        model_configs: {
          type: 'object',
          additionalProperties: { type: 'boolean' },
          description: 'Optional. Map of exact model id to enabled flag, for models without a shortcut (e.g. {"gemini-3.8-flash": true}).'
        },
        enable_all_models: { type: 'boolean', description: 'Enable every model already configured on the engine.' },
        disable_all_models: { type: 'boolean', description: 'Disable every model already configured on the engine.' }
      },
      required: ['action', 'engine_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_search_ui',
    description: 'Manage Gemini Enterprise Search UI configurations, autocomplete suggestions, user feedback settings, and pinned links (shortcuts).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'update_autocomplete', 'update_feedback', 'manage_pinned_link'],
          description: 'The action to perform: get, update_autocomplete, update_feedback, or manage_pinned_link.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        },
        engine_id: {
          type: 'string',
          description: 'ID of the app/engine. Required.'
        },
        enable_autocomplete: {
          type: 'boolean',
          description: 'Enable or disable autocomplete suggestions.'
        },
        enable_user_feedback: {
          type: 'boolean',
          description: 'Enable or disable user feedback rating widget.'
        },
        pinned_link: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title or link text for the shortcut link.' },
            uri: { type: 'string', description: 'Target URL for the shortcut link (e.g. https://www.example.com/).' },
            link_id: { type: 'string', description: 'Optional unique ID for the shortcut link control.' }
          },
          required: ['title', 'uri']
        }
      },
      required: ['action', 'engine_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_assistant',
    description: 'Get or update Gemini Enterprise assistant governance (default_assistant): system instructions, models, web grounding, location context, Knowledge Catalog, banned phrases, Model Armor, Sensitive Data Protection and chat history retention.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'update'], description: 'get or update.' },
        project_id: { type: 'string', description: 'Optional. Google Cloud Project ID.' },
        location: { type: 'string', description: 'Optional. Google Cloud Region.' },
        engine_id: { type: 'string', description: 'ID of the app/engine. Required.' },
        system_instruction: { type: 'string', description: 'Additional LLM system instructions.' },
        use_default_system_instruction: { type: 'boolean', description: 'true clears the additional system instructions.' },
        default_model_id: { type: 'string', description: 'Default model id for the assistant.' },
        allowed_model_ids: { type: 'array', items: { type: 'string' }, description: 'Model ids users may select.' },
        default_language: { type: 'string', description: 'Default response language code.' },
        enable_web_grounding: { type: 'boolean', description: 'Allow web search results as answer sources.' },
        web_grounding_type: { type: 'string', enum: ['GOOGLE_SEARCH', 'ENTERPRISE_WEB_SEARCH', 'DISABLED'], description: 'ENTERPRISE_WEB_SEARCH is data-residency compliant; GOOGLE_SEARCH is not.' },
        default_web_search_state: { type: 'boolean', description: 'Whether web search is on by default for new queries.' },
        enable_location_context: { type: 'boolean', description: 'Use the user location to improve answers.' },
        enable_knowledge_catalog: { type: 'boolean', description: 'Enable Knowledge Catalog integration (Preview).' },
        banned_phrases: {
          type: 'array',
          items: {
            anyOf: [
              { type: 'string' },
              { type: 'object', properties: { phrase: { type: 'string' }, match_type: { type: 'string', enum: ['SIMPLE_STRING_MATCH', 'WORD_BOUNDARY_STRING_MATCH'] }, ignore_diacritics: { type: 'boolean' } }, required: ['phrase'] }
            ]
          },
          description: 'Replaces the banned phrase list.'
        },
        model_armor: {
          type: 'object',
          properties: {
            user_prompt_template: { type: 'string' },
            response_template: { type: 'string' },
            failure_mode: { type: 'string', enum: ['FAIL_OPEN', 'FAIL_CLOSED'] }
          },
          description: 'Model Armor template resource names applied to prompts and responses.'
        },
        sensitive_data_protection_policy: { type: 'string', description: 'Sensitive Data Protection policy resource name.' },
        chat_history_retention_days: { type: 'number', description: 'Chat history retention for new sessions, in days (Engine.sessionConfig.sessionTtl).' },
        enable_all_assistant_features: { type: 'boolean', description: 'Enable web grounding, default web search and location context.' },
        disable_all_assistant_features: { type: 'boolean', description: 'Disable web grounding, default web search and location context.' }
      },
      required: ['action', 'engine_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_observability',
    description: 'Manage Observability, analytics tracking, and query logging configurations for Gemini Enterprise applications.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'update'],
          description: 'The action to perform: get or update observability settings.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        },
        engine_id: {
          type: 'string',
          description: 'ID of the app/engine. Required.'
        },
        disable_analytics: {
          type: 'boolean',
          description: 'Set to true to disable analytics tracking, or false to enable.'
        },
        enable_opentelemetry: {
          type: 'boolean',
          description: 'Enable instrumentation of OpenTelemetry traces and logs.'
        },
        enable_prompt_logging: {
          type: 'boolean',
          description: 'Enable the logging of prompt inputs and response outputs.'
        }
      },
      required: ['action', 'engine_id']
    }
  },
  {
    name: 'gemini_enterprise_manage_knowledge_graph',
    description: 'Manage Google Cloud Knowledge Graph and Private Knowledge Graph configurations for Gemini Enterprise applications.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'update'],
          description: 'The action to perform: get or update Knowledge Graph settings.'
        },
        project_id: {
          type: 'string',
          description: 'Optional. Google Cloud Project ID.'
        },
        location: {
          type: 'string',
          description: 'Optional. Google Cloud Region.'
        },
        engine_id: {
          type: 'string',
          description: 'ID of the app/engine. Required.'
        },
        enable_google_cloud_knowledge_graph: {
          type: 'boolean',
          description: "Enable or disable Google Cloud Knowledge Graph (public data from Google's Knowledge Graph)."
        },
        enable_private_knowledge_graph: {
          type: 'boolean',
          description: 'Enable or disable private Knowledge Graph (using data in your connected data stores).'
        },
        enable_all_knowledge_graphs: {
          type: 'boolean',
          description: 'Convenience flag to enable both Google Cloud and Private Knowledge Graph at once.'
        },
        disable_all_knowledge_graphs: {
          type: 'boolean',
          description: 'Convenience flag to disable both Google Cloud and Private Knowledge Graph at once.'
        }
      },
      required: ['action', 'engine_id']
    }
  }
];

// Helper to determine GCP Project, Location, and setup GAPIC options
function getGcpParams(args: any) {
  const projectId = args.project_id || config.projectId;
  const location = args.location || config.location;
  
  if (!projectId) {
    throw new Error('Google Cloud Project ID is not configured. Please provide project_id or verify environment variables.');
  }

  const options = gapicClientOptions(projectId, location);
  return { projectId, location, options };
}

function textResult(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

// Handler routing tool calls to appropriate actions
export async function handleAdminToolCall(name: string, args: any): Promise<any> {
  switch (name) {
    case 'gemini_enterprise_manage_apps':
      return await manageApps(args);
    case 'gemini_enterprise_manage_datastore':
      return await manageDataStores(args);
    case 'gemini_enterprise_configure_connector':
      return await configureConnector(args);
    case 'gemini_enterprise_manage_target_sites':
      return await manageTargetSites(args);
    case 'gemini_enterprise_manage_documents':
      return await manageDocuments(args);
    case 'gemini_enterprise_manage_schema':
      return await manageSchema(args);
    case 'gemini_enterprise_manage_controls':
      return await manageControls(args);
    case 'gemini_enterprise_manage_agents':
      return await manageAgents(args);
    case 'gemini_enterprise_manage_skills':
      return await manageSkills(args);
    case 'gemini_enterprise_manage_features':
      return await manageFeatures(args);
    case 'gemini_enterprise_manage_models':
      return await manageModels(args);
    case 'gemini_enterprise_manage_search_ui':
      return await manageSearchUi(args);
    case 'gemini_enterprise_manage_assistant':
      return await manageAssistant(args);
    case 'gemini_enterprise_manage_observability':
      return await manageObservability(args);
    case 'gemini_enterprise_manage_knowledge_graph':
      return await manageKnowledgeGraph(args);
    default:
      throw new Error(`Unknown admin tool: ${name}`);
  }
}

// 1. App/Engine Management
async function manageApps(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const client = new EngineServiceClient(options);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}`;
  
  const action = args.action;

  if (action === 'list') {
    const [engines] = await client.listEngines({ parent });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully retrieved apps for project "${projectId}".`,
            count: engines.length,
            apps: engines.map((e: any) => ({
              name: e.name,
              displayName: e.displayName,
              solutionType: e.solutionType,
              createTime: e.createTime,
              updateTime: e.updateTime
            }))
          }, null, 2)
        }
      ]
    };
  }

  const engineId = args.engine_id;
  if (!engineId) {
    throw new Error('engine_id is required for create, delete, update, get, get-iam, and set-iam actions.');
  }

  const engineName = `${parent}/engines/${engineId}`;

  if (action === 'get') {
    const [engine] = await client.getEngine({ name: engineName });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully retrieved app "${engineId}".`,
            app: engine
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'create') {
    const displayName = args.display_name;
    const solutionType = args.solution_type;
    if (!displayName) throw new Error('display_name is required for creating an app.');
    if (!solutionType) throw new Error('solution_type is required for creating an app.');

    const datastoreIds = args.datastore_ids || [];
    const enginePayload: any = {
      displayName,
      solutionType,
      industryVertical: args.industry_vertical || 'GENERIC'
    };
    if (datastoreIds.length > 0) {
      enginePayload.dataStoreIds = datastoreIds;
    }
    if (solutionType === 'SOLUTION_TYPE_SEARCH') {
      enginePayload.appType = 'APP_TYPE_INTRANET';
      enginePayload.knowledgeGraphConfig = {
        enablePrivateKnowledgeGraph: true
      };
      enginePayload.searchEngineConfig = {
        searchTier: 'SEARCH_TIER_ENTERPRISE',
        searchAddOns: ['SEARCH_ADD_ON_LLM'],
        requiredSubscriptionTier: 'SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT'
      };
    }

    const headers = await getAuthHeaders(projectId);
    
    // For specific GCP region routing, ensure host matches location
    const host = discoveryEngineHost(location);
    const restBaseUrl = `https://${host}/v1alpha/${parent}/engines?engineId=${engineId}`;

    const res = await fetch(restBaseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(enginePayload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to create engine via REST: ${res.status} ${res.statusText}. Details: ${errText}`);
    }

    let operation = await res.json();
    const lroName = operation.name;
    
    // Poll the Long Running Operation with timeout guard (max 5 minutes)
    const startTime = Date.now();
    const MAX_POLL_MS = 5 * 60 * 1000;
    while (!operation.done) {
      if (Date.now() - startTime > MAX_POLL_MS) {
        throw new Error(`Timeout waiting for engine creation LRO "${lroName}" to complete.`);
      }
      await new Promise(r => setTimeout(r, 3000));
      const opRes = await fetch(`https://${host}/v1alpha/${lroName}`, {
        headers
      });
      if (!opRes.ok) {
        const opErrText = await opRes.text();
        throw new Error(`Failed to poll LRO "${lroName}": ${opRes.status} ${opRes.statusText}. Details: ${opErrText}`);
      }
      operation = await opRes.json();
    }

    if (operation.error) {
      throw new Error(`Engine creation failed: ${JSON.stringify(operation.error)}`);
    }

    const finalEngine = operation.response || {};
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `App "${engineId}" created successfully.`,
            app: {
              name: finalEngine.name,
              displayName: finalEngine.displayName,
              solutionType: finalEngine.solutionType
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'delete') {
    const [operation] = await client.deleteEngine({ name: engineName });
    await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `App "${engineId}" deleted successfully.`
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'update') {
    const displayName = args.display_name;
    if (!displayName) throw new Error('display_name is required for updating an app.');

    const [updatedEngine] = await client.updateEngine({
      engine: {
        name: engineName,
        displayName
      },
      updateMask: {
        paths: ['display_name']
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `App "${engineId}" updated successfully.`,
            app: {
              name: updatedEngine.name,
              displayName: updatedEngine.displayName
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'get-iam') {
    console.error(`[Admin] Getting IAM policy for app "${engineId}" in Project "${projectId}"`);
    const host = discoveryEngineHost(location);
    const url = `https://${host}/v1/projects/${projectId}/locations/${location}/collections/${config.collectionId}/engines/${engineId}:getIamPolicy`;
    const headers = await getAuthHeaders(projectId);
    const res = await fetch(url, {
      method: 'GET',
      headers
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to get IAM policy: ${res.status} ${res.statusText}. Details: ${text}`);
    }
    const data = await res.json() as any;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully retrieved IAM policy for app "${engineId}".`,
            policy: data
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'set-iam') {
    const policy = args.policy;
    if (!policy) {
      throw new Error('policy object is required for set-iam action.');
    }
    console.error(`[Admin] Setting IAM policy for app "${engineId}" in Project "${projectId}"`);
    const host = discoveryEngineHost(location);
    const url = `https://${host}/v1/projects/${projectId}/locations/${location}/collections/${config.collectionId}/engines/${engineId}:setIamPolicy`;
    const headers = await getAuthHeaders(projectId);
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        policy: policy
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to set IAM policy: ${res.status} ${res.statusText}. Details: ${text}`);
    }
    const data = await res.json() as any;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully set IAM policy for app "${engineId}".`,
            policy: data
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for apps.`);
}

// 2. DataStore Management
async function manageDataStores(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const client = new DataStoreServiceClient(options);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}`;
  
  const action = args.action;

  if (action === 'list') {
    const [dataStores] = await client.listDataStores({ parent });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully retrieved DataStores for project "${projectId}".`,
            count: dataStores.length,
            dataStores: dataStores.map((ds: any) => ({
              name: ds.name,
              displayName: ds.displayName,
              industryVertical: ds.industryVertical,
              createTime: ds.createTime
            }))
          }, null, 2)
        }
      ]
    };
  }

  const dataStoreId = args.datastore_id;
  if (!dataStoreId) {
    throw new Error('datastore_id is required for create and delete actions.');
  }

  const dataStoreName = `${parent}/dataStores/${dataStoreId}`;

  if (action === 'create') {
    const industryVertical = args.industry_vertical || 'GENERIC';
    const [operation] = await client.createDataStore({
      parent,
      dataStoreId,
      dataStore: {
        displayName: dataStoreId,
        industryVertical
      }
    });

    const [createdDataStore] = await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `DataStore "${dataStoreId}" created successfully.`,
            dataStore: {
              name: createdDataStore.name,
              displayName: createdDataStore.displayName,
              industryVertical: createdDataStore.industryVertical
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'delete') {
    const [operation] = await client.deleteDataStore({ name: dataStoreName });
    await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `DataStore "${dataStoreId}" deleted successfully.`
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for DataStores.`);
}

// 3. Connector Configuration (DataConnector REST API)
const RESOURCE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;

async function configureConnector(args: any): Promise<any> {
  const { projectId, location } = getGcpParams(args);
  const { action, collection_id: collectionId } = args;
  if (!collectionId || !RESOURCE_ID.test(collectionId)) throw new Error('A valid collection_id is required.');

  const headers = await getAuthHeaders(projectId);
  const locationPath = `projects/${projectId}/locations/${location}`;
  const connectorPath = `${locationPath}/collections/${collectionId}/dataConnector`;
  // connectorRuns endpoints reject project IDs (observed 2026-10-25) and require the project-number
  // form, so they use the canonical resource name returned by getDataConnector.
  const canonicalConnectorName = async (): Promise<string> =>
    (await fetchJson(`${discoveryEngineBaseUrl(location, 'v1')}/${connectorPath}`, { headers }, 'Get data connector')).name;

  switch (action) {
    case 'get': {
      const connector = await fetchJson(`${discoveryEngineBaseUrl(location, 'v1')}/${connectorPath}`, { headers }, 'Get data connector');
      return textResult({ status: 'SUCCESS', data_connector: connector });
    }

    case 'setup': {
      if (!args.data_connector || typeof args.data_connector !== 'object') throw new Error('data_connector object is required for setup.');
      const displayName = args.collection_display_name || collectionId;
      const url = `${discoveryEngineBaseUrl(location, 'v1alpha')}/${locationPath}:setUpDataConnectorV2?collectionId=${encodeURIComponent(collectionId)}&collectionDisplayName=${encodeURIComponent(displayName)}`;
      const operation = await fetchJson(url, { method: 'POST', headers, body: JSON.stringify(args.data_connector) }, 'Set up data connector');
      return textResult({ status: 'STARTED', message: 'Connector setup started. Poll the operation until done.', operation: operation.name, done: Boolean(operation.done) });
    }

    case 'update_citation_mappings': {
      const mappings = validateCitationMappings(args.citation_mappings);
      // Narrow mask and only citation_mappings in actionParams, as required by the docs:
      // echoing other actionParams (e.g. OAuth settings) back would fail or overwrite them.
      const connector = await fetchJson(`${discoveryEngineBaseUrl(location, 'v1')}/${connectorPath}?updateMask=action_config.action_params`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ actionConfig: { actionParams: { citation_mappings: mappings } } })
      }, 'Update citation mappings');
      return textResult({
        status: 'SUCCESS',
        message: 'Citation mappings replaced. They apply to new chats only.',
        citation_mappings: connector.actionConfig?.actionParams?.citation_mappings ?? mappings
      });
    }

    case 'list_runs': {
      const data = await fetchJson(`${discoveryEngineBaseUrl(location, 'v1alpha')}/${await canonicalConnectorName()}/connectorRuns?pageSize=20`, { headers }, 'List connector runs');
      return textResult({ status: 'SUCCESS', connector_runs: data.connectorRuns || [], next_page_token: data.nextPageToken });
    }

    case 'start_run': {
      const body: any = {};
      if (Array.isArray(args.entities)) body.entities = args.entities.map(String);
      if (args.force_refresh_content !== undefined) body.forceRefreshContent = Boolean(args.force_refresh_content);
      const run = await fetchJson(`${discoveryEngineBaseUrl(location, 'v1alpha')}/${await canonicalConnectorName()}:startConnectorRun`, {
        method: 'POST', headers, body: JSON.stringify(body)
      }, 'Start connector run');
      return textResult({ status: 'STARTED', connector_run: run });
    }

    default:
      throw new Error(`Unsupported action "${action}" for gemini_enterprise_configure_connector.`);
  }
}

// 4. Target Sites Management
async function manageTargetSites(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const { datastore_id, action, url } = args;
  
  if (!datastore_id) throw new Error('datastore_id is required.');

  const client = new SiteSearchEngineServiceClient(options);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/dataStores/${datastore_id}/siteSearchEngine`;

  if (action === 'list') {
    const [targetSites] = await client.listTargetSites({ parent });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully retrieved target sites for DataStore "${datastore_id}".`,
            count: targetSites.length,
            targetSites: targetSites.map((ts: any) => ({
              name: ts.name,
              providedUriPattern: ts.providedUriPattern,
              type: ts.type,
              updateTime: ts.updateTime
            }))
          }, null, 2)
        }
      ]
    };
  }

  if (!url) throw new Error('url is required for create and delete actions.');

  if (action === 'create') {
    const [operation] = await client.createTargetSite({
      parent,
      targetSite: {
        providedUriPattern: url
      }
    });

    const [createdSite] = await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Target site "${url}" created successfully.`,
            targetSite: {
              name: createdSite.name,
              providedUriPattern: createdSite.providedUriPattern,
              type: createdSite.type
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'delete') {
    // List target sites first to find the one matching the provided url string pattern
    const [targetSites] = await client.listTargetSites({ parent });
    const matchedSite = targetSites.find((ts: any) => ts.providedUriPattern === url);
    
    if (!matchedSite) {
      throw new Error(`Target site with URL "${url}" not found in DataStore "${datastore_id}".`);
    }

    const [operation] = await client.deleteTargetSite({ name: matchedSite.name });
    await operation.promise();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Target site "${url}" deleted successfully.`
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for Target Sites.`);
}

// 5. Document Management
async function manageDocuments(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const { datastore_id, action, gcs_uri, bq_dataset, document_id } = args;

  if (!datastore_id) throw new Error('datastore_id is required.');

  const client = new DocumentServiceClient(options);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/dataStores/${datastore_id}/branches/default_branch`;

  if (action === 'import') {
    if (!gcs_uri && !bq_dataset) {
      throw new Error('Either gcs_uri or bq_dataset is required for importing documents.');
    }

    const importRequest: any = { parent };
    
    if (gcs_uri) {
      importRequest.gcsSource = {
        inputUris: [gcs_uri]
      };
    } else if (bq_dataset) {
      let bqProjectId = projectId;
      let datasetId = bq_dataset;
      let tableId = '';
      
      const parts = bq_dataset.split('.');
      if (parts.length === 3) {
        bqProjectId = parts[0];
        datasetId = parts[1];
        tableId = parts[2];
      } else if (parts.length === 2) {
        datasetId = parts[0];
        tableId = parts[1];
      }
      
      importRequest.bigquerySource = {
        projectId: bqProjectId,
        datasetId,
        tableId
      };
    }

    const [operation] = await client.importDocuments(importRequest);
    const [response] = await operation.promise();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: 'Bulk document import operation completed.',
            response
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'purge') {
    const [operation] = await client.purgeDocuments({
      parent,
      filter: '*',
      force: true
    });
    const [response] = await operation.promise();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: 'All documents purged successfully from default branch.',
            response
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'delete') {
    if (!document_id) {
      throw new Error('document_id is required for deleting a single document.');
    }

    const name = `${parent}/documents/${document_id}`;
    await client.deleteDocument({ name });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Document "${document_id}" deleted successfully from branch.`
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for documents.`);
}

// 6. Schema Management
async function manageSchema(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const { datastore_id, action, schema_object } = args;

  if (!datastore_id) throw new Error('datastore_id is required.');

  const client = new SchemaServiceClient(options);
  const schemaName = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/dataStores/${datastore_id}/schemas/default_schema`;

  if (action === 'get') {
    const [schema] = await client.getSchema({ name: schemaName });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            schema: {
              name: schema.name,
              jsonSchema: schema.jsonSchema
            }
          }, null, 2)
        }
      ]
    };
  }

  if (!schema_object) {
    throw new Error(`schema_object is required for "${action}" action.`);
  }

  const jsonSchemaString = JSON.stringify(schema_object);

  if (action === 'create') {
    const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/dataStores/${datastore_id}`;
    const [operation] = await client.createSchema({
      parent,
      schemaId: 'default_schema',
      schema: {
        jsonSchema: jsonSchemaString
      }
    });

    const [createdSchema] = await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: 'Schema created successfully.',
            schema: {
              name: createdSchema.name,
              jsonSchema: createdSchema.jsonSchema
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'update') {
    const [operation] = await client.updateSchema({
      schema: {
        name: schemaName,
        jsonSchema: jsonSchemaString
      }
    });

    const [updatedSchema] = await operation.promise();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: 'Schema updated successfully.',
            schema: {
              name: updatedSchema.name,
              jsonSchema: updatedSchema.jsonSchema
            }
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for Schema.`);
}

// 7. Controls Management
async function manageControls(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const { datastore_id, action, control_id, control_type } = args;

  if (!datastore_id) throw new Error('datastore_id is required.');

  const client = new ControlServiceClient(options);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/dataStores/${datastore_id}`;

  if (action === 'list') {
    const [controls] = await client.listControls({ parent });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Successfully retrieved controls for DataStore "${datastore_id}".`,
            count: controls.length,
            controls: controls.map((c: any) => ({
              name: c.name,
              displayName: c.displayName,
              solutionType: c.solutionType,
              useCases: c.useCases
            }))
          }, null, 2)
        }
      ]
    };
  }

  if (!control_id) throw new Error('control_id is required for create and delete actions.');

  if (action === 'create') {
    const controlPayload: any = {
      displayName: control_id,
      solutionType: 'SOLUTION_TYPE_SEARCH',
      useCases: ['SEARCH_USE_CASE_SEARCH']
    };

    if (control_type) {
      const normalizedType = control_type.toLowerCase();
      if (normalizedType === 'boost') {
        controlPayload.boostAction = { boost: 0.5, filter: '*' };
      } else if (normalizedType === 'filter') {
        controlPayload.filterAction = { filter: '*' };
      } else if (normalizedType === 'redirect') {
        controlPayload.redirectAction = { redirectUri: 'https://example.com' };
      } else if (normalizedType === 'synonyms') {
        controlPayload.synonymsAction = { synonyms: ['example', 'test'] };
      } else if (normalizedType === 'promote') {
        controlPayload.promoteAction = { promoteIds: [] };
      }
    }

    const [createdControl] = await client.createControl({
      parent,
      controlId: control_id,
      control: controlPayload
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Control "${control_id}" created successfully.`,
            control: {
              name: createdControl.name,
              displayName: createdControl.displayName,
              solutionType: createdControl.solutionType
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'delete') {
    const controlName = `${parent}/controls/${control_id}`;
    await client.deleteControl({ name: controlName });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Control "${control_id}" deleted successfully.`
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for Controls.`);
}

// 8. Native Agent Management
async function manageAgents(args: any): Promise<any> {
  const projectId = args.project_id || config.projectId;
  const location = args.location || config.location;
  const { 
    action, 
    engine_id, 
    agent_id, 
    display_name, 
    description, 
    agent_type = 'a2a', 
    endpoint_url, 
    model, 
    instruction, 
    datastores, 
    tools,
    subagents
  } = args;

  if (!projectId) {
    throw new Error('Google Cloud Project ID is required.');
  }
  if (!engine_id) {
    throw new Error('engine_id is required.');
  }

  const host = discoveryEngineHost(location);
  const baseUrl = `https://${host}/v1alpha/projects/${projectId}/locations/${location}/collections/${config.collectionId}/engines/${engine_id}/assistants/default_assistant/agents`;

  switch (action) {
    case 'list': {
      console.error(`[Admin] Listing native agents for engine "${engine_id}" in Project "${projectId}"`);
      const headers = await getAuthHeaders(projectId);
      const res = await fetch(baseUrl, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to list agents: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Successfully retrieved agents for engine "${engine_id}".`,
              agents: data.agents || []
            }, null, 2)
          }
        ]
      };
    }

    case 'create': {
      if (!agent_id) throw new Error('agent_id is required for create action.');
      const headers = await getAuthHeaders(projectId);
      const url = `${baseUrl}?agentId=${agent_id}`;

      const name = display_name || agent_id;
      const desc = description || `Gemini Enterprise Agent for ${engine_id}`;

      let payload: any = {};

      if (agent_type === 'low-code') {
        console.error(`[Admin] Creating native Low-Code agent "${agent_id}" for engine "${engine_id}" in Project "${projectId}"`);
        
        const dataStoreSpecs = (datastores || []).map((dsId: string) => ({
          dataStore: `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dsId}`
        }));

        const toolSpecs = (tools || []).map((toolName: string) => ({
          name: toolName
        }));

        const rootNode: any = {
          id: 'root_agent',
          displayName: name,
          llmAgentNode: {
            model: model || 'gemini-3.5-flash',
            instruction: instruction || 'You are a helpful enterprise agent.',
            selectedTools: {
              tool: toolSpecs
            },
            dataStoreSpecs: {
              specs: dataStoreSpecs
            }
          }
        };

        const nodes = [rootNode];

        if (subagents && subagents.length > 0) {
          rootNode.llmAgentNode.subAgentIds = subagents.map((sa: any) => sa.agent_id);
          for (const sa of subagents) {
            const saDataStoreSpecs = (sa.datastores || []).map((dsId: string) => ({
              dataStore: `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dsId}`
            }));
            const saToolSpecs = (sa.tools || []).map((tName: string) => ({
              name: tName
            }));
            const saNode: any = {
              id: sa.agent_id,
              displayName: sa.display_name || sa.agent_id,
              llmAgentNode: {
                model: sa.model || 'gemini-3.5-flash',
                instruction: sa.instruction,
                selectedTools: {
                  tool: saToolSpecs
                },
                dataStoreSpecs: {
                  specs: saDataStoreSpecs
                }
              }
            };
            if (sa.description) {
              saNode.llmAgentNode.description = sa.description;
            }
            nodes.push(saNode);
          }
        }

        payload = {
          displayName: name,
          description: desc,
          lowCodeAgentDefinition: {
            rootAgentId: 'root_agent',
            nodes
          }
        };
      } else {
        console.error(`[Admin] Creating custom A2A agent "${agent_id}" for engine "${engine_id}" in Project "${projectId}"`);
        const endpoint = endpoint_url || `https://example.com/agents/${agent_id}`;

        const agentCard = {
          protocolVersion: 'a2a.v1',
          name,
          description: desc,
          url: endpoint,
          version: '1.0.0',
          capabilities: {
            streaming: true
          },
          defaultInputModes: ['text/plain'],
          defaultOutputModes: ['text/plain'],
          skills: []
        };

        payload = {
          displayName: name,
          description: desc,
          a2aAgentDefinition: {
            jsonAgentCard: JSON.stringify(agentCard)
          }
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create agent: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Agent "${agent_id}" created successfully under engine "${engine_id}".`,
              agent: data
            }, null, 2)
          }
        ]
      };
    }

    case 'delete': {
      if (!agent_id) throw new Error('agent_id is required for delete action.');
      console.error(`[Admin] Deleting native agent "${agent_id}" from engine "${engine_id}" in Project "${projectId}"`);
      const headers = await getAuthHeaders(projectId);
      const url = `${baseUrl}/${agent_id}`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to delete agent: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Agent "${agent_id}" deleted successfully from engine "${engine_id}".`,
              operation: data
            }, null, 2)
          }
        ]
      };
    }

    case 'update': {
      if (!agent_id) throw new Error('agent_id is required for update action.');
      const headers = await getAuthHeaders(projectId);

      const name = display_name || agent_id;
      const desc = description || `Updated Gemini Enterprise Agent for ${engine_id}`;

      let url = `${baseUrl}/${agent_id}?updateMask=displayName,description`;
      let payload: any = {
        displayName: name,
        description: desc
      };

      if (agent_type === 'low-code') {
        console.error(`[Admin] Updating native Low-Code agent "${agent_id}" for engine "${engine_id}" in Project "${projectId}"`);
        url += ',lowCodeAgentDefinition';

        const dataStoreSpecs = (datastores || []).map((dsId: string) => ({
          dataStore: `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dsId}`
        }));

        const toolSpecs = (tools || []).map((toolName: string) => ({
          name: toolName
        }));

        const rootNode: any = {
          id: 'root_agent',
          displayName: name,
          llmAgentNode: {
            model: model || 'gemini-3.5-flash',
            instruction: instruction || 'You are a helpful enterprise agent.',
            selectedTools: {
              tool: toolSpecs
            },
            dataStoreSpecs: {
              specs: dataStoreSpecs
            }
          }
        };

        const nodes = [rootNode];

        if (subagents && subagents.length > 0) {
          rootNode.llmAgentNode.subAgentIds = subagents.map((sa: any) => sa.agent_id);
          for (const sa of subagents) {
            const saDataStoreSpecs = (sa.datastores || []).map((dsId: string) => ({
              dataStore: `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dsId}`
            }));
            const saToolSpecs = (sa.tools || []).map((tName: string) => ({
              name: tName
            }));
            const saNode: any = {
              id: sa.agent_id,
              displayName: sa.display_name || sa.agent_id,
              llmAgentNode: {
                model: sa.model || 'gemini-3.5-flash',
                instruction: sa.instruction,
                selectedTools: {
                  tool: saToolSpecs
                },
                dataStoreSpecs: {
                  specs: saDataStoreSpecs
                }
              }
            };
            if (sa.description) {
              saNode.llmAgentNode.description = sa.description;
            }
            nodes.push(saNode);
          }
        }

        payload.lowCodeAgentDefinition = {
          rootAgentId: 'root_agent',
          nodes
        };
      } else {
        console.error(`[Admin] Updating native agent "${agent_id}" for engine "${engine_id}" in Project "${projectId}"`);
      }

      const res = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to update agent: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Agent "${agent_id}" updated successfully.`,
              agent: data
            }, null, 2)
          }
        ]
      };
    }

    default:
      throw new Error(`Unsupported action "${action}" for Agent.`);
  }
}

// 9. Vertex AI Platform Skills Management (Skill Registry)
async function manageSkills(args: any): Promise<any> {
  const projectId = args.project_id || config.projectId;
  const location = args.location || 'us-central1';
  const { action, skill_id, display_name, description, zipped_filesystem } = args;

  if (!projectId) {
    throw new Error('Google Cloud Project ID is required.');
  }

  const host = `${location}-aiplatform.googleapis.com`;
  const baseUrl = `https://${host}/v1beta1/projects/${projectId}/locations/${location}/skills`;

  const headers = await getAuthHeaders(projectId);

  switch (action) {
    case 'list': {
      console.error(`[Admin] Listing Vertex AI platform skills in Project "${projectId}", Location "${location}"`);
      const res = await fetch(baseUrl, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to list skills: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Successfully retrieved skills for location "${location}".`,
              skills: data.skills || []
            }, null, 2)
          }
        ]
      };
    }

    case 'create': {
      if (!skill_id) throw new Error('skill_id is required for create action.');
      if (!zipped_filesystem) throw new Error('zipped_filesystem (base64 string) is required for create action.');
      
      console.error(`[Admin] Creating Vertex AI platform skill "${skill_id}" in Project "${projectId}", Location "${location}"`);
      const url = `${baseUrl}?skillId=${skill_id}`;
      const payload: any = {
        displayName: display_name || skill_id,
        zippedFilesystem: zipped_filesystem
      };
      if (description) {
        payload.description = description;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create skill: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Skill "${skill_id}" creation operation initiated successfully.`,
              operation: data
            }, null, 2)
          }
        ]
      };
    }

    case 'patch': {
      if (!skill_id) throw new Error('skill_id is required for patch action.');
      console.error(`[Admin] Patching Vertex AI platform skill "${skill_id}" in Project "${projectId}", Location "${location}"`);
      
      const skillName = `projects/${projectId}/locations/${location}/skills/${skill_id}`;
      const url = `https://${host}/v1beta1/${skillName}`;
      
      const payload: any = {};
      const updateMasks: string[] = [];
      
      if (display_name !== undefined) {
        payload.displayName = display_name;
        updateMasks.push('displayName');
      }
      if (description !== undefined) {
        payload.description = description;
        updateMasks.push('description');
      }
      if (zipped_filesystem !== undefined) {
        payload.zippedFilesystem = zipped_filesystem;
        updateMasks.push('zippedFilesystem');
      }

      if (updateMasks.length === 0) {
        throw new Error('At least one of display_name, description, or zipped_filesystem must be provided to patch.');
      }

      const patchUrl = `${url}?updateMask=${updateMasks.join(',')}`;

      const res = await fetch(patchUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to patch skill: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Skill "${skill_id}" update operation initiated successfully.`,
              operation: data
            }, null, 2)
          }
        ]
      };
    }

    case 'delete': {
      if (!skill_id) throw new Error('skill_id is required for delete action.');
      console.error(`[Admin] Deleting Vertex AI platform skill "${skill_id}" in Project "${projectId}", Location "${location}"`);
      
      const skillName = `projects/${projectId}/locations/${location}/skills/${skill_id}`;
      const url = `https://${host}/v1beta1/${skillName}`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to delete skill: ${res.status} ${res.statusText}. Details: ${text}`);
      }
      const data = await res.json() as any;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Skill "${skill_id}" deletion operation initiated successfully.`,
              operation: data
            }, null, 2)
          }
        ]
      };
    }

    default:
      throw new Error(`Unsupported action "${action}" for Skills.`);
  }
}

// 10. Feature Management
async function manageFeatures(args: any): Promise<any> {
  const { projectId, location } = getGcpParams(args);
  const engineId = args.engine_id;
  if (!engineId) throw new Error('engine_id is required.');
  const engineName = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/engines/${engineId}`;
  const action = args.action;
  const headers = await getAuthHeaders(projectId);
  const baseUrl = `${discoveryEngineBaseUrl(location, 'v1alpha')}/${engineName}`;

  const existing = await fetchJson(baseUrl, { headers }, 'Get engine');
  const current: Record<string, string> = existing.features || {};

  const patchFeatures = (features: Record<string, string>) =>
    fetchJson(`${baseUrl}?updateMask=features`, { method: 'PATCH', headers, body: JSON.stringify({ features }) }, 'Update engine features');

  if (action === 'get') {
    return textResult({ status: 'SUCCESS', engine_id: engineId, features: describeFeatures(current) });
  }

  if (action === 'update') {
    if (current['*'] !== undefined) {
      // The API ignores every other key while the wildcard is present.
      throw new Error(`Engine "${engineId}" has the wildcard feature key "*" set (${current['*']}); individual toggles are ignored until it is removed.`);
    }
    const updated = await patchFeatures(applyFeatureUpdates(current, args));
    return textResult({
      status: 'SUCCESS',
      message: `Feature management settings updated for app "${engineId}".`,
      features: describeFeatures(updated.features || {})
    });
  }

  if (action === 'cleanup_invalid_keys') {
    const invalid = findInvalidFeatureKeys(current);
    const removed = Object.fromEntries(invalid.map(k => [k, current[k]]));
    if (args.dry_run === false && invalid.length > 0) {
      const cleaned = Object.fromEntries(Object.entries(current).filter(([k]) => !invalid.includes(k)));
      await patchFeatures(cleaned);
    }
    return textResult({
      status: 'SUCCESS',
      dry_run: args.dry_run !== false,
      engine_id: engineId,
      invalid_keys: removed,
      message: invalid.length === 0
        ? 'No invalid feature keys found.'
        : (args.dry_run === false ? `Removed ${invalid.length} invalid feature keys.` : `Found ${invalid.length} invalid feature keys. Re-run with dry_run=false to remove them.`)
    });
  }

  throw new Error(`Unsupported action "${action}" for gemini_enterprise_manage_features.`);
}

// 10b. Model Availability Management
async function manageModels(args: any): Promise<any> {
  const { projectId, location } = getGcpParams(args);
  const engineId = args.engine_id;
  if (!engineId) throw new Error('engine_id is required.');
  const action = args.action;
  const headers = await getAuthHeaders(projectId);
  const baseUrl = `${discoveryEngineBaseUrl(location, 'v1alpha')}/projects/${projectId}/locations/${location}/collections/${config.collectionId}/engines/${engineId}`;

  const existing = await fetchJson(baseUrl, { headers }, 'Get engine');
  const current: Record<string, string> = existing.modelConfigs || {};

  if (action === 'get') {
    return textResult({ status: 'SUCCESS', engine_id: engineId, ...describeModels(current) });
  }

  if (action === 'update') {
    const modelConfigs = applyModelUpdates(current, args);
    const updated = await fetchJson(`${baseUrl}?updateMask=modelConfigs`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ modelConfigs })
    }, 'Update engine model configs');
    return textResult({
      status: 'SUCCESS',
      message: `Model availability settings updated for app "${engineId}".`,
      ...describeModels(updated.modelConfigs || {})
    });
  }

  throw new Error(`Unsupported action "${action}" for gemini_enterprise_manage_models.`);
}

// 11. Search UI Management
async function manageSearchUi(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const engineId = args.engine_id;
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}/engines/${engineId}`;
  const action = args.action;

  const controlClient = new ControlServiceClient(options);

  if (action === 'get') {
    const [controls] = await controlClient.listControls({ parent });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            engine_id: engineId,
            controls_count: controls.length,
            controls: controls.map((c: any) => ({
              name: c.name,
              displayName: c.displayName,
              solutionType: c.solutionType,
              actionType: c.actionType,
              redirectAction: c.redirectAction
            }))
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'manage_pinned_link') {
    const pinned = args.pinned_link;
    if (!pinned || !pinned.title || !pinned.uri) {
      throw new Error('pinned_link object with title and uri is required.');
    }
    const controlId = pinned.link_id || `pinned-${Date.now()}`;
    const queryTerm = (pinned.query || pinned.title).toLowerCase();
    const [createdControl] = (await controlClient.createControl({
      parent,
      controlId,
      control: {
        displayName: pinned.title,
        solutionType: 'SOLUTION_TYPE_SEARCH' as any,
        useCases: ['SEARCH_USE_CASE_SEARCH' as any],
        conditions: [
          {
            queryTerms: [
              {
                value: queryTerm,
                fullMatch: true
              } as any
            ]
          }
        ],
        redirectAction: {
          redirectUri: pinned.uri
        }
      }
    })) as any;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Pinned link shortcut "${pinned.title}" created successfully.`,
            control: createdControl
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'update_autocomplete' || action === 'update_feedback') {
    const client = new EngineServiceClient(options);
    const [existingEngine] = await client.getEngine({ name: parent });
    const commonConfig = (existingEngine as any).commonConfig || {};

    if (action === 'update_autocomplete' && args.enable_autocomplete !== undefined) {
      commonConfig.enableAutoComplete = args.enable_autocomplete;
    }
    if (action === 'update_feedback' && args.enable_user_feedback !== undefined) {
      commonConfig.enableUserFeedback = args.enable_user_feedback;
    }

    const [updatedEngine] = await client.updateEngine({
      engine: {
        name: parent,
        commonConfig
      },
      updateMask: {
        paths: ['common_config']
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Search UI settings updated for app "${engineId}".`,
            app: updatedEngine
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for gemini_enterprise_manage_search_ui.`);
}

async function manageAssistant(args: any): Promise<any> {
  const { projectId, location } = getGcpParams(args);
  const engineId = args.engine_id;
  if (!engineId) throw new Error('engine_id is required.');
  const action = args.action;
  const headers = await getAuthHeaders(projectId);
  const engineUrl = `${discoveryEngineBaseUrl(location, 'v1alpha')}/projects/${projectId}/locations/${location}/collections/${config.collectionId}/engines/${engineId}`;
  const assistantUrl = `${engineUrl}/assistants/default_assistant`;

  const [engine, assistant] = await Promise.all([
    fetchJson(engineUrl, { headers }, 'Get engine'),
    fetchJson(assistantUrl, { headers }, 'Get assistant')
  ]);
  const legacy = parseLegacyCompanyName(engine.commonConfig?.companyName);

  if (action === 'get') {
    return textResult({
      status: 'SUCCESS',
      engine_id: engineId,
      assistant_options: describeAssistant(assistant, engine),
      legacy_company_name_config_detected: legacy.config !== null
    });
  }

  if (action === 'update') {
    if (args.prompt_chips !== undefined) {
      throw new Error('prompt_chips is no longer supported: it was never persisted by the API.');
    }
    // Lossless migration: legacy values only fill gaps left by explicit arguments.
    const effectiveArgs = legacy.config ? { ...legacyToArgs(legacy.config, args), ...args } : args;
    const { assistant: patch, updateMask } = buildAssistantPatch(assistant, effectiveArgs);

    let updatedAssistant = assistant;
    if (updateMask.length > 0) {
      updatedAssistant = await fetchJson(`${assistantUrl}?updateMask=${updateMask.join(',')}`, {
        method: 'PATCH', headers, body: JSON.stringify(patch)
      }, 'Update assistant');
    }

    let updatedEngine = engine;
    const enginePatch: any = {};
    const engineMask: string[] = [];
    if (effectiveArgs.chat_history_retention_days !== undefined) {
      const days = Number(effectiveArgs.chat_history_retention_days);
      if (!Number.isInteger(days) || days < 1) throw new Error('chat_history_retention_days must be a positive integer.');
      enginePatch.sessionConfig = { sessionTtl: { days } };
      engineMask.push('sessionConfig.sessionTtl');
    }
    // Strip the legacy suffix only after the assistant update succeeded, so no setting is lost.
    if (legacy.config !== null) {
      enginePatch.commonConfig = { ...(engine.commonConfig || {}), companyName: legacy.prefix };
      engineMask.push('commonConfig.companyName');
    }
    if (engineMask.length > 0) {
      updatedEngine = await fetchJson(`${engineUrl}?updateMask=${engineMask.join(',')}`, {
        method: 'PATCH', headers, body: JSON.stringify(enginePatch)
      }, 'Update engine session/common config');
    }

    return textResult({
      status: 'SUCCESS',
      message: `Assistant settings updated for app "${engineId}".`,
      migrated_legacy_company_name_config: legacy.config !== null,
      assistant_options: describeAssistant(updatedAssistant, updatedEngine)
    });
  }

  throw new Error(`Unsupported action "${action}" for gemini_enterprise_manage_assistant.`);
}

// 13. Observability & Logging Management
async function manageObservability(args: any): Promise<any> {
  const { projectId, location, options } = getGcpParams(args);
  const client = new EngineServiceClient(options);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}`;
  const engineId = args.engine_id;
  const engineName = `${parent}/engines/${engineId}`;
  const action = args.action;

  const baseUrl = `${discoveryEngineBaseUrl(location, 'v1alpha')}/${engineName}`;
  const headers = await getAuthHeaders(projectId);

  if (action === 'get') {
    const resGet = await fetch(baseUrl, { headers });
    const engine = await resGet.json();
    const isAnalyticsDisabled = engine.disableAnalytics ?? false;
    const obsConfig = engine.observabilityConfig || {};
    const isOpenTelemetryEnabled = obsConfig.observabilityEnabled === true;
    const isPromptLoggingEnabled = obsConfig.sensitiveLoggingEnabled === true;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            engine_id: engineId,
            observability_options: {
              user_interaction_logging: {
                enabled: !isAnalyticsDisabled,
                description: 'Log user interactions such as search queries and clicks (controlled by disable_analytics)'
              },
              opentelemetry_instrumentation: {
                enabled: isOpenTelemetryEnabled,
                backend_field: 'observabilityConfig.observabilityEnabled',
                description: 'Enable instrumentation of OpenTelemetry traces and logs (populates agent observability dashboard and traces pages)'
              },
              prompt_inputs_response_outputs_logging: {
                enabled: isPromptLoggingEnabled,
                backend_field: 'observabilityConfig.sensitiveLoggingEnabled',
                description: 'Enable the logging of prompt inputs and response outputs (collects and stores full content of user prompts and responses)'
              },
              audio_recording: {
                enabled: false,
                description: 'Record audio from bi-directional audio sessions'
              },
              log_session_history: {
                enabled: true,
                description: 'Save user chat sessions and history (Logging options checkbox)'
              }
            },
            raw_disable_analytics: isAnalyticsDisabled
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'update') {
    const resGet = await fetch(baseUrl, { headers });
    const existing = await resGet.json();
    const obsConfig = existing.observabilityConfig || {};

    if (args.enable_opentelemetry !== undefined) {
      obsConfig.observabilityEnabled = args.enable_opentelemetry;
    }
    if (args.enable_prompt_logging !== undefined) {
      obsConfig.sensitiveLoggingEnabled = args.enable_prompt_logging;
    }

    const resPatch = await fetch(`${baseUrl}?updateMask=observability_config`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ observabilityConfig: obsConfig })
    });
    const updatedEngine = await resPatch.json();

    let disableAnalytics = existing.disableAnalytics ?? false;
    if (args.disable_analytics !== undefined) {
      try {
        const [updatedClientEngine] = await client.updateEngine({
          engine: {
            name: engineName,
            disableAnalytics: args.disable_analytics
          },
          updateMask: {
            paths: ['disable_analytics']
          }
        });
        disableAnalytics = updatedClientEngine.disableAnalytics;
      } catch (e) {
        // disableAnalytics is immutable after create
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Observability settings (OpenTelemetry instrumentation and Prompt inputs/response outputs logging) updated successfully for app "${engineId}".`,
            observability: {
              user_interaction_logging: !disableAnalytics,
              opentelemetry_instrumentation: updatedEngine.observabilityConfig?.observabilityEnabled === true,
              prompt_inputs_response_outputs_logging: updatedEngine.observabilityConfig?.sensitiveLoggingEnabled === true
            }
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for gemini_enterprise_manage_observability.`);
}

async function manageKnowledgeGraph(args: any): Promise<any> {
  const { projectId, location } = getGcpParams(args);
  const parent = `projects/${projectId}/locations/${location}/collections/${config.collectionId}`;
  const engineId = args.engine_id;
  const engineName = `${parent}/engines/${engineId}`;
  const action = args.action;

  const baseUrl = `${discoveryEngineBaseUrl(location, 'v1alpha')}/${engineName}`;
  const headers = await getAuthHeaders(projectId);

  if (action === 'get') {
    const resGet = await fetch(baseUrl, { headers });
    const engine = await resGet.json();
    const kgConfig = engine.knowledgeGraphConfig || {};
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            engine_id: engineId,
            knowledge_graph_options: {
              google_cloud_knowledge_graph: {
                enabled: kgConfig.enableCloudKnowledgeGraph === true,
                backend_field: 'knowledgeGraphConfig.enableCloudKnowledgeGraph',
                description: "Enhances results with public data from Google's Knowledge Graph"
              },
              private_knowledge_graph: {
                enabled: kgConfig.enablePrivateKnowledgeGraph === true,
                backend_field: 'knowledgeGraphConfig.enablePrivateKnowledgeGraph',
                description: 'Creates a Knowledge Graph using data in your connected data stores'
              }
            }
          }, null, 2)
        }
      ]
    };
  }

  if (action === 'update') {
    const resGet = await fetch(baseUrl, { headers });
    const existing = await resGet.json();
    const kgConfig = existing.knowledgeGraphConfig || {};

    if (args.enable_all_knowledge_graphs === true) {
      kgConfig.enableCloudKnowledgeGraph = true;
      kgConfig.enablePrivateKnowledgeGraph = true;
    } else if (args.disable_all_knowledge_graphs === true) {
      kgConfig.enableCloudKnowledgeGraph = false;
      kgConfig.enablePrivateKnowledgeGraph = false;
    } else {
      if (args.enable_google_cloud_knowledge_graph !== undefined) {
        kgConfig.enableCloudKnowledgeGraph = args.enable_google_cloud_knowledge_graph;
      }
      if (args.enable_private_knowledge_graph !== undefined) {
        kgConfig.enablePrivateKnowledgeGraph = args.enable_private_knowledge_graph;
      }
    }

    const resPatch = await fetch(`${baseUrl}?updateMask=knowledge_graph_config`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ knowledgeGraphConfig: kgConfig })
    });
    const updatedEngine = await resPatch.json();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCESS',
            message: `Knowledge Graph settings updated successfully for app "${engineId}".`,
            knowledge_graph: {
              google_cloud_knowledge_graph: updatedEngine.knowledgeGraphConfig?.enableCloudKnowledgeGraph === true,
              private_knowledge_graph: updatedEngine.knowledgeGraphConfig?.enablePrivateKnowledgeGraph === true
            }
          }, null, 2)
        }
      ]
    };
  }

  throw new Error(`Unsupported action "${action}" for gemini_enterprise_manage_knowledge_graph.`);
}

