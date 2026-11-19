# Compile everywhere handoff

## Current state

The conversion journey succeeds. The POST was already successful; the workspace refresh made the
converted file dirty and the UI replaced the success state with its opening eligibility blocker.
The dialog now retains its opening eligibility. Server-side cleanliness, input hashes, exact digest,
unit compile and guarded save checks remain authoritative. The original success assertion is retained;
the journey additionally checks the conversion HTTP response and exactly one changed file.

Completed in this continuation: T019, T024, T034, T035, T037 and T038. T036's executable inventory/parity
portion passed; its checkbox remains open because this base has no MCP registry or tests.
T024: on 2026-11-18 the official release list is empty, the sole tag is osi-0.1.1-rc1 and the
development schema declares 0.3.0.dev0. No stable 0.3.0 release is adopted. Research is in research.md;
detailed departures and proofs are in evidence.md.

## Review changes

- One shared synchronous digest replaces the browser shim and Vite alias. Native Bun and browser Web
  Crypto comparisons prove identical hashes, including block boundaries. No dependency was added.
- Compile HTTP acknowledgements require completed HTTP 200, supported result states and typed
  identifiers. Conversion acknowledgements must match the requested path and reviewed digest.
- The compile guide, README, architecture, user guide, development guide, changelog and contracts
  describe the implemented behavior; MCP tools are explicitly unavailable on this base.

## Proof summaries

- Feature tests: 111 pass, 0 fail, 375 assertions across 17 files.
- Inventory, route actions, matrix and HTTP/in-process parity: 45 pass, 0 fail, 45,035 assertions.
  Generated docs/operations.md is unchanged.
- Unchanged controls: compile-dialog.test.tsx, 13 pass, including unused export and validation entries.
  This is a targeted control proof, not a visual regression comparison.
- Browser journey: PASS review, acceptance, ZIP download, unpublished check and one-file conversion;
  desktop/phone geometry and no console errors. Runtime digest comparisons also pass.
- Scale: 200 documents, 19,551,550 bytes, compile and ZIP in 23.20 s (30-second limit passed).
- check: exit 0, including TypeScript, formatter, lint, comments, theme and brand; lint has warnings.
- build: exit 0, built in 3.07 s, with module-directive and chunk-size warnings.
- Readable-code checker passed all changed TypeScript files. No commit_cadence.py exists here.
- The inherited handoff records 23/23 targeted mutants killed; no mutation suite was rerun here.

## Shared-file blocks and integration notes

Inherited blocks: four route-action rows, four inventory entries, handler registration, generated
operations reference, fileSizes in published-snapshot.ts, layoutFor in workspace.ts, export/validation
entry points, AppDialogs wiring, package/gate registration and targeted mutation registration.
bundleFiles moved to the owning server module; findings formatting is shared. UnitRead carries place
for CLI-identical manifest provenance. This continuation adds documentation blocks and replaces the
owning digest implementation; vite.config.ts loses the obsolete resolver block. No generated file
was hand-edited. The complete departures list is in evidence.md.

## Waiting and batch gate

Leave T015 and T020 for the later screenshot job; T021-T023 and the MCP portion of T036 for MCP
integration; multi-file/dependency work for the complete-unit feature. T025-T033 require the stable
upstream release, and metric conversion additionally needs its adapter. T039 and T040 stay unticked.

The integrated-batch owner runs once before merge: full bun test, test:mutation, test:compile,
test:validation, test:auth, the remaining browser suites, UI comparison with the last release and
architecture-reviewer. No full suite or architecture review ran in this continuation. There is no PR
or project push; only the authorized scratch transport was used.

The reviewer should check source pinning, whole-unit readability, exact acceptance, guarded one-file
conversion, export authority and audit, shared digest cost, MCP dispositions and the documented
single-folder limit. Screenshot/theme coverage and full-screen equality are still pending.

The repository formatter excludes Markdown. Leak scanning passes the changed product docs except
six existing literal /tmp screenshot examples in development.md; their existing commands are preserved.
Internal evidence/handoff logs are scanned for confidential terms. Port 5431 was checked before each
browser start, and each run stopped the exact process group it started; verify it is free before reuse.
