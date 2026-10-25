# ADK admin agent for Gemini Enterprise

A minimal [Agent Development Kit](https://adk.dev) agent that administers Gemini Enterprise through
`ge-app-mcp` and the skills shipped in this repo (`skills/admin-assistant`, `skills/agent-workflow-architect`).

- **Skills**: loaded with ADK `SkillToolset` straight from `../../skills`, so the agent follows the same
  playbooks as Gemini Enterprise and coding harnesses.
- **Read/write split**: tools are split by the server's MCP `readOnlyHint`. Inspection tools
  (`gemini_enterprise_inspect`, `gemini_enterprise_inspect_licenses`, `search`, `ask`, ...) run freely;
  every `manage_*`/`configure_*` call needs human confirmation (ADK `require_confirmation`). A tool without
  annotations is treated as mutating.
- **Identity**: every Google call runs as a user, never as a shared service account.

Tested with `google-adk[mcp]==2.12.0`, `mcp==2.3.0`, Python 3.12 (checked 2026-10-25).

## Run locally (stdio)

```bash
cd examples/adk-admin-agent
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp ge_admin_agent/.env.example ge_admin_agent/.env   # set GCP_PROJECT and the model settings
gcloud auth application-default login                 # the server runs with *your* ADC identity
.venv/bin/adk web                                     # or: .venv/bin/adk run ge_admin_agent
```

The agent starts `npx -y ge-app-mcp@0.4.0` as a subprocess. To use a local build, set
`GE_MCP_COMMAND=node` and `GE_MCP_ARGS=/path/to/ge-app-mcp/build/index.js`.

## Run against a remote server (Streamable HTTP, on behalf of the user)

Point the agent at a server started with `MCP_TRANSPORT=http` (see the root README and ADR-0003):

| Variable | Purpose |
| :--- | :--- |
| `GE_MCP_TRANSPORT=http` | Use Streamable HTTP instead of stdio. |
| `GE_MCP_URL` | e.g. `https://<service>.run.app/mcp`. |
| `GE_MCP_TOKEN_STATE_KEY` | Session state key holding the end user's OAuth access token (default `ge_mcp_user_token`). It is sent as `Authorization: Bearer`. Missing token = the call fails (no fallback). |
| `GE_MCP_CLOUD_RUN_AUDIENCE` | Optional. Cloud Run URL used as ID-token audience; the agent's own identity is sent in `X-Serverless-Authorization`. Needs a service identity with `roles/run.invoker` (Agent Engine, Cloud Run), not user ADC. |
| `GE_MCP_LOCAL_ADC=true` | Local development only: use your own ADC token when the session has none. |

The server must accept the token's OAuth client (`ALLOWED_OAUTH_CLIENT_IDS`) and scope, and the user still needs
the IAM roles for each action: Google IAM decides, not the agent.

## Tests

```bash
.venv/bin/python -m unittest discover -s tests -v
```

The live test starts the real server from `../../build` (run `npm run build` in the repo root first) and
checks the read/write split against the server's annotations; it needs no Google Cloud credentials.
