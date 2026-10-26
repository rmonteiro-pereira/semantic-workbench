---
description: "Use when changing the browser administration UI, access review, roles, grants, policies, settings, audit, or admin API client."
applyTo: "src/app/admin/**"
---
# Browser administration

- `src/app/admin/` is the browser access-administration feature. Keep its UI and typed browser API
  client here; server routes and authorization remain under `src/server/`.
- Treat the server as authoritative for identity, permissions, validation, and mutations. A hidden
  control or client-side check never grants or enforces access.
- Preserve the reviewed-change flow: show the server's validation/dry-run result, require explicit
  confirmation, and surface failures without pretending a change succeeded.
- Follow the existing section/component and typed API patterns. Keep API response validation in the
  client boundary rather than spreading untyped response handling through views.
- Admin configuration is persisted under the server's `DATA_DIR/admin/`; do not add runtime
  configuration files under `src/app/admin/`.
- For behavior changes, run the focused admin tests and browser check documented in
  [development.md](../../docs/development.md).
