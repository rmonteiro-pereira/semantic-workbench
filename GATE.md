# Batch 1 gate after independent review

The full unit, check, build, mutation and MCP gates pass. Five browser assertions remain red.
The comparison found equal responsive height and lower neighborhood graph task times on the batch.

Final tested batch before this gate record is `54f586a223de9df86947bd3f8bf4e792029f8a37`.
The full unit suite ran at `eedea8715f65087385dd69ff05dbc1143742be2f`. The initial full browser run,
build, mutation and MCP acceptance ran at `2b99861f112e3ca644d071b369640e1f78c433b9`.
That revision formats a mutation tuple. The final follow-up changes a browser fixture and its
documentation. The graph and responsive comparisons used identical application source at
`1197834d`.

## Gate commands on the development server

| Command | Summary |
| --- | --- |
| `bun test` | 3,281 pass and 0 fail. 379,970 expect() calls. Ran 3,281 tests across 457 files. [2501.81s] |
| `bun --bun run check` | Exit 0. All matched files use the correct format. Oxlint found 2,751 warnings and 0 errors. Comment, theme and brand checks passed. |
| `bun --bun run build` | Exit 0. Built in 3.04s. The existing large-chunk warning remains. |
| `bun scripts/ci-validate.ts --step mutation` | 825/825 targeted mutants killed. All unmodified module baselines passed. Gate passed in 2607.2 seconds. |
| `bun run test:mcp` | Acceptance run passed: 10 steps. |

The mutation total includes 14 proposal, 11 usage, 24 Tessera and 21 MCP mutants. The initial
unit run ended with 3,280 passes and one failure because the generated operation reference lacked
the new usage snapshot effect. The regeneration and the full unit rerun resolved that failure.
The first check after re-anchoring the Git mutant found a formatting difference. `2b99861f`
applies the repository format to the anchor. The check passed again on the final tested batch.
The focused Tessera documentation suite passed all 12 tests after the browser fixture edit.

## Browser commands

Each row ran `bun scripts/ci-validate.ts --step browser --suite <script>`.
**35 passed and 5 failed.**

| Script | Summary |
| --- | --- |
| `test:auth` | Gate passed in 139.6 seconds |
| `test:two-editors` | Gate passed in 116.1 seconds |
| `test:admin` | Gate passed in 128.8 seconds |
| `test:ui` | Gate passed in 63.8 seconds |
| `test:responsive` | Failed gate steps: browser |
| `test:edges` | Gate passed in 29.2 seconds |
| `test:grouping-validation` | Gate passed in 44.1 seconds |
| `test:overview-areas` | Gate passed in 27.9 seconds |
| `test:published-snapshot` | Gate passed in 31.1 seconds |
| `test:examples:ui` | Gate passed in 111.7 seconds |
| `test:projects` | Gate passed in 37.8 seconds |
| `test:trash` | Gate passed in 42.3 seconds |
| `test:sidebar` | Gate passed in 195.9 seconds |
| `test:metrics` | Gate passed in 63.0 seconds |
| `test:graph` | Failed gate steps: browser |
| `test:editor` | Failed gate steps: browser |
| `test:item-edit` | Gate passed in 68.0 seconds |
| `test:addresses` | Gate passed in 17.6 seconds |
| `test:mcp:browser` | Gate passed in 15.4 seconds |
| `test:rdf-edit` | Gate passed in 42.6 seconds |
| `test:validation` | Gate passed in 20.9 seconds |
| `test:tessera` | Gate passed in 13.7 seconds |
| `test:scm` | Gate passed in 58.6 seconds |
| `test:odcs` | Gate passed in 38.6 seconds |
| `test:lineage` | Failed gate steps: browser |
| `test:autosave` | Gate passed in 32.2 seconds |
| `test:sql` | Gate passed in 35.5 seconds |
| `test:git-setup` | Gate passed in 33.0 seconds |
| `test:monorepo` | Gate passed in 26.7 seconds |
| `test:dialogs` | Gate passed in 326.5 seconds |
| `test:telemetry` | Gate passed in 79.3 seconds |
| `test:terminology` | Gate passed in 106.2 seconds |
| `test:mappings-layout` | Gate passed in 79.3 seconds |
| `test:clipping` | Gate passed in 29.1 seconds |
| `test:mapping-graph` | Gate passed in 122.7 seconds |
| `test:back-history` | Failed gate steps: browser |
| `test:usage-traffic` | Gate passed in 154.0 seconds |
| `test:proposals` | Gate passed in 40.9 seconds |
| `test:theme` | Gate passed in 186.1 seconds |
| `test:brand` | Gate passed in 12.1 seconds |

Authentication took 118–470 ms across 27 sign-ins in `test:auth` and 242–262 ms across four
in `test:two-editors`. All met the five-second authentication limit. Workspace readiness
is measured separately.

## Browser failures

| Suite | Failure in the full gate | Main evidence |
| --- | --- | --- |
| `test:responsive` | Canvas height 481 px. The assertion requires more than 504 px. | Same height in all five paired runs. |
| `test:graph` | Longest pierce task 334 ms. The assertion allows at most 100 ms. | All five main samples missed the limit. The paired batch distribution is lower. |
| `test:editor` | Typing latency 64.36 ms/key. The assertion requires less than 30 ms/key. | The integration gate measured 58.51 ms/key on main at the same assertion. |
| `test:lineage` | The sidebar separator intercepts the “Walk here” click on customers. | The integration gate reproduced the same intercepted click on main. |
| `test:back-history` | An empty graph fingerprint makes the collapse appear unchanged. | The integration gate reproduced the same empty fingerprint on main. |

The lineage and back-history failures stop their journeys at the first failed assertion. This
run gives no evidence for the later steps in either journey.

Two other browser commands failed on the initial run. The mapping graph fixture restored a source
file while the browser still held the previous resolved view. Commit `54f586a2` reloads the restored
mapping and proves the injected warning clears before testing Customer's center and connected
assets. The full mapping graph suite then passed in 122.7 seconds.

The dialog suite timed out before rendering the workspace. A diagnostic attempt with a 20-second
wait also timed out, so the cause remains unconfirmed. Subsequent full runs passed all nine dialog
checks, including a clean rerun in 326.5 seconds with the original five-second wait.

## Independent review fixes

- **Outgoing Git refs.** `24291142` pins the exact published source and destination in the repository
  queue. Bare-remote tests reject ordinary branches with unpublished commits and a checkout interleaved
  after branch observation. The SCM browser journey sends published ordinary-branch history and still
  inspects remote commits. `aeece870` aligns the type before the first publication. `ad9d9c6a` retains
  the authorization-effect mutant after the signature change.
- **Published usage addresses.** `866a758b` stages address history from the published transition. Two
  authorized readers see the old name before publication and the new name after publication and
  compaction. The route also resolves counted addresses in the pinned model before returning them.
- **Published compile provenance.** `ce5a6f45` pins the workbench commit independently of caller input
  and identifies standalone Git sources in the manifest and loss report. Source and CLI tests cover
  linked worktrees, mismatched branches and commits, reserved refs and unrelated repositories with the
  same basename. `165369ef` covers the fallback from a trash archive to standalone compile.
- **Proposal Work and Synchronize.** `f900c267` rechecks the branch and head inside the mutation turn.
  Controlled same-person checkout tests verify all affected branch heads after refusal.
- **Bundle containment.** `de406361` compares whole path components. The writer test exercises a real
  parent, an ordinary child, a two-dot-prefixed child and symlinks resolving to each.
- **Usage trash and restoration.** `e1197dd4` drains pending counts before the move and invalidates old
  recordings. The test suspends a recording through deletion and slug reuse, then checks that restoration
  recovers only the archived count.
- **Close and restore interruption.** `a5285033` reconciles lone proposal refs after startup. Fault
  injection stops between the Git ref transaction and metadata write in both directions.
- **Clean-stop flush.** `6d41b00a` refuses admissions, waits for the suspended model lookup and flushes
  before the workspace closes. The test verifies the stored day.
- **Sign-in.** `fcee2193` measures navigation through the authentication callback with the five-second
  budget. The boundary test rejects 5,000 ms and accepts 4,999 ms. Workspace readiness has its own
  assertions.
- **MCP authoring and semantic reads.** `16a3521a` documents local authoring reads of stored bytes,
  including unpublished Tessera notes, and the stripped published semantic projection. Existing MCP tests
  cover both paths. `5f2cddd2` wraps the documentation.
- **Mixed-project proposal metadata.** `779bed5f` documents the partial reader contract. The visibility
  test checks name, creator, contributors and tip with undisclosed project names filtered.
- **Loss acceptance policy.** `25038bd8` documents how an unchanged policy applies to a changed value.
  The CLI test accepts by policy and rejects the old digest for the changed note.
- **Usage limits.** `d87fd14e` bounds recording admission, streaming, stored-day bytes and validated
  entries. Regression tests exercise a body without Content-Length, an overloaded recorder and a stored
  day with unknown operations or over-limit input.
- **Traffic disabled.** `b30badfd` skips bundle iteration and address derivation. A disabled-snapshot
  test traps a relationship accessor. `3d23b832` moves the subscription to the canvas and a plain-edge
  test traps store reads. `1197834d` skips hidden-label geometry and reuses unchanged edges. A regression
  test traps any geometry read on an unlabeled edge.
- **Proposal ref failure.** `d07e442b` distinguishes ref movement from Git failure. A held Git lock
  reproduces an operational error with an unmoved tip.
- **Policy file limit.** `8ddd604c` reads a bounded regular file and caps the allow-list by the registry.
  CLI tests cover both limits.
- **Mapping browser fixture restoration.** `54f586a2` reopens the mapping after restoring the fixture.
  The existing journey now verifies the injected finding clears before testing Customer centering and
  navigation.

The generated reference drift was caught by the full unit suite. Commit `eedea871` regenerates only the
`usage.read` snapshot effect row and is covered by the inventory reference equality test.

The three accepted contract decisions retain the original behavior. Their evidence checks the behavior
and the docs state the visibility and acceptance rules explicitly. The archive and pointer type
follow-ups came from checking the new code against related repository states.

## Main comparison on the development server

Both revisions ran five times at each failing viewport. The comparison alternated revision order,
used the same Bun and dependencies, and kept the original assertions. Only the responsive log
gained a line to print the measured height.

| Assertion and viewport | Main `84642cb0` | Batch `1197834d` |
| --- | --- | --- |
| Canvas height at 1280×720, requires >504 px | 481, 481, 481, 481, 481 px. Median 481 px. Range 481–481 px. | 481, 481, 481, 481, 481 px. Median 481 px. Range 481–481 px. |
| Longest pierce task at 1600×1000, requires ≤100 ms | 319, 198, 413, 317, 266 ms. Median 317 ms. Range 198–413 ms. | 235, 326, 151, 179, 208 ms. Median 208 ms. Range 151–326 ms. |

Every sample on both revisions fails the original limit. The batch matches main’s responsive height
and has a lower median and observed maximum on the graph test. An intermediate batch measured
330 ms median against 264 ms on main and was excluded from the full gate. The next commit skips
unlabeled-edge geometry and reuses edge data between renders with identical inputs.

## Reviewer and capture handoff

Authorized local MCP authoring reads stored bytes, including unpublished work and Tessera notes.
Semantic context, planning and explanation read the stripped published projection. A reader of
one declared project can see shared proposal metadata, with unreadable project names filtered.
A Tessera loss policy still applies when an allowed property's value changes. Digest acceptance
requires the digest for the new loss. The branch and publication record pin in-workbench
compile input. `standalone-snapshot` indicates Git-object provenance without a workbench
publication record.

The next address-history integration can change `publishedMigrationRecords` to load migrations from
the published side's committed history file. The usage read still resolves returned items against
the pinned published model and the reader's grants.

Use the committed review revision for the separate screenshot and UI regression work. Cover the
proposal, usage and Tessera states with light and dark themes, phone width, long text, and empty,
loading and error states. The established browser failures are listed above. The architecture
review remains a separate gate.

The pre-review integration gate is recorded at `1e98bed9` in this file's Git history. Proposal
creation initially returned HTTP 500 because its route lacked the required operation inventory
entry. `f65ae02f` registered the proposal operations and their dependent publication steps.
