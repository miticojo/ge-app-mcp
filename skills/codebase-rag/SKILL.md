---
name: codebase-rag
description: Resolve bugs and understand internal code patterns using company documentation indexed in Gemini Enterprise. Use when the user shares a stack trace or error message, reports a production or staging bug, or asks how an internal service, library or convention works.
license: Apache-2.0
metadata:
  version: "0.4.0"
---

# Codebase RAG Assistant

## Workflow
1. **Ask first**: call `gemini_enterprise_ask` with the error message or bug description as `question`
   (`engine_id` for all sources, `datastore_id` for the engineering wiki or runbooks).
2. **Check grounding**: if the grounding score is low or there are no references, say the issue is not
   documented and continue with normal debugging. Never present an ungrounded answer as company policy.
3. **Go deeper**: use `gemini_enterprise_search` with a `filter` on repository, service or path metadata
   when available, then `gemini_enterprise_get_document` to read the full runbook, ADR or source file.
4. **Iterate**: keep the returned `session` for follow-up questions on the same incident.
5. **Propose the fix**: explain the documented root cause, cite the documents, and propose a change that
   follows the documented standards.

## Scope
These tools need the `search` scope. If a tool returns "Access Denied", ask the operator to add
`search` to `MCP_SCOPES`.
