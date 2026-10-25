import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as discoveryengine from '@google-cloud/discoveryengine';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverPath = join(__dirname, '../build/index.js');

// Map of MCP tool names to expected Google Cloud SDK Client classes & Proto fields
const EXPECTED_GCP_MAPPINGS = {
  gemini_enterprise_search: {
    client: 'SearchServiceClient',
    proto: 'google.cloud.discoveryengine.v1.SearchRequest',
    requiredArgs: ['query', 'datastore_id']
  },
  gemini_enterprise_ask: {
    client: 'ConversationalSearchServiceClient',
    proto: 'google.cloud.discoveryengine.v1.AnswerQueryRequest',
    requiredArgs: ['question', 'datastore_id']
  },
  gemini_enterprise_get_document: {
    client: 'DocumentServiceClient',
    proto: 'google.cloud.discoveryengine.v1.GetDocumentRequest',
    requiredArgs: ['document_id', 'datastore_id']
  },
  gemini_enterprise_manage_apps: {
    client: 'EngineServiceClient',
    proto: 'google.cloud.discoveryengine.v1.Engine',
    requiredArgs: ['action']
  },
  gemini_enterprise_manage_datastore: {
    client: 'DataStoreServiceClient',
    proto: 'google.cloud.discoveryengine.v1.DataStore',
    requiredArgs: ['action']
  },
  gemini_enterprise_configure_connector: {
    client: null, // REST only: DataConnector is not exposed by the Node SDK
    proto: 'google.cloud.discoveryengine.v1.DataConnector',
    requiredArgs: ['action', 'collection_id']
  },
  gemini_enterprise_manage_target_sites: {
    client: 'SiteSearchEngineServiceClient',
    proto: 'google.cloud.discoveryengine.v1.TargetSite',
    requiredArgs: ['action', 'datastore_id']
  },
  gemini_enterprise_manage_documents: {
    client: 'DocumentServiceClient',
    proto: 'google.cloud.discoveryengine.v1.ImportDocumentsRequest',
    requiredArgs: ['action', 'datastore_id']
  },
  gemini_enterprise_manage_schema: {
    client: 'SchemaServiceClient',
    proto: 'google.cloud.discoveryengine.v1.Schema',
    requiredArgs: ['action', 'datastore_id']
  },
  gemini_enterprise_manage_controls: {
    client: 'ControlServiceClient',
    proto: 'google.cloud.discoveryengine.v1.Control',
    requiredArgs: ['action', 'datastore_id']
  },
  gemini_enterprise_manage_agents: {
    client: 'EngineServiceClient',
    proto: 'google.cloud.discoveryengine.v1alpha.Agent',
    requiredArgs: ['action', 'engine_id']
  },
  gemini_enterprise_manage_skills: {
    client: 'EngineServiceClient',
    proto: 'google.cloud.discoveryengine.v1beta1.Skill',
    requiredArgs: ['action']
  },
  gemini_enterprise_manage_licenses: {
    client: 'UserLicenseServiceClient',
    proto: 'google.cloud.discoveryengine.v1.UserLicense',
    requiredArgs: ['action']
  },
  gemini_enterprise_manage_features: {
    client: 'EngineServiceClient',
    proto: 'google.cloud.discoveryengine.v1.Engine',
    requiredArgs: ['action', 'engine_id']
  },
  gemini_enterprise_manage_models: {
    client: 'EngineServiceClient',
    proto: 'google.cloud.discoveryengine.v1.Engine',
    requiredArgs: ['action', 'engine_id']
  },
  gemini_enterprise_manage_search_ui: {
    client: 'EngineServiceClient',
    proto: 'google.cloud.discoveryengine.v1.Engine',
    requiredArgs: ['action', 'engine_id']
  },
  gemini_enterprise_manage_assistant: {
    client: 'EngineServiceClient',
    proto: 'google.cloud.discoveryengine.v1.Engine',
    requiredArgs: ['action', 'engine_id']
  },
  gemini_enterprise_manage_observability: {
    client: 'EngineServiceClient',
    proto: 'google.cloud.discoveryengine.v1.Engine',
    requiredArgs: ['action', 'engine_id']
  },
  gemini_enterprise_manage_knowledge_graph: {
    client: 'EngineServiceClient',
    proto: 'google.cloud.discoveryengine.v1.Engine',
    requiredArgs: ['action', 'engine_id']
  }
};

async function runSmokeTests() {
  console.log('💨 Running API Contract & SDK Smoke Tests...');

  // 1. Verify SDK Client exports exist in @google-cloud/discoveryengine
  console.log('\n📦 Phase 1: Validating Google Cloud SDK Client Bindings...');
  for (const [toolName, mapping] of Object.entries(EXPECTED_GCP_MAPPINGS)) {
    if (mapping.client) {
      if (!discoveryengine[mapping.client]) {
        throw new Error(`[Smoke Test Failure] SDK Client "${mapping.client}" for tool "${toolName}" is missing from @google-cloud/discoveryengine exports.`);
      }
      console.log(`  ✓ Tool "${toolName}" maps to valid SDK Client "${mapping.client}"`);
    }
  }

  // 2. Connect to local MCP Server and perform Schema Contract Validation
  console.log('\n🔌 Phase 2: Validating MCP Server Tool Schemas against GCP API Contract...');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      GCP_PROJECT: 'giorgioc-cloud-apps',
      GCP_LOCATION: 'global',
      GCP_COLLECTION: 'default_collection',
      MCP_SCOPES: 'search,admin,billing'
    }
  });

  const client = new Client({
    name: 'smoke-test-client',
    version: '1.0.0'
  }, { capabilities: {} });

  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log(`  ✓ Connected to MCP Server. Registered ${tools.length} tools.`);

  let verifiedCount = 0;
  for (const tool of tools) {
    const expected = EXPECTED_GCP_MAPPINGS[tool.name];
    if (!expected) {
      throw new Error(`[Smoke Test Failure] Tool "${tool.name}" is registered in the MCP server but lacks an API Contract & SDK mapping in test_smoke_api_contract.mjs. All tools must be 100% covered.`);
    }

    // Check required arguments exist in inputSchema
    const inputProps = tool.inputSchema?.properties || {};
    for (const reqArg of expected.requiredArgs) {
      if (!inputProps[reqArg]) {
        throw new Error(`[Smoke Test Failure] Tool "${tool.name}" schema is missing expected argument "${reqArg}" required for GCP integration.`);
      }
    }
    console.log(`  ✓ Tool "${tool.name}" schema contract matches required GCP parameters: [${expected.requiredArgs.join(', ')}]`);
    verifiedCount++;
  }

  await client.close();

  if (verifiedCount < Object.keys(EXPECTED_GCP_MAPPINGS).length - 1) {
    throw new Error(`[Smoke Test Failure] Expected to verify at least ${Object.keys(EXPECTED_GCP_MAPPINGS).length - 1} tools, but verified ${verifiedCount}.`);
  }

  console.log(`\n🎉 All ${verifiedCount} API Contract & SDK Smoke Tests PASSED successfully!\n`);
  process.exit(0);
}

runSmokeTests().catch((err) => {
  console.error('\n❌ Smoke Test Failed:', err);
  process.exit(1);
});
