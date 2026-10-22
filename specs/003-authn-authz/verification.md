# Verification

## Local gate

The owner runs the complete gate with containers and Chromium available. Restricted development
checks do not stand in for the full gate.

| Criterion | Command | First full duration | Result |
| --- | --- | --- | --- |
| SC-013 | `bun run ci:validate` | about 46 min (2026-10-22, shared development machine) | see below; the owner's workstation run is still to be recorded |

### First full run on the development machine (2026-10-22)

The machine was shared with other heavy jobs throughout (load average between 20 and 70 on 28
threads), so durations are upper bounds and timing budgets were at risk.

| Step | Duration | Result |
| --- | --- | --- |
| verify | 169 s | passed |
| mutation | 77 s | passed, 151 of 151 mutants killed |
| browser | about 1,460 s over 23 suites | 21 passed; `test:graph` (longest main-thread task 118–140 ms against 100 ms) and `test:editor` (31–33 ms per keystroke against 30 ms) missed their timing budgets |
| image | 123 s | passed |
| container | 928 s | passed |
| pipeline | 7 s | passed |

The two timing misses repeat only under that load. This change touches no application code (`src/`
and `server/` are unchanged), and both suites passed on the same frontend in the previous gate run.
Their budgets are unchanged. Both suites must pass in the owner's run before SC-013 is accepted.

## Sign-in (development machine, 2026-10-22)

Gates this change affects, run on the integrated tree. The full browser matrix and the timing
budgets run once more in the final gate.

| Check | Result |
| --- | --- |
| `bun test` | 914 passed |
| `bun run test:mutation` (through `ci:validate --step mutation`) | 163 of 163 mutants killed |
| `bun run test:auth` | passed: every fixture person, refresh, expiry, directory overage and failure, live updates, sign-out, local mode unchanged; screenshots at the four widths |
| `bun run test:auth:keycloak` | passed against Keycloak 26.4 (pinned digest) |
| `bun run test:container` | passed: local group and the server-mode group with the mock provider |
| `pipeline:lint`, dry runs for `pr`, `main`, `tag:v0.4.0-alpha.1` | passed; the `auth` leg is in the browser matrix and no Keycloak or service container appears |

## Azure delivery definition (development machine, 2026-10-22)

No Azure, registry or identity provider was contacted; the deploy paths ran against the fake client.

| Check | Result |
| --- | --- |
| `bun test` | 1,001 passed |
| `ci:validate --step mutation` | 169 of 169 mutants killed |
| `ci:validate --step image` | passed |
| `ci:validate --step container` | passed, including `deploy:smoke --loopback` against the server-mode container (10 of 10 checks) |
| `pipeline:lint`; dry runs `pr`, `main`, `tag:v0.4.0-alpha.1`, rollback pipeline | passed; Deploy runs on tags only with the deploy connection; Rollback is manual and tag-only |
| `deploy:azure -- --fake`, `deploy:rollback -- --fake --to previous`, every script's `--help` | passed |

## Read filtering (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,044 passed |
| `ci:validate --step mutation` | 176 of 176 mutants killed |
| `test:auth` | passed, including the read-visibility part and "1 file you cannot open" |
| Browser suites | all passed; `test:lineage`, `test:mappings-layout`, `test:trash` and `test:examples:ui` each failed once while the machine's load average was 56–75 and passed on rerun; no budget was changed |
| `test:container` | passed (local, server-mode and smoke groups) |

## Write authorization (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,091 passed |
| `ci:validate --step mutation` | 185 of 185 mutants killed |
| `test:auth` | passed, including the role-aware controls |
| Browser suites | all passed; `test:ui`, `test:autosave` and `test:dialogs` failed once each because the Vite server or the page process stopped before the first check, and passed on rerun; no budget was changed |
| `test:container` | passed (local, server-mode and smoke groups); one earlier run stopped in `test:responsive` and the rerun passed |

## Timing budgets on an idle machine (development machine, 2026-10-22)

Commit 0240c68, load average about 1 on 28 cores, each suite run alone through the gate.

| Suite | Result |
| --- | --- |
| `test:graph` | passed; 1,000-entity neighbourhood centred and laid out in 220 ms; longest main-thread task while piercing 0 ms |
| `test:editor` | passed; 26.3 ms mean per keystroke without a save (30 ms budget), 17.2 ms with an automatic save in flight; inline finding 333 ms after the last keystroke (500 ms budget) |

These replace the misses measured under load earlier; no budget was changed.

## Admin panel (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,194 passed |
| `ci:validate --step mutation` | 199 of 199 mutants killed |
| `test:auth`, `test:admin` | passed; Admin panel screenshots at 390×844, 1280×720, 1440×900 and 2560×1440 reviewed |
| Browser suites | `test:responsive`, `test:projects`, `test:trash` and `test:dialogs` passed; run in parallel, Vite sometimes did not start, and each passed alone |
| `test:container` | passed (local, server-mode and smoke groups) |

## Agent clients (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,216 passed |
| `ci:validate --step mutation` | 204 of 204 mutants killed |
| `test:auth`, `test:admin` | passed, including both agent-client checks |
| `test:container` | passed (local, server-mode and smoke groups) |

## Governed metrics and classifications (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,262 passed |
| `ci:validate --step mutation` | 218 of 218 mutants killed |
| `test:auth`, `test:admin` | passed, including the governance steps |
| Browser suites | `test:metrics`, `test:odcs`, `test:item-edit`, `test:projects`, `test:trash`, `test:autosave` and `test:ui` passed; `test:odcs` once needed a rerun because Vite did not start while three servers optimised dependencies at once |
| `test:container` | passed (local, server-mode and smoke groups); one run stopped in `test:monorepo` waiting for a clone in the image and the rerun passed |

## Remote Git with personal credentials (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,285 passed |
| `ci:validate --step mutation` | 238 of 238 mutants killed |
| `test:auth` | passed, including the connected-accounts dialog and the connect prompt |
| Browser suites | `test:scm` and `test:git-setup` passed; `test:git-setup` once stopped at its credential-guide step and passed on rerun |
| `test:container` | passed (local, server-mode and smoke groups) |

## Owner trial

The owner records the report of `deploy/trial-runbook.md` here after running it on the target.
