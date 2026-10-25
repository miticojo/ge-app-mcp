---
name: enterprise-context
description: Ground answers about internal company knowledge in Gemini Enterprise data instead of guessing. Use when the user asks about corporate policies, internal guidelines, benefits, proprietary systems and APIs, customers, contracts, or past support tickets, or asks to "search", "find" or "check" internal documents.
license: Apache-2.0
metadata:
  version: "0.4.0"
---

# Enterprise Context Retriever

Never guess about proprietary systems, policies or customers. Retrieve, then answer with sources.

## Rules
1. **Search before answering** when the information is not already in your context.
2. **Choose the scope**:
   - `engine_id` (an app) searches every source connected to it (Drive, SharePoint, Jira, connectors...).
     Prefer it for open questions.
   - `datastore_id` targets one source. Prefer it when the user names a source or you need precision.
3. **Pick the tool**:
   - `gemini_enterprise_ask` for a direct question: returns a grounded answer, references and a
     grounding score. For follow-ups, pass `session: "new"` the first time and then the returned
     session name.
   - `gemini_enterprise_search` to explore or list documents. Narrow with `filter`
     (e.g. `category: ANY("policy")`), `order_by`, `relevance_threshold`; page with `page_token`.
     For plain retrieval on a single data store, `search_addon_spec` can turn off generative add-ons
     to reduce cost.
4. **Read the full document** with `gemini_enterprise_get_document` when a snippet is not enough.
5. **Cite sources**: list title and link of every document you used. If the grounding score is low or
   nothing relevant is found, say so instead of filling gaps.
6. **Respect access**: results reflect what the current user may see. Do not try other scopes or
   identities to get around missing results.

## Scope
These tools need the `search` scope. If a tool returns "Access Denied", ask the operator to add
`search` to `MCP_SCOPES`.
