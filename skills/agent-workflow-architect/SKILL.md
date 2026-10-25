---
name: agent-workflow-architect
description: Design, register and govern Gemini Enterprise agents and Vertex AI platform skills with the ge-app-mcp tools. Use when asked to create or change an agent (Agent Designer low-code or multi-agent, A2A, ADK on Agent Engine), set its sharing or starter prompts, inspect existing agents, or create, update, find or delete skills in the Vertex AI Skill Registry.
license: Apache-2.0
metadata:
  version: "0.4.0"
---

# Agent & Skill Architect

## 1. Understand what exists
- Always inspect with `gemini_enterprise_inspect` (`target: "agents"`, with `engine_id` to list or
  `engine_id` + `agent_id` to get details): it is `readOnlyHint: true`, so in Gemini Enterprise it runs
  in parallel with zero confirmation prompts. Reserve `gemini_enterprise_manage_agents` for `create`,
  `update`, and `delete` (call mutating tools one at a time sequentially inside Gemini Enterprise).
  Agent types:
  `lowCodeAgentDefinition` (Agent Designer), `a2aAgentDefinition`, `adkAgentDefinition`,
  `managedAgentDefinition` (Google-made, read-only: never modify or recreate these).
- For low-code agents, read the whole `nodes` array: `root_agent` routes to the nodes listed in
  `subAgentIds`, and each node has its own instruction, model, tools and data stores.

## 2. Pick the agent type
| Need | `agent_type` | Required inputs |
| :--- | :--- | :--- |
| Natural-language playbook, optionally with specialists | `low-code` | `instruction`, optional `model`, `datastores`, `tools`, `subagents` |
| Existing service speaking the A2A protocol | `a2a` | `endpoint_url` (https) |
| Agent built with ADK and deployed on Vertex AI Agent Engine | `adk` | `reasoning_engine` (`projects/.../locations/.../reasoningEngines/...`) |

## 3. Multi-agent design (low-code)
- Keep the root agent a router: its instruction says when to delegate to each sub-agent.
- Give each sub-agent one responsibility, a clear `description`, and only the data stores and tools it
  needs.

## 4. Governance
- `sharing_scope`: start with `PRIVATE`, widen to `RESTRICTED` or `ALL_USERS` only on request.
  Sharing with specific people and ownership transfer are done in the console; after an ownership
  transfer, scheduled and event triggers are disabled and must be re-enabled by the new owner.
- `starter_prompts`: 2-4 short examples of what the agent is for.
- The lifecycle `state` (`ENABLED`, `PRIVATE`, `SUSPENDED`, ...) is read-only: report it, do not try to set it.

## 5. Platform skills (Vertex AI Skill Registry)
- Find before you create: `gemini_enterprise_inspect` (`target: "skills"`, optional `query` or `skill_id`,
  or `target: "skill_revisions"` with `skill_id`).
- `gemini_enterprise_manage_skills` `create` needs `zipped_filesystem`: a base64 ZIP with `SKILL.md` at
  the root (frontmatter `name` in lowercase with hyphens, `description` with trigger phrases).
- `create`, `patch` and `delete` start operations: poll with `gemini_enterprise_get_operation` until
  `DONE` before changing the same skill again (an active operation makes the next change fail).
- Skill Registry calls need the `cloud-platform` OAuth scope; when it is not available, explain that
  platform skills must be managed from a local harness or the console.

## 6. Safety
Ask for explicit confirmation before `delete` on agents or skills, and before widening sharing to
`ALL_USERS`. State the resource and the consequence first.
