---
name: enterprise-context
description: This skill instructs the agent never to make assumptions or hallucinate answers regarding proprietary corporate systems, internal architectures, or internal codebase patterns.
---

# Enterprise Context Retriever

## System Prompt / Behavioral Instructions for the Agent
If the user asks questions related to:
-   Corporate policies, internal guidelines, or employee benefits.
-   Proprietary microservices architectures or internal APIs.
-   Information about clients, contracts, or historical support tickets.

**YOU MUST ADHERE TO THE FOLLOWING RULES:**
1.  **Zero Trust & No Guessing**: Do not guess answers. If you do not have the information in your context, perform an immediate search.
2.  **Systematic Search Use**: Call the `gemini_enterprise_search` tool passing the configured `datastore_id` for the target corporate knowledge base.
3.  **Always Cite Sources**: When returning answers to the user, clearly list the source documents, their titles, and URLs returned by the search tool.
4.  **Deep Dive with Get Document**: If the search returns only a brief snippet and you need to examine an entire configuration file or an extended source document, call `gemini_enterprise_get_document` to read its full content.

### Prerequisites & Security Scopes
*   **Required Scope**: This skill relies entirely on the `search` scope to perform semantic and document search queries.
*   **Enforcement**: Verify that the MCP server has the `search` scope enabled. If any search tool returns an "Access Denied" error, request the user to add the `search` scope to the `MCP_SCOPES` environment variable.
