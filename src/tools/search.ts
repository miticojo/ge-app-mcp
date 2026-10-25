import { 
  SearchServiceClient, 
  ConversationalSearchServiceClient, 
  DocumentServiceClient 
} from '@google-cloud/discoveryengine';
import { config } from '../config.js';
import { gapicClientOptions } from '../gcp.js';

// Define the tool schemas according to @modelcontextprotocol/sdk
export const searchTools = [
  {
    name: 'gemini_enterprise_search',
    description: 'Search documents in a Gemini Enterprise data store or across all sources of an app. Supports filters, ordering, relevance threshold and pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query string.' },
        datastore_id: { type: 'string', description: 'Target data store ID. Use for single-source precision. Provide exactly one of datastore_id or engine_id.' },
        engine_id: { type: 'string', description: 'Target app (engine) ID. Searches across all data stores and connectors attached to the app (blended).' },
        project_id: { type: 'string', description: 'Optional. Google Cloud Project ID.' },
        location: { type: 'string', description: 'Optional. Google Cloud location (global, us, eu).' },
        collection_id: { type: 'string', description: 'Optional. Collection ID (defaults to the configured collection).' },
        pageSize: { type: 'number', description: 'Optional. Number of results (default 10, max 100).' },
        page_token: { type: 'string', description: 'Optional. next_page_token from a previous call.' },
        filter: { type: 'string', description: 'Optional. Filter expression on indexed metadata, e.g. category: ANY("policy").' },
        order_by: { type: 'string', description: 'Optional. Order expression, e.g. "update_time desc".' },
        relevance_threshold: { type: 'string', enum: ['LOWEST', 'LOW', 'MEDIUM', 'HIGH'], description: 'Optional. Drop results below this relevance.' },
        enable_query_understanding: { type: 'boolean', description: 'Optional. Extract filters from the natural language query.' },
        search_addon_spec: {
          type: 'object',
          properties: {
            disable_semantic_add_on: { type: 'boolean' },
            disable_kpi_personalization_add_on: { type: 'boolean' },
            disable_generative_answer_add_on: { type: 'boolean' }
          },
          description: 'Optional, datastore_id only. Turn off add-ons not needed for plain retrieval (configurable pricing cost control).'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'gemini_enterprise_ask',
    description: 'Ask a question and get a grounded, cited answer from a data store or from all sources of an app. Supports multi-turn sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask.' },
        datastore_id: { type: 'string', description: 'Target data store ID. Use for single-source precision. Provide exactly one of datastore_id or engine_id.' },
        engine_id: { type: 'string', description: 'Target app (engine) ID. Searches across all data stores and connectors attached to the app (blended).' },
        project_id: { type: 'string', description: 'Optional. Google Cloud Project ID.' },
        location: { type: 'string', description: 'Optional. Google Cloud location (global, us, eu).' },
        collection_id: { type: 'string', description: 'Optional. Collection ID (defaults to the configured collection).' },
        session: { type: 'string', description: 'Optional. "new" to start a multi-turn session, or the session name returned by a previous call to continue it.' },
        filter: { type: 'string', description: 'Optional. Metadata filter applied to the retrieval step.' },
        related_questions: { type: 'boolean', description: 'Optional. Also return suggested follow-up questions.' }
      },
      required: ['question']
    }
  },
  {
    name: 'gemini_enterprise_get_document',
    description: 'Retrieve the full content and metadata of a document from a data store by its document ID.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'The unique ID of the document to retrieve.' },
        datastore_id: { type: 'string', description: 'The ID of the data store that contains the document.' },
        project_id: { type: 'string', description: 'Optional. Google Cloud Project ID.' },
        location: { type: 'string', description: 'Optional. Google Cloud location.' },
        collection_id: { type: 'string', description: 'Optional. Collection ID.' }
      },
      required: ['document_id', 'datastore_id']
    }
  }
];

// ADC clients are cached per endpoint; clients bound to an end-user token are built per request
// so that one user's credentials can never be reused for another user's call.
const adcClientCache = new Map<string, any>();

function getClient<T>(Ctor: new (opts: any) => T, projectId: string, location: string): T {
  const options = gapicClientOptions(projectId, location);
  if (options.auth) {
    return new Ctor(options);
  }
  const key = `${Ctor.name}:${location}`;
  if (!adcClientCache.has(key)) {
    adcClientCache.set(key, new Ctor(options));
  }
  return adcClientCache.get(key);
}

function getSearchClient(projectId: string, location: string): SearchServiceClient {
  return getClient(SearchServiceClient, projectId, location);
}

function getConversationalSearchClient(projectId: string, location: string): ConversationalSearchServiceClient {
  return getClient(ConversationalSearchServiceClient, projectId, location);
}

function getDocumentClient(projectId: string, location: string): DocumentServiceClient {
  return getClient(DocumentServiceClient, projectId, location);
}

// Helper to convert protobuf Struct to plain Javascript object
function extractValue(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') {
    if ('stringValue' in val) return val.stringValue;
    if ('numberValue' in val) return val.numberValue;
    if ('boolValue' in val) return val.boolValue;
    if ('structValue' in val) return convertStruct(val.structValue);
    if ('listValue' in val) {
      return (val.listValue.values || []).map(extractValue);
    }
    if ('nullValue' in val) return null;
  }
  return val;
}

function convertStruct(struct: any): any {
  if (!struct) return {};
  if (struct.fields) {
    const obj: any = {};
    for (const [key, value] of Object.entries(struct.fields)) {
      obj[key] = extractValue(value);
    }
    return obj;
  }
  return struct;
}

// Helper to extract common document fields defensively
function extractDocumentFields(document: any) {
  if (!document) return null;
  
  const rawDerived = document.derivedStructData ? convertStruct(document.derivedStructData) : {};
  const rawStruct = document.structData ? convertStruct(document.structData) : {};
  
  const data = { ...rawStruct, ...rawDerived };
  
  const title = data.title || document.id || 'Untitled';
  const link = data.link || data.url || data.uri || '';
  
  let snippets: string[] = [];
  if (data.snippets && Array.isArray(data.snippets)) {
    snippets = data.snippets.map((s: any) => {
      if (typeof s === 'object') {
        return s.snippet || s.text || JSON.stringify(s);
      }
      return String(s);
    }).filter(Boolean);
  } else if (data.snippet) {
    snippets = [data.snippet];
  }
  
  return {
    id: document.id,
    title,
    link,
    snippets,
    data
  };
}

// Formats a search result to markdown
function formatSearchResult(result: any, index: number): string {
  const { id, document, chunk } = result;
  let markdown = `### Result ${index + 1}\n`;
  
  if (chunk) {
    const chunkTitle = chunk.documentMetadata?.title || 'Untitled Document';
    const chunkUri = chunk.documentMetadata?.uri || '';
    markdown += `**Source**: [${chunkTitle}](${chunkUri || '#'}) (Chunk ID: \`${chunk.id || id}\`)\n`;
    if (chunk.relevanceScore !== undefined && chunk.relevanceScore !== null) {
      markdown += `**Relevance Score**: ${chunk.relevanceScore}\n`;
    }
    markdown += `\n${chunk.content || ''}\n\n`;
  } else if (document) {
    const fields = extractDocumentFields(document);
    if (fields) {
      markdown += `**Title**: ${fields.title}\n`;
      if (fields.link) {
        markdown += `**Link**: [${fields.link}](${fields.link})\n`;
      }
      markdown += `**Document ID**: \`${fields.id || id}\`\n\n`;
      
      if (fields.snippets && fields.snippets.length > 0) {
        markdown += `**Snippets**:\n`;
        fields.snippets.forEach((snip: string) => {
          markdown += `> ${snip}\n\n`;
        });
      } else {
        const contentStr = document.jsonData || JSON.stringify(fields.data, null, 2);
        if (contentStr && contentStr !== '{}') {
          markdown += `**Content**:\n\`\`\`json\n${contentStr.substring(0, 1000)}${contentStr.length > 1000 ? '...' : ''}\n\`\`\`\n\n`;
        }
      }
    } else {
      markdown += `*(Document details unavailable)*\n`;
    }
  } else {
    markdown += `*Result ID*: \`${id}\` (No document/chunk payload)\n`;
  }
  
  return markdown;
}

// Formats answer references to markdown
export function formatReferences(references: any[]): string {
  let markdown = '';
  references.forEach((ref, idx) => {
    let title = `Reference ${idx + 1}`;
    let uri = '';
    let content = '';
    
    if (ref.unstructuredDocumentInfo) {
      const docInfo = ref.unstructuredDocumentInfo;
      title = docInfo.title || docInfo.uri || title;
      uri = docInfo.uri || '';
      if (docInfo.chunkContents && docInfo.chunkContents.length > 0) {
        content = docInfo.chunkContents.map((c: any) => c.content).filter(Boolean).join('\n\n');
      }
    } else if (ref.chunkInfo) {
      const chunk = ref.chunkInfo;
      title = chunk.documentMetadata?.title || chunk.documentMetadata?.uri || title;
      uri = chunk.documentMetadata?.uri || '';
      content = chunk.content || '';
    } else if (ref.structuredDocumentInfo) {
      const structInfo = ref.structuredDocumentInfo;
      title = structInfo.title || structInfo.uri || `Structured Document ${idx + 1}`;
      uri = structInfo.uri || '';
      content = JSON.stringify(structInfo.structData || {}, null, 2);
    }
    
    markdown += `- **[${title}](${uri || '#'})**\n`;
    if (content) {
      markdown += `  > ${content.trim().replace(/\n/g, '\n  > ')}\n\n`;
    }
  });
  return markdown;
}

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const RELEVANCE = ['LOWEST', 'LOW', 'MEDIUM', 'HIGH'];

function resolveTarget(args: any, projectId: string, location: string, collectionId: string) {
  const { datastore_id: datastoreId, engine_id: engineId } = args;
  if (Boolean(datastoreId) === Boolean(engineId)) throw new Error('Provide exactly one of datastore_id or engine_id.');
  const id = datastoreId || engineId;
  if (!ID.test(id)) throw new Error('Invalid datastore_id/engine_id.');
  const parent = `projects/${projectId}/locations/${location}/collections/${collectionId}/${datastoreId ? 'dataStores' : 'engines'}/${id}`;
  return {
    parent,
    isEngine: Boolean(engineId),
    // Session names come back with the project number, so match on the resource suffix only.
    sessionSuffix: `/collections/${collectionId}/${datastoreId ? 'dataStores' : 'engines'}/${id}/sessions/`,
    label: datastoreId ? `Datastore: \`${datastoreId}\`` : `App (all sources): \`${engineId}\``
  };
}

// Main handler for search-related tool calls
export async function handleSearchToolCall(name: string, args: any): Promise<any> {
  const collectionId = args.collection_id || config.collectionId || 'default_collection';
  const projectId = args.project_id || config.projectId;
  const location = args.location || config.location || 'global';

  if (!projectId) {
    throw new Error('GCP_PROJECT / GOOGLE_CLOUD_PROJECT is not set in the environment or config.');
  }
  if (!ID.test(collectionId)) throw new Error('Invalid collection_id.');

  switch (name) {
    case 'gemini_enterprise_search': {
      const { query } = args;
      if (!query) throw new Error('Argument "query" is required.');
      const { parent, label, isEngine } = resolveTarget(args, projectId, location, collectionId);

      const request: any = {
        servingConfig: `${parent}/servingConfigs/default_search`,
        query,
        pageSize: Math.min(Math.max(1, Number(args.pageSize) || 10), 100)
      };
      if (args.page_token) request.pageToken = String(args.page_token);
      if (args.filter) request.filter = String(args.filter);
      if (args.order_by) request.orderBy = String(args.order_by);
      if (args.relevance_threshold !== undefined) {
        if (!RELEVANCE.includes(args.relevance_threshold)) throw new Error('relevance_threshold must be LOWEST, LOW, MEDIUM or HIGH.');
        request.relevanceThreshold = args.relevance_threshold;
      }
      if (args.enable_query_understanding === true) {
        request.naturalLanguageQueryUnderstandingSpec = { filterExtractionCondition: 'ENABLED' };
      }
      if (args.search_addon_spec) {
        if (isEngine) throw new Error('search_addon_spec is not supported for app-level (multi-datastore) search; use datastore_id.');
        const spec = args.search_addon_spec;
        request.searchAddonSpec = {
          disableSemanticAddOn: Boolean(spec.disable_semantic_add_on),
          disableKpiPersonalizationAddOn: Boolean(spec.disable_kpi_personalization_add_on),
          disableGenerativeAnswerAddOn: Boolean(spec.disable_generative_answer_add_on)
        };
      }

      const client = getSearchClient(projectId, location);
      const [results, , rawResponse] = await client.search(request, { autoPaginate: false }) as any;

      let markdown = `# Search Results for "${query}"\n\n`;
      markdown += `*${label}*\n\n`;

      if (!results || results.length === 0) {
        markdown += `No results found.\n`;
      } else {
        results.forEach((res: any, idx: number) => {
          markdown += formatSearchResult(res, idx);
        });
      }
      if (rawResponse?.nextPageToken) {
        markdown += `\n**next_page_token**: \`${rawResponse.nextPageToken}\`\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: markdown.trim(),
          },
        ],
      };
    }

    case 'gemini_enterprise_ask': {
      const { question } = args;
      if (!question) throw new Error('Argument "question" is required.');
      const { parent, sessionSuffix } = resolveTarget(args, projectId, location, collectionId);

      const request: any = {
        servingConfig: `${parent}/servingConfigs/default_search`,
        query: {
          text: question,
        },
      };
      if (args.session) {
        // "-" asks the API to create a new session; otherwise continue the given one.
        request.session = args.session === 'new' ? `${parent}/sessions/-` : String(args.session);
        if (!/^projects\/[^/]+\/locations\/[^/]+\/collections\/[^/]+\/(dataStores|engines)\/[^/]+\/sessions\/[^/]+$/.test(request.session)
          || !request.session.includes(sessionSuffix)) {
          throw new Error('session must be "new" or a session name of the same data store/app.');
        }
      }
      if (args.filter) request.searchSpec = { searchParams: { filter: String(args.filter) } };
      if (args.related_questions === true) request.relatedQuestionsSpec = { enable: true };

      const client = getConversationalSearchClient(projectId, location);
      const [response] = await client.answerQuery(request);

      let markdown = `# Question: ${question}\n\n`;
      
      if (response.answer) {
        const answer = response.answer;
        if (answer.answerText) {
          markdown += `## Generated Answer\n\n${answer.answerText}\n\n`;
        } else {
          markdown += `*(No answer text returned)*\n\n`;
        }

        if (answer.groundingScore !== undefined && answer.groundingScore !== null) {
          markdown += `**Grounding Confidence Score**: ${answer.groundingScore.toFixed(2)}\n\n`;
        }

        if (answer.references && answer.references.length > 0) {
          markdown += `### Sources & References\n\n`;
          markdown += formatReferences(answer.references);
        }

        if (answer.relatedQuestions && answer.relatedQuestions.length > 0) {
          markdown += `\n### Related Questions\n\n${answer.relatedQuestions.map((q: string) => `- ${q}`).join('\n')}\n`;
        }
      } else {
        markdown += `*(No answer payload returned)*\n`;
      }

      if (response.session?.name) {
        markdown += `\n**session**: \`${response.session.name}\` (pass it as "session" to continue the conversation)\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: markdown.trim(),
          },
        ],
      };
    }

    case 'gemini_enterprise_get_document': {
      const { document_id, datastore_id } = args;
      if (!document_id) throw new Error('Argument "document_id" is required.');
      if (!datastore_id || !ID.test(datastore_id)) throw new Error('A valid "datastore_id" is required.');

      const client = getDocumentClient(projectId, location);
      const namePath = `projects/${projectId}/locations/${location}/collections/${collectionId}/dataStores/${datastore_id}/branches/0/documents/${document_id}`;

      const [document] = await client.getDocument({ name: namePath });

      let markdown = `# Document Details\n\n`;
      markdown += `- **Document ID**: \`${document.id || document_id}\`\n`;
      markdown += `- **Resource Name**: \`${document.name}\`\n`;

      if (document.schemaId) {
        markdown += `- **Schema ID**: \`${document.schemaId}\`\n`;
      }

      if (document.indexTime) {
        const dateStr = document.indexTime.seconds
          ? new Date(Number(document.indexTime.seconds) * 1000).toISOString()
          : JSON.stringify(document.indexTime);
        markdown += `- **Indexed At**: ${dateStr}\n`;
      }

      markdown += `\n`;

      const fields = extractDocumentFields(document);
      if (fields && fields.data && Object.keys(fields.data).length > 0) {
        markdown += `## Document Metadata & Fields\n\n`;
        markdown += `**Title**: ${fields.title}\n`;
        if (fields.link) {
          markdown += `**Link/URI**: [${fields.link}](${fields.link})\n`;
        }
        markdown += `\n### All Properties:\n`;
        markdown += `\`\`\`json\n${JSON.stringify(fields.data, null, 2)}\n\`\`\`\n\n`;
      }

      if (document.jsonData) {
        try {
          markdown += `## Raw JSON Content\n\n`;
          markdown += `\`\`\`json\n${JSON.stringify(JSON.parse(document.jsonData), null, 2)}\n\`\`\`\n\n`;
        } catch {
          markdown += `## Raw Content\n\n${document.jsonData}\n\n`;
        }
      }

      if (document.content) {
        markdown += `## Content Attachment\n\n`;
        if (document.content.mimeType) {
          markdown += `- **MIME Type**: \`${document.content.mimeType}\`\n`;
        }
        if (document.content.uri) {
          markdown += `- **Content URI**: [${document.content.uri}](${document.content.uri})\n`;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: markdown.trim(),
          },
        ],
      };
    }

    default:
      throw new Error(`Unsupported tool name: ${name}`);
  }
}
