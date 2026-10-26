---
description: "Use when changing React browser UI, client state, editors, graph views, styling, or browser-facing domain features."
applyTo:
  - "src/main.tsx"
  - "src/style.css"
  - "src/app/**"
  - "src/brand/**"
  - "src/auth/**"
  - "src/edit/**"
  - "src/editor/**"
  - "src/graph/**"
  - "src/mappings/**"
  - "src/metrics/**"
  - "src/odcs/**"
  - "src/projects/**"
  - "src/scm/**"
  - "src/shared/**"
  - "src/sql/**"
  - "src/theme/**"
  - "src/validation/**/*.tsx"
  - "src/validation/**/*.css"
  - "src/observability/browser-report.ts"
  - "src/observability/page-reporting.ts"
  - "src/observability/reporter.ts"
---
# Browser application

- Keep UI, state, and effects in their owning domain folder. Put code in `src/shared/` only when
  multiple domains genuinely share it; keep `src/` root for the entry point and global assets.
- Follow the existing React and TypeScript patterns. Preserve stable event handling and synchronous
  source-text updates where the editor depends on them.
- Keep browser code within its trust boundary: server-reported capabilities may inform presentation,
  but only server code authorizes reads and writes.
- Preserve keyboard access, responsive behavior, and the repository's theme and branding tokens.
  Prefer existing shared controls and helpers over parallel implementations.
- See [ARCHITECTURE.md](../../ARCHITECTURE.md) for domain ownership and
  [development.md](../../docs/development.md) for focused browser verification.
