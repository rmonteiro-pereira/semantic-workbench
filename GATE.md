# Batch 1 gate

The full unit suite passes. Browser results retain five failures reproduced on the existing baseline or supplied as known on main; the batch is not a fully green gate. Screenshots, UI regression comparison and architecture review are separate jobs.

Tested source HEAD: `a62879c4703e193120123f5f39fe74bc586f6061`. The gate-record commit that follows changes documentation only.

All heavy commands ran serially on the development server with Bun 1.4. Long drivers were detached with logs and status files. Evidence is under `/srv/dev/tmp-batch-1/gate/`: `full/` for all forty browser suites, `followup/` for the corrected fixtures, ownership mutants and autosave, `final/` for main comparisons and the successful full unit/mutation run, and `pristine/` for the final clean-source checks.

## Full gate commands

| Command | Final summary |
| --- | --- |
| `bun test` | 3261 pass; 0 fail; 379726 expect calls. Ran 3261 tests across 456 files. [2508.52s] |
| `bun --bun run check` | Exit 0; format correct; Oxlint 2742 warnings, 0 errors; comment/theme/brand checks clear |
| `bun --bun run build` | Exit 0; `✓ built in 3.12s` (existing large-chunk warning) |
| `bun scripts/ci-validate.ts --step mutation` | `825/825 targeted mutants killed; all unmodified module baselines passed.` `Gate passed in 2677.0 seconds` |
| `bun run test:mcp` | `Acceptance run passed: 10 steps.` |

## Fix commits

- `f65ae02f` — fix: register proposal operations at the shared boundary. Proposal routes lacked the metadata required by the operation boundary; this caused the HTTP 500 before the handler.
- `9e22d0ea` — fix: include integrated browser suites in the pipeline matrix. The Azure browser matrix omitted the proposals, usage-traffic and Tessera suites.
- `ba594bd8` — generated: include pinned ontology data in schema outputs. Shared Tessera base selection needed the pinned ontology data inside the generated layer; the generator now emits it reproducibly.
- `63351998` — fix: keep shared format and usage imports within their layer. Shared Tessera imported a root schema, and browser usage imported a server value; pure data and parsing now respect layer boundaries.
- `bfce89e5` — fix: supply usage status in the Admin browser fixture. The Admin mock returned an empty object for usage, crashing the new section; it now returns the disabled-counter response.
- `7660261f` — fix: exercise remote SCM actions on an ordinary branch. The general remote journey used a protected work branch; it now creates an ordinary branch while preserving authoring and remote checks.
- `e571121c` — docs: clarify the shared schema boundary and agent request flow. Architecture descriptions now identify the shared usage/schema ownership accurately.
- `2aa5c79a` — test: allow sign-in to settle on the shared development server. A fixed five-second sign-in ceiling was too short on the shared server; only the ceiling changed to twenty seconds.
- `3bb34bd5` — generated: refresh administration replay for proposal and usage routes. New proposal/usage route decisions changed the deterministic dry-run fixture; existing entries remain unchanged.
- `d4268b0b` — fix: publish Git setup commits before pushing the default branch. Git setup attempted to push before publication; it now publishes and switches to default before both remote checks.
- `18f4333e` — test: wait for the workspace after reloading the Git setup tour. The Git setup viewport tour could click before the reloaded workspace rendered; it now waits for that control.
- `9f7de863` — test: publish local work before checking machine push credentials. The machine-credential fixture pushed personal work; it now publishes then pushes default, preserving credential and host assertions.
- `7dc32b7a` — test: recognize the isolated proposal mutation harness. The boundary scanner treated the isolated proposal mutation harness as application code; its exact path joins the existing fixture list.
- `7c9ae4be` — test: cover proposal attribution in the complete audit fixture. The complete audit-input fixture omitted the new proposal field; serializer/storage checks now cover it.
- `c8c0d688` — test: retarget ownership mutants to contribution-aware branch checks. Contribution-aware branch checks orphaned six mutation anchors; the same faults now target the new predicate shape.
- `a62879c4` — test: verify publication before pushing autosaved work. Autosave expected a work-branch push to succeed; it now proves refusal, publishes, pushes default and verifies the remote commit.

## Browser commands

Every row runs `bun scripts/ci-validate.ts --step browser --suite <script>`. Final browser result: 35 passed, 5 red. Each red command ends with `Failed gate steps: browser`; its assertion and baseline evidence are recorded below.

| Script | Summary |
| --- | --- |
| `test:auth` | Gate passed in 137.1 seconds |
| `test:two-editors` | Gate passed in 112.7 seconds |
| `test:admin` | Gate passed in 126.5 seconds |
| `test:ui` | Gate passed in 59.5 seconds |
| `test:responsive` | RED — see baseline findings below |
| `test:edges` | Gate passed in 27.8 seconds |
| `test:grouping-validation` | Gate passed in 42.3 seconds |
| `test:overview-areas` | Gate passed in 29.2 seconds |
| `test:published-snapshot` | Gate passed in 32.4 seconds |
| `test:examples:ui` | Gate passed in 110.5 seconds |
| `test:projects` | Gate passed in 37.9 seconds |
| `test:trash` | Gate passed in 43.4 seconds |
| `test:sidebar` | Gate passed in 194.0 seconds |
| `test:metrics` | Gate passed in 61.2 seconds |
| `test:graph` | RED — see baseline findings below |
| `test:editor` | RED — see baseline findings below |
| `test:item-edit` | Gate passed in 65.3 seconds |
| `test:addresses` | Gate passed in 17.8 seconds |
| `test:mcp:browser` | Gate passed in 15.4 seconds |
| `test:rdf-edit` | Gate passed in 40.7 seconds |
| `test:validation` | Gate passed in 20.8 seconds |
| `test:tessera` | Gate passed in 13.4 seconds |
| `test:scm` | Gate passed in 53.8 seconds |
| `test:odcs` | Gate passed in 37.5 seconds |
| `test:lineage` | RED — see baseline findings below |
| `test:autosave` | Gate passed in 30.7 seconds (follow-up) |
| `test:sql` | Gate passed in 34.4 seconds |
| `test:git-setup` | Gate passed in 30.6 seconds |
| `test:monorepo` | Gate passed in 25.3 seconds |
| `test:dialogs` | Gate passed in 321.8 seconds |
| `test:telemetry` | Gate passed in 79.0 seconds |
| `test:terminology` | Gate passed in 104.4 seconds |
| `test:mappings-layout` | Gate passed in 75.3 seconds |
| `test:clipping` | Gate passed in 28.9 seconds |
| `test:mapping-graph` | Gate passed in 114.2 seconds |
| `test:back-history` | RED — see baseline findings below |
| `test:usage-traffic` | Gate passed in 158.4 seconds |
| `test:proposals` | Gate passed in 39.0 seconds |
| `test:theme` | Gate passed in 188.1 seconds |
| `test:brand` | Gate passed in 12.3 seconds |

## Scope and causes

Proposal creation returned HTTP 500 before its handler because the mandatory operation boundary could not find `POST /api/projects/:slug/proposals` in the inventory. The proposal routes had been merged without their inventory entries. All eleven operations and the promotion publication steps are now registered; the Git queue and project write locks did not need a change.

The browser pipeline matrix omitted the three integrated suites. Shared Tessera code imported a pinned schema outside its layer, while the browser usage module imported a server value. The schema generator now supplies the pinned JSON under generated output, and the pure counted-operation table/parser live in shared code with the server import preserved by a re-export.

Admin tests crashed because their mock answered the new usage endpoint with an empty object. Its disabled-counter response now has the real shape. The publication policy also invalidated several test journeys that pushed work branches. Those journeys now preserve refusal checks and publish before pushing the default branch, or use an ordinary branch where they test general remote behavior.

The remaining unit failures were fixture drift: local credential tests pushed personal work, the auth boundary scanner did not recognize the isolated proposal mutation harness, and the complete audit fixture lacked proposal attribution. Ownership mutation anchors also needed retargeting after contribution branches extended the predicates; no mutant was removed.

## Existing browser failures

All four newly observed failures were reproduced against main `84642cb0` from an archive in isolated server scratch space, serially with the same Bun and unchanged dependencies. No performance limit or geometry assertion was relaxed.

| Suite | Batch evidence | Main evidence |
| --- | --- | --- |
| `test:responsive` | Canvas height 481; requires more than 504 | Known baseline failure supplied in the brief; intentionally unchanged |
| `test:graph` | Longest pierce main-thread task 300 ms, then 222 ms; limit 100 ms | 255 ms at the same assertion |
| `test:editor` | 57.28 ms/key, then 57.54 ms/key; requires less than 30 ms/key | 58.51 ms/key at the same assertion |
| `test:lineage` | Walk here on customers intercepted by Resize sidebar | Same customers click intercepted by the sidebar separator |
| `test:back-history` | Empty graph fingerprint makes collapse look unchanged | Same empty graph fingerprint and unchanged-collapse assertion |

A diagnostic history readiness wait exposed a later overlapping lineage-button click and was discarded. No history or lineage code change is included. These are reported separately under the brief's instruction to report existing integrity defects rather than expand the integration scope.

## Fixture review

The dry-run baseline was regenerated with its existing `dryRunBaseline()` builder: only the usage GET and three proposal read cases were added; matrix cases increased from 1035 to 1143. Existing cases and the people/audit fields are unchanged. The HTTP characterization recorder produced no diff. The generated ontology JSON is the pinned schema data, with no schema behavior change.

## Reviewer and capture handoff

The gate is not entirely green because of the five browser baseline failures above. The architecture review and screenshot/UI regression comparison remain separate jobs. Capture the committed batch revision and retain light/dark, phone, long-text and empty/loading/error coverage for the added proposal, usage and Tessera interfaces. The usage-traffic suite, including counters-off behavior, passed. The proposal and two-editor suites passed their collaborative promotion flows. MCP acceptance passed; its usage counting integration was already present in the starting handoff.

The pre-push check reports one finding: the required architecture review has not been recorded. It reports no attribution, confidential-term or credential findings. The architecture review remains with the later reviewer as specified in the brief; no review marker was created. The repository has no `scripts/commit_cadence.py`, so that requested checker is unavailable.

Readability checks passed for all sixteen changed TypeScript files. The three updated project documentation files passed the full leak scan; this internal gate record uses the confidential-only scan.

No merge, origin push, deployment or production access is part of this gate.

## Supporting focused verification

| Command scope | Summary |
| --- | --- |
| Proposal tests, inventory and operation parity | 121 pass; 0 fail; 2977 expect calls; 21 files; 456.45 s |
| Pipeline tests | 239 pass; 0 fail; 665 expect calls; 12 files; 8.78 s |
| Layout boundaries, schema reproducibility, Tessera derivation/base checks and counted-operation table | 19 pass; 0 fail; 69 expect calls; 5 files; 2.44 s |
| Admin clipping, geometry, dialogs, presentation and usage settings | 38 pass; 0 fail; 71 expect calls; 5 files; 35.77 s |
| Remote credentials, boundary scanner and complete audit fixture | 18 pass; 0 fail; 187 expect calls; 3 files; 8.59 s |
| `bun scripts/mutation-tests.ts --only secrev-worktrees` | 9/9 mutants killed; baselines passed |
| `bun scripts/mutation-tests.ts --only secrev-hooks` | 5/5 mutants killed; baselines passed |

The first complete unit run ended with 3258 pass, 3 fail, 379709 expect calls across 3261 tests in 456 files (2417.60 s). The three failures were corrected in the fixture commits above. The first mutation attempt stopped in preflight on six stale anchors; none was counted as a killed mutant. The final summaries supersede these initial results.

The complete mutation result includes 14 proposal, 11 usage, 24 Tessera and 21 MCP mutants, all killed. The full unmodified UI browser baseline also passed as `test:ui`.

Final clean-source verification passed `fmt`, `check`, `build` and MCP acceptance with no working-tree changes. The detached drivers exited; no process started for this gate remains running.
