# Batch 2 gate

Batch 2 holds batch 1 and the features 013, 015, 016, 017, 018, 019 and 020. The owner's decisions
of 19 November are in: the Show button counts the switches that are on in a badge, Mesh opens from
the sidebar under Source control, and Unpublished work is a Show menu item beside the Comparison
button. One architecture review round ran; its must-fix items are in `618f13e1`.

| Command | Summary |
| --- | --- |
| `bun --bun run check` at `486cff5e` | Exit 0. |
| `bun test` at `486cff5e` | 4343 pass, 2 fail. The two failures are the compile scale tests, at 30.4 s and 32.5 s against a 30 s budget while the full suite loaded the server. Run alone they pass at 23.6 s and 65.1 s for the compile-and-zip case, which has its own budget. |
| `bun --bun run build` at `486cff5e` | Exit 0. |
| `bun scripts/ci-validate.ts --step mutation` | 942/942 mutants killed in 3184 s. The later commits change no mutated module. |
| All browser suites at `7917d120` | 39 passed, 7 failed. Two failures were new and are fixed in `28ff9a39`: the sidebar at 1280x500 and a timing fault in the item diff check. |
| Browser rerun at `486cff5e`: item-diff, usage-traffic, sidebar | All passed. |

**Inherited failures.** responsive, graph, editor, lineage and back-history fail at the same
assertions as on `main` and batch 1. graph fails its timing bound (about 300 ms against 100 ms);
back-history fails at "collapse the graph areas".

**Comparison with `main`.** Every screen of the tour was captured at `7917d120` in local and
server mode, light and dark, at 390, 1280, 1440 and 2560 px, and compared with `main` at
`d36159ff`. A second local capture of the same build measured layout noise. The differences above
noise are the batches' own features: the Agent programs and Agent connections admin areas, usage
counters in Admin settings, proposals in Source control, attributes on catalog cards, the Mesh row
in the sidebar, the Show menu and the Comparison button. Three regressions were found and fixed in
`486cff5e`, then recaptured:

- Turning on Labels from the Show menu at 1280 px dropped the neighborhood zoom. The badge widened
  the button, the legend wrapped, and the shorter canvas refit. The badge now keeps its place.
- The relationship filter was as wide as the longest relationship name, which put the neighborhood
  toolbar on three rows at 1280 px. It now sizes to the name it shows.
- Catalog cards stretched by a taller neighbor started their text lower than the others.

**Open for the owner.** At 1280 px, in the neighborhood state without hidden neighbors, the
Incoming/Outgoing legend sits on a line of its own under the toolbar, because the Comparison
button takes its place on the second row.

# Batch 1 gate after the third review

The third review returned two must-fix items in usage counting. Both are fixed in `6d6a993b` and
`9d5aa723`, and a fresh review of those commits found no blocker. Its follow-ups are fixed in
`5a014ae9`, `229e1b47` and `26565460`, except the synchronous Git read in the published-history
lookup, which stays until the committed address history replaces that lookup.

| Command at `78d97065` | Summary |
| --- | --- |
| `bun --bun run check` | Exit 0. |
| Usage, Tessera, proposals and auth unit tests | Exit 0. |
| `bun --bun run build` | Exit 0. |
| Browser: `test:usage-traffic`, `test:admin`, `test:proposals`, `test:tessera` | All passed. |
| `bun scripts/ci-validate.ts --step mutation` | 850/850 targeted mutants killed. All unmodified module baselines passed. Gate passed in 2764.2 seconds. |

The follow-up commits were checked with `bun --bun run check` (exit 0) and the address, usage and
source control tests (266 pass, 0 fail).

**Dialogs.** The earlier dialogs failures came from the test machine, not from this batch. The page
stayed blank because Chromium aborted dozens of module requests with `ERR_NETWORK_CHANGED`, on this
branch and on `main` alike. The dev server's container runtime adds and removes network interfaces,
and Chromium drops in-flight loads when it sees one. Run inside a network namespace with only
loopback, `test:dialogs` passed all nine checks at six viewports, both at `78d97065` and at
`26565460`.

**Inherited failures.** Rerun at `26565460` in the isolated network, the five suites that also fail
on `main` fail at the same assertions:

| Script | First failure |
| --- | --- |
| `test:responsive` | 481 px where more than 504 px is required. |
| `test:graph` | Longest main-thread task during pierce 329 ms against a 100 ms budget. |
| `test:editor` | 57 ms per keystroke against a limit under 30 ms. |
| `test:lineage` | Stops at the same click the sidebar separator intercepts. |
| `test:back-history` | Collapsing the graph areas leaves the same empty fingerprint. |

# Batch 1 gate after the second review

Tested source and gate scripts are at `1bebf7ecfc682fab3c3f36a1371cf087ee3c73bb`.
This includes the merge of `origin/main` at `d36159ff`. The preceding gate and five-run browser
comparison remain below. The earlier measurements describe their tested revisions and viewports.

## Second review gate commands

| Command | Summary |
| --- | --- |
| `bun test` | 3,306 pass, 0 fail, 379,982 expect() calls. Ran 3,306 tests across 461 files. [2431.85s] |
| `bun --bun run check` | Exit 0. All matched files use the correct format. 2,754 lint warnings and 0 errors. Comment, theme and brand checks passed. |
| `bun --bun run build` | Exit 0. Built in 3.06s. The existing large-chunk warning remains. |
| `bun scripts/ci-validate.ts --step mutation` | 850/850 targeted mutants killed. All unmodified module baselines passed. Gate passed in 2375.7 seconds. |
| `bun run test:mcp` | Acceptance run passed: 10 steps. |

## Second review browser commands

Each row ran `bun scripts/ci-validate.ts --step browser --suite <script>`.

**34 passed and 6 failed.**

| Script | Summary |
| --- | --- |
| `test:auth` | Gate passed in 140.2 seconds |
| `test:two-editors` | Gate passed in 115.3 seconds |
| `test:admin` | Gate passed in 88.9 seconds |
| `test:ui` | Gate passed in 61.0 seconds |
| `test:responsive` | Failed gate steps: browser |
| `test:edges` | Gate passed in 26.8 seconds |
| `test:grouping-validation` | Gate passed in 43.9 seconds |
| `test:overview-areas` | Gate passed in 28.6 seconds |
| `test:published-snapshot` | Gate passed in 31.0 seconds |
| `test:examples:ui` | Gate passed in 116.4 seconds |
| `test:projects` | Gate passed in 39.0 seconds |
| `test:trash` | Gate passed in 43.5 seconds |
| `test:sidebar` | Gate passed in 200.9 seconds |
| `test:metrics` | Gate passed in 63.6 seconds |
| `test:graph` | Failed gate steps: browser |
| `test:editor` | Failed gate steps: browser |
| `test:item-edit` | Gate passed in 64.0 seconds |
| `test:addresses` | Gate passed in 18.2 seconds |
| `test:mcp:browser` | Gate passed in 15.4 seconds |
| `test:rdf-edit` | Gate passed in 41.2 seconds |
| `test:validation` | Gate passed in 21.0 seconds |
| `test:tessera` | Gate passed in 13.6 seconds |
| `test:scm` | Gate passed in 56.0 seconds |
| `test:odcs` | Gate passed in 37.8 seconds |
| `test:lineage` | Failed gate steps: browser |
| `test:autosave` | Gate passed in 31.3 seconds |
| `test:sql` | Gate passed in 36.5 seconds |
| `test:git-setup` | Gate passed in 32.5 seconds |
| `test:monorepo` | Gate passed in 27.1 seconds |
| `test:dialogs` | Failed gate steps: browser. The same command also failed on retry. |
| `test:telemetry` | Gate passed in 79.2 seconds |
| `test:terminology` | Gate passed in 105.6 seconds |
| `test:mappings-layout` | Gate passed in 83.9 seconds |
| `test:clipping` | Gate passed in 28.9 seconds |
| `test:mapping-graph` | Gate passed in 125.3 seconds |
| `test:back-history` | Failed gate steps: browser |
| `test:usage-traffic` | Gate passed in 157.5 seconds |
| `test:proposals` | Gate passed in 42.5 seconds |
| `test:theme` | Gate passed in 192.8 seconds |
| `test:brand` | Gate passed in 12.6 seconds |

## Second review browser observations

| Suite | First failing assertion |
| --- | --- |
| `test:responsive` | The canvas at 1280×720 measured 481 px against a requirement above 504 px. All five samples on each revision in the earlier comparison also measured 481 px. |
| `test:graph` | The longest neighborhood main-thread task took 151 ms against a budget of 100 ms. The earlier main and batch comparison exceeded the budget in every sample. |
| `test:editor` | Typing took 58.26 ms per key against a limit below 30 ms. Main also failed this threshold in the earlier comparison. |
| `test:lineage` | The sidebar separator intercepted the “Walk here” click, as it did on main. The remaining steps were unassessed. |
| `test:back-history` | Before and after collapse produced the same empty graph fingerprint, as on main. The remaining steps were unassessed. |
| `test:dialogs` | The workspace tree or empty state did not attach within five seconds. The initial run stopped after Validation details. A clean retry passed eight dialog groups and timed out in the menus check. The earlier gate also saw this intermittent timeout. Its cause remains unconfirmed. |

The authentication-only measurements in `test:auth` were 109–551 ms and in `test:two-editors`
were 234–250 ms, both within the five-second limit.

## Second review fixes

| Item | Commit and regression test |
| --- | --- |
| Main integration | `691959e0` merges `d36159ff`. The changelog keeps both sets of changes. The regenerated operation reference, dry-run baseline and HTTP characterization are byte-identical. |
| Promotion recovery | `cd31b96a`. A failed store write leaves two refs intact. An interruption cleaning up the second ref leaves durable outcomes, and the next recovery removes the matching leftover. |
| Stored day byte budget | `988e5e57`. A day with 23,000 long valid addresses reads back, preserves overflow as an aggregate, and survives a second flush. |
| Trash isolation | `ef605a2c`. An undecoded response for B survives trashing A. The slug-reuse test still discards recordings from the removed instance. Snapshot reads stay in the resolved project's repository. |
| Remote destination | `7d7b14a4`. Each of Push, Sync and Push default refuses a remote repointed during credential selection. Both bare remotes are checked. Remote edits share the repository queue. |
| Publication independence | `a5ee6dda`. Publication advances its durable pointer despite a malformed authoring journal or unusable usage-side path. The provenance fix removes the optional staging path. |
| Usage migration provenance | `87b395cb`. Two-reader tests verify that a private declaration cannot attach counts to an independent author's same-name item, and compaction retains the original counts through a two-rename publication. A day already rekeyed by unverified history is reported unavailable. |
| Mutation anchor after main merge | `f1b4121c`. Preflight rejected the old position. The replacement omits custom admin rules at policy preparation, and all three targeted authorization mutants were killed. |
| Strict type check | `1bebf7ec`. Sparse guarded fetch takes the existing name and credential pair. The recovery fixture deliberately supplies only the recovery dependencies. `tsc --noEmit` passed. |

`publishedMigrationRecords` is the pinned published-side lookup for a future committed history
source. Counts at an address that no longer resolves stay on disk through compaction and are omitted
from the response. A day already rewritten by an unverified marker is reported unavailable.

## Earlier gate and main comparison

The full unit, check, build, mutation and MCP gates pass. Five browser assertions remain red.
The comparison found equal responsive height and lower neighborhood graph task times on the batch.

Final tested batch before this gate record is `54f586a223de9df86947bd3f8bf4e792029f8a37`.
The full unit suite ran at `eedea8715f65087385dd69ff05dbc1143742be2f`. The initial full browser run,
build, mutation and MCP acceptance ran at `2b99861f112e3ca644d071b369640e1f78c433b9`.
That revision formats a mutation tuple. The final follow-up changes a browser fixture and its
documentation. The graph and responsive comparisons used identical application source at
`1197834d`.

### Gate commands on the development server

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

### Browser commands

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

### Browser failures

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

### Independent review fixes

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

### Main comparison on the development server

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

### Reviewer and capture handoff

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
