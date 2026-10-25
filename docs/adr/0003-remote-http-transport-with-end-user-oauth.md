# ADR-0003: Remote Streamable HTTP transport with end-user OAuth (on-behalf-of)

- **Status**: Accepted (2026-10-25)

## Context
Gemini Enterprise administrators want to run the server's tools from inside Gemini Enterprise.
Gemini Enterprise connects to custom MCP servers only over Streamable HTTP. When the server runs on
Cloud Run (`*.run.app`), Gemini Enterprise sends its service agent ID token in
`X-Serverless-Authorization` (Cloud Run IAM) and keeps the user's OAuth token in `Authorization`.
The server must stay usable from local harnesses over stdio.

## Decision
- `MCP_TRANSPORT=http` starts a **stateless** Streamable HTTP server (one MCP server per request).
  stdio stays the default and keeps using local ADC.
- In http mode every Google API call uses the **caller's** access token (request-scoped
  `AsyncLocalStorage`), so Google IAM applies that user's permissions. There is **no fallback** to
  the server identity: requests without a valid token get 401, and the Cloud Run runtime service
  account has no roles.
- Incoming tokens are checked with Google tokeninfo: `azp`/`aud` must be in
  `ALLOWED_OAUTH_CLIENT_IDS`, the token must carry an accepted scope, the email must be verified, and
  optionally the domain must be in `ALLOWED_EMAIL_DOMAINS`. Results are cached by token hash for at
  most 5 minutes.
- The recommended OAuth scope is `discoveryengine.readwrite` (accepted by every discoveryengine
  v1alpha method) instead of `cloud-platform`. `gemini_enterprise_manage_skills` (Vertex AI) needs
  `cloud-platform` and is therefore not exposed in the Gemini Enterprise deployment.
- Tools carry MCP annotations; pure reads (`search`, `ask`, `get_document`, `get_operation`,
  `inspect`, `inspect_licenses`) are `readOnlyHint: true` so Gemini Enterprise runs them in parallel
  without confirmation prompts, while mutating tools (`manage_*`, `configure_connector`) remain
  `readOnlyHint: false` so every change prompts for review.

## Consequences
- **Deviation from MCP security guidance**: forwarding the user token to Google APIs is token
  passthrough. We accept it because it is the model Gemini Enterprise itself implements, and we limit
  the risk with the client allowlist (against confused-deputy replay), a narrow scope, no other
  downstream services, and no token logging.
- Admins need `roles/serviceusage.serviceUsageConsumer` on the target project in addition to their
  Discovery Engine roles, because the server sends `x-goog-user-project`.
- Identity providers other than Google (Workforce Identity Federation) would need an STS token
  exchange; this is out of scope for 0.4.0.
