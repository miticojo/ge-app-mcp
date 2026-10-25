# ADR-0002: Node.js 22 baseline and @google-cloud/discoveryengine v3

- **Status**: Accepted (2026-10-25)

## Context
`@google-cloud/discoveryengine` 3.x (latest 3.4.0, 2026-10-08) requires Node.js >= 22; 2.9.0 is
kept only on the `legacy-18` dist-tag. Node.js 20 reached end of life on 2026-04-30. CI ran on a
single Node 20 job. The local npm registry proxy can return stale versions, so the lockfile must
be resolved against `registry.npmjs.org`.

## Decision
- `engines.node >= 22.0.0`; CI matrix `[22, 24]`; publish on Node 22.
- `@google-cloud/discoveryengine@^3.4.0`, `@modelcontextprotocol/sdk@^1.32.2`, `@types/node@^22`.
- Unit tests run with the built-in `node:test` runner (no new test dependency).

## Consequences
- Users still on Node 20 must upgrade (documented as a breaking change in 0.4.0).
- Verified on 2026-10-25: build, unit, handshake, scope and contract suites pass on Node 22.23.2,
  and gRPC clients accept end-user credentials (`auth: new GoogleAuth({ authClient })`).
