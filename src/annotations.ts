/**
 * MCP tool annotations. Gemini Enterprise asks the user to confirm every action unless the
 * tool declares readOnlyHint: true, so only pure read tools are marked read-only. Annotations
 * are hints for clients, not a security control: authorization is enforced by MCP_SCOPES and
 * by Google IAM on every API call.
 */
interface ToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

const read = (title: string): ToolAnnotations =>
  ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const configure = (title: string): ToolAnnotations =>
  ({ title, readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const destructive = (title: string): ToolAnnotations =>
  ({ title, readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false });

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  gemini_enterprise_search: read('Search enterprise data'),
  gemini_enterprise_ask: read('Ask enterprise data (grounded answer)'),
  gemini_enterprise_get_document: read('Get document'),
  gemini_enterprise_get_operation: read('Get long-running operation status'),
  gemini_enterprise_inspect: read('Inspect Gemini Enterprise resources'),
  gemini_enterprise_inspect_licenses: read('Inspect licenses and seat usage'),
  gemini_enterprise_manage_apps: destructive('Manage apps and app IAM'),
  gemini_enterprise_manage_datastore: destructive('Manage data stores and data store IAM'),
  gemini_enterprise_configure_connector: destructive('Manage data connectors'),
  gemini_enterprise_manage_target_sites: destructive('Manage website target sites'),
  gemini_enterprise_manage_documents: destructive('Import, delete or purge documents'),
  gemini_enterprise_manage_schema: configure('Manage data store schema'),
  gemini_enterprise_manage_controls: destructive('Manage serving controls'),
  gemini_enterprise_manage_agents: destructive('Manage agents'),
  gemini_enterprise_manage_skills: destructive('Manage Vertex AI platform skills'),
  gemini_enterprise_manage_features: configure('Manage web app feature toggles'),
  gemini_enterprise_manage_models: configure('Manage model availability'),
  gemini_enterprise_manage_search_ui: configure('Manage search UI settings'),
  gemini_enterprise_manage_assistant: configure('Manage assistant governance'),
  gemini_enterprise_manage_observability: configure('Manage observability settings'),
  gemini_enterprise_manage_knowledge_graph: configure('Manage Knowledge Graph settings'),
  gemini_enterprise_manage_licenses: destructive('Manage licenses and seats')
};

export function withAnnotations<T extends { name: string }>(tools: T[]): Array<T & { annotations: ToolAnnotations }> {
  return tools.map(tool => {
    const annotations = TOOL_ANNOTATIONS[tool.name];
    if (!annotations) throw new Error(`Missing annotations for tool ${tool.name}`);
    return { ...tool, annotations };
  });
}
