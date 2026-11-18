# Evidence and handoff: Tessera Format and Compiler

Written at the end of the implementation run. It records where the code departs from
[plan.md](./plan.md), what was not done and why, the measurements, and what the batch gate and the
reviewer must know.

## Tasks not done

- **T037 to T040 (handoff to the MCP server)** were done at the batch merge, in `tests/mcp/tessera-documents.test.ts`:
  findings equal the browser validator for every fixture (tool findings now carry their `code`), reads and patches keep
  the bytes of `notes-everywhere.yaml`, the published context, plan and metric explanation equal the unmarked twin
  and hold no note text, and no tool mentions a compiler. `src/shared/tessera/agent-view.ts` already covers all four
  published-only tools because they answer through the agent context and explain modules; `read_file` and
  `git_show` return the stored bytes on purpose, so a patch or a save keeps the marker and the notes.

No other task was skipped.

## Departures from plan.md and tasks.md

1. **Default branch rule.** `snapshot-source.ts` uses the workbench's own `defaultBranchAt`
   (`src/server/projects/worktrees.ts`: remembered branch, `refs/remotes/origin/HEAD`, `init.defaultBranch`,
   `main`, `master`) when `--branch` is not given, instead of writing a second rule. It is a superset of
   "origin/HEAD, else main".
2. **No second parse in a unit compile.** The plan had `compile-document` print and read its own output back.
   `compile-unit` now validates every document once (`validateInput`) and takes the data and the item
   addresses from that reading, and the output is read back from its own validation. `compileDocument` returns
   text and losses only; `printYaml` and `printJson` return text. This made a 20 MB project compile in 20 s on the
   development server instead of 29 s. The self-check of the printed text is the meaning check of
   `compile-unit`, so a caller that uses `compileDocument` alone must read the text back itself.
3. **A real defect found by T031.** Agent context carried `tessera_notes` because `parseDocuments` and the
   metric explanation read the inspected document as it is. `src/shared/tessera/agent-view.ts`
   (`documentForAgents`) now removes the marker and additions, and both call it.
4. **T014 is a new file.** The existing parity table runs every case against an existing path with a null base hash, so
   its saves stop at the stale-base check before validation. `tests/tessera/operation-parity.test.ts` saves to a
   new file instead. No existing test was edited.
5. **T031 (b).** A role condition accepts only lower-case identifiers for `docType`
   (`^[a-z][a-z0-9-]{0,40}$`), so "Ossie ontology" cannot be named in a condition today. The test checks the
   scanner records the same document type for the Tessera file and its twin and that decisions are equal for
   the types a condition can name.
6. **T013.** `useValidation.tsx` needed no change: its validation result already carries the inspection.
   `AppDialogs.tsx` passes the format to the panel through `formatOfInspection`. The label shows for a
   valid document only, because `inspect` throws for an invalid one. `inspect` returns `format` for structured
   documents; RDF results have no `format` field (adding it changed other result types).
7. **Derived schema validator.** The derived schema is compiled in the `mappings` group of
   `scripts/compile-schemas.ts` as validator `tessera`, because the pinned ontology schema refers to the
   Ossie core schema by URL and that group already holds it. `SupportedBase` also carries
   `validators` (compiled validator per revision), so a new base is a table entry plus a derived schema.
8. **Policy hash.** The hash of the loss policy file is in the loss report's `options.lossPolicy`
   (as the contract example shows), so a digest is bound to the policy file used; R10 had said the manifest
   only. The manifest repeats it in `lossPolicySha256`.
9. **Output folder checks run first.** `compile` refuses an unsafe output folder before reading the repository, so
   the refusal is the same whether or not the project has a loss.
10. **Report base.** The report and manifest always name the shipped base. A second base would also need
    validators for its outputs in `validateStructured`, which only knows 0.2.0.dev0. T035 (c) checks that a
    registered second base validates and that its label (`format.baseLabel`) names it.
11. **YAML spelling.** The `yaml` library prints `1e3` as `1e+3` and `0x1F` as `0x1f`. Types and values stay equal
    (the meaning check proves it), and a number a double cannot hold (20 digits) is a serialization failure.
12. **Property scan.** Any property starting with `tessera_` at any depth is checked against the registry, except the
    `prefixes` map, where such names are ordinary data. Registered names in a place that does not take them give
    `tessera-location`, so a note on a dataset or in an embedded semantic model has its own finding.
13. **T002.** No upstream development schema of the next Ossie base was pinned, so the synthetic base was used and
    recorded in `research.md` (R11).
14. **T043 assertion.** The 30 second limit is asserted. The 10 percent validation goal is printed and asserted only
    at 30 percent, because timing on a shared machine is noisy; measured ratios were 1.00 to 1.10.
15. **Mutation cases.** The mutants were checked one by one with a throwaway driver that applies each mutation to a
    temporary copy and runs `scripts/mutation-case.ts` (24 mutants, 24 killed, every baseline passing). The mutation
    suite itself was not run.
16. **Fixture note.** `notes-on-dataset.yaml` is a marked semantic model, so it gives `tessera-kind` and
    `tessera-location`; the README of the fixture folder lists every expected finding.

## Measurements

- `tests/tessera/compile-scale.test.ts` on the development server: 200 documents, 20,058,760 bytes, 44,460 losses,
  20.0 s (29.1 s before the single-validation change); 5.8 s on the workstation.
- Validating a 1,000-concept ontology with and without the marker: ratio 1.01 to 1.10 on the server, 1.00 to 1.09 locally.

## What ran

- `bun test tests/tessera/ tests/auth/operation-inventory.test.ts` on the server: 430 pass, 0 fail, 29 files.
- T032 list on the server (`validation`, `validation-honesty`, `schema-validators`, `ossie-layouts`, `model-addresses`,
  `model-address-inspect`, `agent-context-kinds`, `agent-runtime`, `new-file`, `tessera/standard-unchanged`): 303 pass, 0 fail,
  with no edit to any of them. It ran before T033 and the later changes; the standard-unchanged test is part of the run above.
- `bun --bun run check` on the server: exit 0. `bun --bun run build` on the server: built.
- `bun run test:tessera` and `bun run test:terminology` on the server (Vite on ports 5401 and 5402, stopped after use): both pass.
- `bun scripts/derive-tessera-schema.ts --check` exits 0; `bun scripts/operation-inventory-table.ts` leaves `docs/operations.md` unchanged.

## For the batch gate and the reviewer (T050)

Run once on the integrated batch before the merge, and not here: the full unit suite (`bun test`), `bun run test:mutation`
(new category `tessera`, 24 mutants), `bun run test:tessera`, `test:validation`, `test:editor`, `test:item-edit`,
`test:addresses`, `test:auth`, the remaining browser suites, and the `architecture-reviewer`.

- Existing tests changed by this feature: none. Files that existing tests read and that this feature extended:
  `package.json` (two scripts), `scripts/gate-suites.ts` (`test:tessera`), `docs/development.md` (a table row for
  `test:tessera`), `src/generated/validators.js` and `validators.d.ts` (regenerated), `scripts/mutation-tests.ts` and
  `scripts/mutation-case.ts` (the `tessera` category). The pipeline tests that read the gate suites list were not run here.
- The fixture `tests/fixtures/tessera/standard-baseline.json` is 1.3 MB. Regenerate it only for an intended change to ordinary
  Ossie handling (`bun scripts/record-standard-baseline.ts`).
- Golden compiler output is `tests/fixtures/tessera/golden/`; regenerate with `UPDATE_TESSERA_GOLDEN=1`.
- `src/shared/validation/validation.ts` gained `ValidationOptions.nested`, set by the validator itself for an embedded semantic
  model so a key named like the marker inside it stays ordinary data.
- Phase 9 (T037 to T040) was done at the batch merge as listed above.
