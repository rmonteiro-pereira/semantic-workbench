# Batch 1 handoff

Branch `batch-1`, created from origin/main 84642cb0. Nothing is pushed. The tree is clean and no merge is in progress.
The dev server run was stopped; nothing of mine runs there now (gate scripts and logs are in `/srv/dev/tmp-batch-1/` and `/srv/dev/tmp-batch-1/gate/`).

## Merged, in order

1. `012-shared-proposals`: conflicts in ARCHITECTURE.md, scripts/mutation-case.ts, scripts/mutation-tests.ts, src/server/routes/http.ts (kept both sides) and
   src/server/auth/operation-boundary.ts (one audit append that carries `result`, `publication`, `proposal` and `reason`).
   The commit gate flagged two long inline handlers in ProposalDetail.tsx; they became named functions inside the merge commit.
   `policies/matrix-cases.json` was regenerated afterwards (commit 558dc153, only the 88 proposal lines).
2. `014-usage-counters`: conflicts in CHANGELOG.md, docs/development.md, scripts/mutation-tests.ts (the `--only` filter stays after every `mutants.push`),
   src/server/auth/middleware.ts and src/server/handler.ts (kept both). The gate flagged a 221-character line in TrafficLegend.tsx; split.
3. `011-tessera-format`: conflicts in ARCHITECTURE.md, CHANGELOG.md, scripts/mutation-case.ts, scripts/mutation-tests.ts (kept both, tessera pushed before the `--only` filter).
After each merge the matrix, operations table, HTTP characterization fixture and compiled schemas were regenerated with the documented scripts on midgard; the only difference was the 88 proposal matrix lines.
The dry-run baseline fixture was not regenerated (the baseline test is in the unit run, not seen to finish).

## Integration work done (commits after the merges)

- c84f8af7: `test:proposals` registered in `scripts/gate-suites.ts` (ci-validate reads that list, so nothing else was needed).
- 97b00533 (fix): MCP tool calls were never counted. Counting reads the published snapshot, but ran inside the agent endpoint's own operation, which does not own `snapshot.read`.
  The boundary now counts under the counted operation (`executeOperation`). T042 done: `docs/mcp-contract.md` lists the three counted tools,
  `tests/usage/usage-mcp-tools.test.ts` drives them through the live tools; the old twin-caller case was replaced. Helper `served` added to `tests/mcp/helpers/local-server.ts`.
- 981df2c4: docs say no MCP tool pushes and the push rule refuses `work/`/`proposal/` for every caller (`git_commit` has no push option; existing test covers it).
- 93aa25bc (fix): the contract/route-table test failed on 12 unlisted routes (proposals, usage); rows added as "later".
- b9c6eb26: Tessera T037 to T040 done (ticked in 011 tasks.md): `tests/mcp/tessera-documents.test.ts`; tool findings now carry `code`; descriptions of validate_text, get_findings, read_file say Tessera is accepted; docs/mcp.md and CHANGELOG updated.
  The agent view already covers the four published-only tools (agent context and explain modules). `read_file`/`git_show` return stored bytes with marker and notes on purpose.
  The new MCP and usage tests passed on midgard (tests/mcp: 94 pass, the 1 failure was the route table, fixed since; tests/usage + published-only: 179 pass).
- 99d5fd17 (fix): my local `bun run fmt` formats with a different oxfmt than the gate; it reformatted `src/shared/proposals/proposal.ts` and `check` failed. Restored. Do not trust local fmt; use the dev server.

## Gate results (run on midgard, from commit b9c6eb26)

- `bun --bun run check`: red only for that formatting file (fixed in 99d5fd17; not rerun).
- `bun --bun run build`: built, rc 0.
- `bun run test:mcp`: "Acceptance run passed: 10 steps."
- full `bun test`: the run was cut off after about 30 of ~37 minutes (no summary line), 120 failures seen, listed below. Log: `/srv/dev/tmp-batch-1/gate/unit.log`.
- mutation and all browser suites: not run.

## Red, with the causes found so far

1. About 59 proposal tests: `createProposal` answers 500 "Internal error." (tests/helpers/proposal-fixture.ts). Cause not found; the server log line is truncated. Reproduce with
   `sw-midgard-run -- bun test tests/proposals-sync.test.ts` and read the full ERROR line. Likely an integration problem between 012 and the merged boundary, handler or audit code.
2. `tests/pipeline/*` (about 25 tests): "Browser matrix differs from gate suites". The pipeline file (azure pipelines browser matrix) needs `test:proposals`; check what else the gate list gained.
3. `tests/layout-boundaries.test.ts`: `src/shared/tessera/bases.ts` imports from outside shared (`src/..`), and `src/app/usage/counted-operations.ts` imports a value from `src/server` (the app may import only types). Both come from the features and need fixing.
4. Admin and Settings UI tests (admin-clipping, geometry, presentation, admin-settings-usage and others): may be the known slow-server waits (5 s and 20 s limits) or the usage Settings change; not looked at.
5. Known on main, not to fix: `test:responsive` canvas height 481 vs more than 504.

## Not done

- 012 browser/security scripts that push work branches (`scm-browser-check` pushes `work/local`; `git-setup-browser-check`, `auth-remote-check`, `two-editors-check`) were not run or changed.
  Reading: `scm-browser-check` remote section needs an ordinary branch (for example create `team/notes` with New branch before the remote check, then replace the `work/local` remote references at about lines 203, 206, 208, 288, 314, 418).
  `auth-remote-check` pushes `alice-browser`, `git-setup-browser-check` pushes `main`; both are probably fine. The security-review cases use mocked status only and need nothing. Confirm all by running them.
- 012 task T045 is not ticked. The dry-run baseline, mutation step (every mutant killed), every browser suite, and `check` after the fix are outstanding.
- Ports: the repo helpers take ephemeral ports; the 5401-5499 limit could not be enforced.

## Next step

Fix item 1 (read the 500), 2 and 3, then rerun `bun test` on midgard detached (use the script pattern in `/srv/dev/tmp-batch-1/gate.sh`), then `check`, mutation and each browser suite
(`bun scripts/ci-validate.ts --step browser --suite <script>`), fixing each failure in its own commit. Never call `sw-midgard-run` while a detached run is active.
