/**
 * Validation of citation_mappings for custom MCP data stores, following
 * "Configure citations for custom MCP data stores" (Gemini Enterprise docs, GA 2026-10-16).
 */
const ROLES = new Set(['items', 'uri', 'title', 'snippet', 'id']);
const MAX_ENTRIES = 101;
const MAX_POINTER_LENGTH = 512;

function validatePointer(tool: string, role: string, pointer: unknown) {
  if (typeof pointer !== 'string') throw new Error(`citation_mappings["${tool}"].${role} must be a string JSON Pointer.`);
  if (pointer === '') return;
  if (!pointer.startsWith('/')) throw new Error(`citation_mappings["${tool}"].${role} must start with "/" (RFC 6901) or be "".`);
  if (pointer.length > MAX_POINTER_LENGTH) throw new Error(`citation_mappings["${tool}"].${role} exceeds ${MAX_POINTER_LENGTH} characters.`);
  if (/~(?![01])/.test(pointer)) throw new Error(`citation_mappings["${tool}"].${role} has an invalid escape: use ~0 for "~" and ~1 for "/".`);
}

export function validateCitationMappings(mappings: unknown): Record<string, Record<string, string>> {
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) {
    throw new Error('citation_mappings must be an object keyed by tool name ("" for the default entry).');
  }
  const entries = Object.entries(mappings as Record<string, unknown>);
  if (entries.length > MAX_ENTRIES) throw new Error(`citation_mappings supports at most ${MAX_ENTRIES} entries.`);

  const defaultHasUri = typeof (mappings as any)['']?.uri === 'string';
  for (const [tool, mapping] of entries) {
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
      throw new Error(`citation_mappings["${tool}"] must be an object of role -> JSON Pointer.`);
    }
    for (const [role, pointer] of Object.entries(mapping)) {
      if (!ROLES.has(role)) throw new Error(`Unknown citation role "${role}" for "${tool}". Allowed: items, uri, title, snippet, id.`);
      validatePointer(tool, role, pointer);
    }
    if (tool !== '' && !defaultHasUri && typeof (mapping as any).uri !== 'string') {
      throw new Error(`citation_mappings["${tool}"] needs a uri pointer (directly or via the "" default entry).`);
    }
  }
  return mappings as Record<string, Record<string, string>>;
}
