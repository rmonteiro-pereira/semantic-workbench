# Semantic Workbench v0.5.0 completion

Verified head: `d631e56e770ebf08d3b3d8901c61e1a2933897d6` on `004-ui-polish`.
Final visual capture head: `fb098531c69398cd0b68ae44e1b2d309df5fc1ea`.
The completion commit adds documentation and evidence only; runtime source is identical to the
verified head. Only `004-ui-polish` was pushed. No merge, Git tag, deployment, image push or real
Azure/Entra call was performed. Tests used temporary roots; the owner's data and port 5173
were untouched. Direct browser checks used our Vite at port 5175 with `SW_BASE_URL` set.

## Full gate

| Gate | Result |
| --- | --- |
| bun test | 1,853 passed; 0 failed; 129,539 assertions; 260 files |
| bun --bun run check | passed |
| bun --bun run build | passed |
| bun run test:mutation | 660/660 targets killed; all baselines passed |
| Direct browser suites | 32 passed, plus example-data validation; Vite 5175 |
| bun run test:container | 25 local suites; 30 explicit server/persistence checks passed |
| bun run ci:validate | 6/6 steps passed; zero image vulnerabilities and secrets |
| Consecutive test:lineage | 10/10 passed without interruption |

All 49 commands passed. Full command durations and log hashes are in
[gate-results.json](gate-results.json); six-step CI results are in
[ci-results.json](ci-results.json).
The CI pipeline runs are mocked validation, not deployment. Earlier failures, their root causes
and focused reruns are retained in [verification.md](verification.md). No assertion, timeout or
timing budget was loosened. No failure was dismissed as machine load. An earlier CI attempt was
rerun at the same head after adding the
existing Node 24.11.0 executable to PATH: all three prior Vite starts were unready, while 20/20
confirmation launches then became ready in under 0.5 seconds. The failed log is retained and
that rerun then exposed two fixable HIGH scan findings. MSAL Node 7.1.0 and the patched
Brotli runtime package resolve them without exceptions. The final-head CI run includes every step.
A later gate found a repeatable 123 ms graph expansion stall; direct final-viewport publication
removed the intermediate mount, and ten focused reruns passed the unchanged 100 ms limit.
Container preflight also found the owner's newly occupied API port; configurable test ports
allowed the final gate to use 4315/4316 without touching that process.

## Audit rounds

| Round | Scope and serious rows resolved |
| --- | --- |
| 1 | Historical before this completion: 12 S1 / 58 S2 / 23 S3; not counted as new fixes |
| 2 LA–LD | 96 rows: 59 serious rows fixed, six justified serious triages, 31 minor rows |
| 2 SA/SB (fourth capture iteration) | Five S2 rows fixed: four product fixes and one coverage fix |
| 3 focused | Six serious rows fixed |
| 5 diagnostic/focused | Seven serious rows fixed |
| 6 server/focused | Sixteen serious rows fixed |
| 7 local/server/focused | Sixteen serious rows fixed |
| 8 complete | 864 originals, 0 S1 / 0 S2 / 8 S3 |
| 9 complete tour | 864 originals, 0 S1 / 0 S2 / 8 S3 |
| 9 authentication/focused content | Five serious rows fixed; expanded acceptance scope reopened |
| 10 incomplete capture | One S2 coverage row fixed; no full round claimed |
| 11 complete | 1,032 originals, 0 S1 / 0 S2 / 12 S3 |
| 12 clone progress diagnostic/focused | One S1 fixed; eight waiting-state originals clear; no full round claimed |
| 13 complete | 1,040 fresh originals, 0 S1 / 0 S2 / 18 repeated S3 rows |
| 14 complete after security updates | 1,040 fresh originals, 0 S1 / 0 S2 / 18 repeated S3 rows |
| 15 expansion performance follow-up | One S2 render stall fixed; no full round claimed |
| 16 final complete after expansion fix | 1,040 fresh originals, 0 S1 / 0 S2 / 18 repeated S3 rows |

The closure ledger totals **117 observed serious rows resolved**, plus six justified baseline
triages. Repeated observations are counted as rows, not distinct defects. Round 16 covers local
and server mode, light and dark, four sizes, authentication and delayed clone connection states.
All originals were individually reviewed at native resolution. Supplemental R11 proof adds 61
reviewed images, with no S1/S2. All **1,101 saved images** retain original dimensions and source
and output hash manifests under [screenshots/after](screenshots/after/).

## Requirements and earlier owner asks

R1–R17 and R2a are verified; the issue-10 stepper is verified at every required width. F72–F76
and R11/F64 are closed. The finding catalog has 131 unique entries: 125 closed or verified
and six explicitly deferred S3 patterns. The complete requirement table is in [spec.md](spec.md).
[The seven R11 acceptance rows](r11-verification.md) cover graph fullscreen, YAML and embedded
SQL highlighting/lint, row trash icons, the project file list, real concept mappings, source
control, and click-to-edit entities and relationships. Browser interactions and fresh screenshot
reviews verify each one.

## Remaining work

No S1/S2 or required gate work remains. Six S3 patterns are explicitly deferred:

- F118: a partial next file row at the sidebar's independent scroll boundary; names and actions
  remain reachable and readable.
- F119: “DocumentReference” can leave a two-letter final line at 1440 pixels; the complete name
  remains readable above the size floor.
- F124: the phone deprecation reason placeholder ends early and Cancel occupies its own line;
  entered values and all actions remain readable and usable, and shared dialog geometry passes.

- F128: rename validation reuses “before importing”; the references panel correctly explains
  rename and recovery, so operation-neutral wording remains follow-up polish.
- F129: an RDF refusal explanation appears twice; both copies are readable and the refused
  action is clear, so consolidating it remains follow-up polish.

- F130: a repair summary says “1 errors · 1 warnings”; the counts and issue details are
  clear, so singular noun agreement remains follow-up polish.

These minor observations do not obstruct tasks. Their native review rows remain in the audit;
no cosmetic change was made merely to remove them from the release record.
