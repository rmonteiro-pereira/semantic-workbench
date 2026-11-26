# Feature Specification: Loose Ends of Features 006 and 012 to 019 and the 007 Gate

**Feature Branch**: `021-loose-ends`

**Created**: 2026-11-26

**Status**: Draft

**Input**: Features 008 to 020 are on `main`, but each left tasks open: a few code and documentation
tasks, and one screenshot capture per feature that never ran because captures were moved to the
batch gate. The 007 merge gate also recorded four follow-ups for the collapsed Network labels. This
feature closes them in one batch, so `main` has no unticked task that is not waiting for an outside
event.

## Scope

In scope, each closed with its proof or, when already done on `main`, ticked with a disposition line
that names the file and test that do it:

| Source | Task | What is left |
| --- | --- | --- |
| 017 | T005 | Done on `main` in substance: `isAttribute` in `src/shared/attributes/attribute-rule.ts` and `tests/item-diff/attribute-kind.test.ts`. Tick with a disposition; no second classification. |
| 018 | T045 | `tests/mesh/importer-visibility.test.ts` is missing: the dependents answer holds no count, person or request time; usage modules never read mesh state and mesh modules never read the usage store. |
| 016 | T033 | `docs/mcp.md` and `docs/mcp-contract.md` say the semantic tools use the published projection, but not that they carry agent context and the status flag. Add that and a tool test that returns context only from the published snapshot, with no owner, steward, classification or note text. |
| 018 | T061 | The note for the MCP owner becomes documentation now that 006 is on `main`: units are read as files, `validate_text` on a part gives single-file findings and the "set not checked" notice, and the five mesh operations are "later increment" in the contract. |
| 013 | T039 | Run Codex CLI against a test server through the stdio bridge and record the result in `docs/mcp-acceptance.md`; `docs/agent-connections.md` follows it. |
| 007 | follow-up | Collapsed Network labels: decide visibility at the viewport edge against the painted curve, not its sampled chords. |
| 007 | follow-up | Shorten `useFullGraphEdges`: pass the input object to the base hook and extract the per-connection appearance builder. |
| 007 | follow-up | A test that reports a label route, remounts the graph hook under StrictMode and expects one measurement. |
| 007 | follow-up | Ignore a label-route report that arrives after the graph hook unmounts. |
| 012-019 | captures | One shared capture job in place of 012 T041, 013 T037, 014 T035, 015 T037, 016 T030, 017 T035, 018 T053, 019 T015 and 019 T020, then 018 T054 (fix what the capture finds in the Mesh screens). |
| 006 | T013, T035 | Superseded on `main` (010's replay sample; 008 merged). Tick with a disposition. |
| 006 | T065 | The Codex CLI half of the acceptance run, done together with 013 T039. |
| 019 | Phase 7 | Adopt Ossie 0.3.0.dev0, pinned at one upstream commit, as a draft base (T025, T028 to T033). T026 and T027 keep waiting for the release, and the documents say so. Worked in its own worktree `021-ossie`. |
| 019 | T036, T039 | The operation inventory and contract check, and the 0.3.0 status record (draft base, not released). |

Out of scope, and why:

- 019 T026 and T027: they store the released schemas and a non-draft base, so they wait for the Ossie 0.3.0 release.
- 003 OA-1 to OA-3: owner actions that need the trial Azure DevOps organisation, the real Entra tenant and the Azure Repos mirror.
- The batch-gate hand-off tasks (012 T042/T045, 013 T044, 015 T044, 019 T040): this feature's own
  gate closes them, by recording that the integrated batch passed.
- The six other 007 architecture follow-ups (lineage phase union, toolbar widths, layout timings,
  capture-script names, humanization module, fitted zoom): refactors with no behaviour asked for; they
  stay listed in the 007 GATE.md for a later item.

## Requirements

- **FR-001** No visual or behaviour change outside the collapsed Network label fix. The UI regression
  gate compares the whole journey against `main` at the start of this feature.
- **FR-002** A count label in the collapsed Network graph is shown when the painted curve between its
  ends enters the viewport, and hidden when it does not, including a curve that only grazes an edge.
- **FR-003** A label-route report after the graph hook unmounts changes no state and schedules no frame.
- **FR-004** A StrictMode remount after a report measures that route exactly once.
- **FR-005** `useFullGraphEdges` keeps its public signature and output; its functions fit the code style
  (about 40 lines).
- **FR-006** The mesh and usage stores stay separate, proved by an import scan and a fixture answer.
- **FR-007** Agent-facing semantic tools read only the published snapshot; the docs say which fields they
  carry, including the status flag, and a test proves no governance text leaks.
- **FR-008** Every per-feature capture state listed in the source tasks is captured once, in light and dark,
  at 390 and 1440 px, and every finding is either fixed in this feature or recorded for the owner.
- **FR-009** The Codex CLI record states the version, the configuration and the result, or says plainly why
  it could not run.

## Success criteria

- No unticked task in `specs/006` and `specs/012` to `specs/019` except 019 T026 and T027 (waiting for the
  Ossie 0.3.0 release), each with proof or a disposition. 003's owner actions stay with the owner.
- The four 007 label follow-ups are closed with tests.
- The batch gate passes: full unit suite, mutation, browser suites with only inherited failures, the UI
  regression comparison with no unaccepted regression, and a clean code review in at most three rounds.
