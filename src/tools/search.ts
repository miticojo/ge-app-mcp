import { 
  SearchServiceClient, 
  ConversationalSearchServiceClient, 
  DocumentServiceClient 
} from '@google-cloud/discoveryengine';
import { config } from '../config.js';

// Define the tool schemas according to @modelcontextprotocol/sdk
export const searchTools = [
  {
    name: 'gemini_enterprise_search',
    description: 'Search for documents or information in a Gemini Enterprise Datastore (Vertex AI Search). Supports custom query, datastore id and optional page size.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query string.'
        },
        datastore_id: {
          type: 'string',
          description: 'The ID of the target Vertex AI datastore.'
        },
        pageSize: {
          type: 'number',
          description: 'Optional. Number of results to return (default is 10).'
        }
      },
      required: ['query', 'datastore_id']
    }
  },
  {
    name: 'gemini_enterprise_ask',
    description: 'Ask a conversational question to get a generated answer from the target Datastore (RAG / Conversational Search).',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask.'
        },
        datastore_id: {
          type: 'string',
          description: 'The ID of the target Vertex AI datastore.'
        }
      },
      required: ['question', 'datastore_id']
    }
  },
  {
    name: 'gemini_enterprise_get_document',
    description: 'Retrieve a specific document from a Datastore using its document ID.',
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'The unique ID of the document to retrieve.'
        },
        datastore_id: {
          type: 'string',
          description: 'The ID of the target Vertex AI datastore.'
        }
      },
      required: ['document_id', 'datastore_id']
    }
  }
];

// Lazily instantiate clients to avoid overhead if tools are not used immediately
let searchClient: SearchServiceClient | null = null;
let conversationalSearchClient: ConversationalSearchServiceClient | null = null;
let documentClient: DocumentServiceClient | null = null;

function getSearchClient(): SearchServiceClient {
  if (!searchClient) {
    const options = config.location && config.location !== 'global'
      ? { apiEndpoint: `${config.location}-discoveryengine.googleapis.com` }
      : {};
    searchClient = new SearchServiceClient(options);
  }
  return searchClient;
}

function getConversationalSearchClient(): ConversationalSearchServiceClient {
  if (!conversationalSearchClient) {
    const options = config.location && config.location !== 'global'
      ? { apiEndpoint: `${config.location}-discoveryengine.googleapis.com` }
      : {};
    conversationalSearchClient = new ConversationalSearchServiceClient(options);
  }
  return conversationalSearchClient;
}

function getDocumentClient(): DocumentServiceClient {
  if (!documentClient) {
    const options = config.location && config.location !== 'global'
      ? { apiEndpoint: `${config.location}-discoveryengine.googleapis.com` }
      : {};
    documentClient = new DocumentServiceClient(options);
  }
  return documentClient;
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
function formatReferences(references: any[]): string {
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
      title = `Structured Document ${idx + 1}`;
      content = JSON.stringify(structInfo.structData || {}, null, 2);
    }
    
    markdown += `- **[${title}](${uri || '#'})**\n`;
    if (content) {
      markdown += `  > ${content.trim().replace(/\n/g, '\n  > ')}\n\n`;
    }
  });
  return markdown;
}

// Main handler for search-related tool calls
export async function handleSearchToolCall(name: string, args: any): Promise<any> {
  const collectionId = config.collectionId || 'default_collection';
  const projectId = config.projectId;
  const location = config.location || 'global';

  if (!projectId) {
    throw new Error('GCP_PROJECT / GOOGLE_CLOUD_PROJECT is not set in the environment or config.');
  }

  switch (name) {
    case 'gemini_enterprise_search': {
      const { query, datastore_id, pageSize } = args;
      if (!query) throw new Error('Argument "query" is required.');
      if (!datastore_id) throw new Error('Argument "datastore_id" is required.');

      const client = getSearchClient();
      const servingConfig = `projects/${projectId}/locations/${location}/collections/${collectionId}/dataStores/${datastore_id}/servingConfigs/default_search`;

      const request = {
        servingConfig,
        query,
        pageSize: pageSize || 10,
      };

      const [results] = await client.search(request);

      let markdown = `# Search Results for "${query}"\n\n`;
      markdown += `*Datastore: \`${datastore_id}\`*\n\n`;

      if (!results || results.length === 0) {
        markdown += `No results found.\n`;
      } else {
        results.forEach((res: any, idx: number) => {
          markdown += formatSearchResult(res, idx);
        });
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
      const { question, datastore_id } = args;
      if (!question) throw new Error('Argument "question" is required.');
      if (!datastore_id) throw new Error('Argument "datastore_id" is required.');

      const client = getConversationalSearchClient();
      const servingConfig = `projects/${projectId}/locations/${location}/collections/${collectionId}/dataStores/${datastore_id}/servingConfigs/default_search`;

      const request = {
        servingConfig,
        query: {
          text: question,
        },
      };

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
      } else {
        markdown += `*(No answer payload returned)*\n`;
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
      if (!datastore_id) throw new Error('Argument "datastore_id" is required.');

      const client = getDocumentClient();
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
