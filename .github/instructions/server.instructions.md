---
description: "Use when changing the Bun HTTP API, server routes, authentication, authorization, workspace access, persistence, or server operations."
applyTo: "src/server/**"
---
# Server and API

- Keep server-only code under `src/server/`; preserve its Bun runtime assumptions and existing
  resource/domain ownership.
- Authorize on the server before protected reads or mutations. Resolve identity and request scope
  through the established middleware and route-action patterns; unmapped protected routes must
  remain denied.
- Treat project files and versioned `DATA_DIR/admin/` configuration as authoritative. SQLite is a
  derived index. Keep path validation, Git operations, and writes within the configured data root.
- Validate request data at the boundary, return explicit safe errors, and avoid broad catches or
  success-shaped fallbacks. Never expose credentials, tokens, or unfiltered workspace data.
- Keep provider-specific behavior behind the existing authentication/provider interfaces. Document
  configuration and operational changes in the corresponding `docs/` guide.
- Use isolated fixtures and local remotes for tests. See [development.md](../../docs/development.md)
  for relevant test commands and safety requirements.
