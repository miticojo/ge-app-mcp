# ADR-0001: Store assistant settings on the real Assistant resource

- **Status**: Accepted (2026-10-25)

## Context
Up to 0.3.x, `gemini_enterprise_manage_assistant` serialized its settings into
`Engine.commonConfig.companyName` as a `" || ASST_CFG:{...}"` suffix. The settings never
reached the assistant, and the visible company name was polluted. The v1alpha API exposes
`engines/{engine}/assistants/default_assistant` (`generationConfig`, `webGroundingType`,
`defaultWebGroundingToggleOff`, `disableLocationContext`, `knowledgeCatalogEnabled`,
`customerPolicy`) and `Engine.sessionConfig.sessionTtl` for retention.

## Decision
- Read and write only the real `Assistant` resource and `Engine.sessionConfig.sessionTtl`.
- On `update`, migrate legacy values without loss: they only fill gaps left by explicit
  arguments, the placeholder phrase `testbannedphrase` injected by the old default is dropped,
  and the suffix is stripped from `companyName` only **after** the assistant PATCH succeeds.
- `get` reports `legacy_company_name_config_detected` so admins can see engines still to migrate.
- `prompt_chips` is removed (it was never persisted).

## Consequences
- The output shape of `get` changes (breaking for parsers of 0.3.x output).
- The migration is idempotent: once the suffix is removed, nothing else runs.
- Canned queries (starter prompts) are not managed yet (backlog).
