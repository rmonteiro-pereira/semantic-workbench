# Semantic Workbench

Semantic Workbench is a React browser application and Bun HTTP API for editing Git-backed
definitions. SQLite is a derived index; project files remain authoritative. Read
[ARCHITECTURE.md](../ARCHITECTURE.md) for component ownership and the relevant guide in `docs/`
before changing a documented contract.

## Repository map

- `src/app/` contains the browser application, including its access-administration feature at
  `src/app/admin/`. Other `src/` domain folders contain shared browser logic and domain features.
- `src/server/` contains the Bun API, server-side authorization, and resource routes.
- `data/admin/` is runtime, versioned server configuration. It is not application source and must
  not be confused with `src/app/admin/`.
- `schemas/` contains source schemas; `src/generated/` contains checked-in generated validators.
- `tests/` and `scripts/` contain tests and verification tools. `.specify/` holds Spec Kit assets;
  `.github/skills/` holds shared Spec Kit agent skills. `.claude/` is a local, ignored Claude
  integration and is not the source for team-shared customizations.

## Working agreements

- Preserve the existing architecture and keep changes within the owning domain. Prefer the
  narrowest relevant instruction in `.github/instructions/`.
- Use Bun and the repository scripts. Run focused tests for behavior changes, then `bun run check`
  or `bun run build` when appropriate; see [development.md](../docs/development.md).
- Tests that touch workspaces, identities, or Git must use isolated temporary fixtures, never a
  real `data/` directory, tenant, or remote.
- Keep authorization decisions on the server. Client-side visibility and guards are explanatory,
  not access control.
- Do not hand-edit generated validators; change their source schemas or generator and regenerate.
- Keep documentation aligned with behavior and avoid duplicating detailed contracts already
  maintained in `docs/`.
