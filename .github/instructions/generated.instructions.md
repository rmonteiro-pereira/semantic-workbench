---
description: "Use when changing generated browser validators or the schemas and tooling that produce them."
applyTo:
  - "schemas/**"
  - "src/generated/**"
  - "scripts/compile-schemas.ts"
---
# Generated schema validators

- Treat `schemas/` and the generator as sources of truth; `src/generated/` is checked-in output.
- Change the source schema or `scripts/compile-schemas.ts`, then regenerate with
  `bun run schemas:compile`. Do not make hand-maintained fixes directly in generated output.
- Verify the generated diff is limited to the intended schema family and run the related schema
  validation tests.
