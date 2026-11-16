# Quickstart: verifying the operation boundary

Run from the repository root with Bun. These steps are the acceptance path for this feature; the
tasks name the tests behind each.

## 1. HTTP behaviour did not change

```sh
bun test tests/auth/http-characterization.test.ts
```

Passes when every recorded case (route example times caller kind) answers as recorded. The recording
was made on the commit before the refactor (`git log --diff-filter=A -- tests/fixtures/characterization/http-v1.json`).

## 2. A twin gets the same answer as HTTP

```sh
bun test tests/auth/operation-parity.test.ts tests/auth/twin-request.test.ts
```

The parity test prints one line per operation and case. A failure names the operation, the case and
the field that differs (status, body or audit record).

## 3. Old audit months still verify

```sh
bun run audit:verify tests/fixtures/audit-v1
bun test tests/auth/audit-compat.test.ts tests/auth/audit-origin.test.ts
```

## 4. Agent reads do not hide a dry run's evidence

```sh
bun test tests/auth/dry-run-strata.test.ts
```

## 5. Tool lists follow permissions

```sh
bun test tests/auth/operation-listing.test.ts
```

## 6. The inventory covers every route

```sh
bun test tests/auth/operation-inventory.test.ts
bun scripts/operation-inventory-table.ts && git diff --exit-code docs/operations.md
```

To see the test fail on purpose, remove one entry from `policies/operation-inventory.json` or add a
row to `src/server/auth/route-actions.ts` and run the first command again.

## 7. Nothing bypasses the boundary

```sh
bun test tests/auth/boundary-scan.test.ts
bun run test:mutation
```

## 8. The full gate

```sh
bun test && bun --bun run check && bun --bun run build && bun run test:mutation && bun run test:auth && bun run test:admin
```
