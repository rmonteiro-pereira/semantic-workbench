---
description: "Use when adding or changing tests, fixtures, browser checks, or verification scripts."
applyTo:
  - "tests/**"
  - "scripts/check-*.ts"
  - "scripts/*-check.ts"
  - "scripts/*-checks.ts"
  - "scripts/*-tests.ts"
  - "scripts/*-mutants.ts"
  - "scripts/*-cases.ts"
  - "scripts/*-verify.ts"
  - "scripts/verify-*.ts"
  - "scripts/mutation-case.ts"
  - "scripts/ui-tests.ts"
---
# Tests and fixtures

- Prefer focused tests that assert externally observable behavior and failure cases, following
  nearby test conventions.
- Use temporary workspaces, fixture identities, and local Git remotes. Never point mutation tests
  at a real `data/` directory, production workspace, identity tenant, or hosted remote.
- Keep fixtures representative and minimal. Do not put secrets or real user/document data in test
  assets.
- For browser checks, use the existing test harness and document any required setup. See
  [development.md](../../docs/development.md) for test commands and isolation rules.
- Verification scripts in `scripts/` should use the same isolation and fixture-safety rules as tests;
  do not point them at real workspaces, tenants, or hosted remotes.
