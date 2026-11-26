# Focused regression gate handoff

Both requested suspected regressions are cleared. Group opens through Controls at 1440×900 in Network and Layered, light and dark. Collapse areas at 1280×720 is intentionally disabled
because all 11 areas are already collapsed; Expand all restores it. No product fix or browser-suite source change was necessary. The full gate remains incomplete, and T076 remains unchecked.

## Revisions and findings

Candidate: `3fc01797` on `007-ui-review-fixes`. Main: `da54cf17`, using the existing archived source. The archived main FullGraph.tsx hash matches `git show da54cf17:src/app/graph/FullGraph.tsx`.

Fixture: `public/examples/mall/mall.semantic.yaml`, imported into an isolated local workspace for each revision. Each case uses a fresh browser page and explicit theme. Main and candidate
receive the same fixture and viewport. Vite ports are 5441 and 5442, with temporary DATA_DIR values under the permitted development area.

| Focused browser check   | Candidate     | Main da54cf17  |
| ----------------------- | ------------- | -------------- |
| 1440×900 Network, light | 191 ms; opens | 51 ms; opens   |
| 1440×900 Layered, light | 46 ms; opens  | 1071 ms; opens |
| 1280×720 Network, light | 532 ms; opens | 41 ms; opens   |
| 1440×900 Network, dark  | 212 ms; opens | 40 ms; opens   |
| 1440×900 Layered, dark  | 50 ms; opens  | 745 ms; opens  |
| 1280×720 Network, dark  | 187 ms; opens | 49 ms; opens   |

Times measure completed-layout-to-enabled confirmation, including opening Controls where necessary. Every Group trigger was already enabled on its first observation after opening Controls.
The candidate preliminary Network check measured 1055–1121 ms from first nodes at 1440. Layered's preliminary 2503–2578 ms included the outgoing layout during loading and does not indicate a
post-draw lock.

Candidate at 1280 Network, both themes: 11 collapsed cards, 11 area options, Collapse areas disabled, Expand all enabled. Expand all leaves zero collapsed cards and enables Collapse areas.
Main: 167 entity cards, zero collapsed, Collapse areas enabled, Expand all disabled. This is the approved automatic readable-opening behavior.

The original capture helper timeout is not reproduced. The focused check uses the existing openGroupMenu helper and succeeds after opening Controls. The exact earlier capture-sequence cause
is unresolved; no product regression is established by that timeout.

## Commands and exit codes

All browser execution went through unchanged sw-midgard-run. Scratch probe and driver copies live outside Git in `out/` and directly under `/srv/dev`; local copies are retained in `out/`.

- Initial `sw-midgard-run --pull out/narrow-candidate.log --pull out/narrow-main.log -- bash out/run-narrow.sh`: 23; ignored scratch driver was not transferred. Corrected by explicitly
  copying scratch files to the development area.
- Initial copied-driver attempt: 23; Vite dependency optimization exceeded the probe's 10-second navigation timeout; main log absent. Navigation timeout changed to 60 seconds.
- Next attempt: 23; scratch Layered selector did not open Controls first. Probe corrected to reveal the existing controls.
- Next attempt: 23; candidate checks completed, but driver stopped at server shutdown before main. Driver cleanup corrected to accept owned server termination.
- `sw-midgard-run --pull out/narrow-candidate.log --pull out/narrow-main.log -- bash -c 'cp /srv/dev/narrow-probe.ts out/narrow-probe.ts && bash /srv/dev/run-narrow.sh'`: outer 0, candidate
  probe 0 with six passing cases; main probe 1 because the scratch recovery step clicked main's intentionally disabled Expand all. The driver initially masked that inner failure through tee.
  Recovery now runs only if Expand all is enabled, and the driver uses pipefail.
- `sw-midgard-run --pull out/narrow-candidate.log --pull out/narrow-main.log -- env NARROW_REVISIONS=main bash -c 'cp /srv/dev/narrow-probe.ts out/narrow-probe.ts && bash
  /srv/dev/run-narrow.sh'`: 0; all six main cases pass.

Authoritative logs: `out/narrow-candidate.log` and `out/narrow-main.log`. Menu screenshots: `out/narrow-REVISION-THEME-WIDTH-LAYOUT.png` in each revision's source tree. Six screenshots per
revision, all at most 1440 px wide; screenshots remain outside Git. Candidate screenshots were visually inspected with the Group menu open in every case.

No test:grouping-validation or test:graph rerun was needed because no source fix was required. Their prior results remain: grouping-validation passes; graph fails the inherited
neighborhood-height assertion, also below target on main. Mutation's prior 958/958 pass remains unchanged. No capture matrix was resumed.

## Remaining work and next step

No open product regression from these two checks. The older graph/rest capture and expanded visual-classification backlog remains exactly as recorded in HANDOFF-SOL-20261126.md. This narrow
round does not complete that backlog. Resume it only under a separate instruction; keep T076 unchecked until the whole gate is complete.

Only evidence documents change in the local commit. No origin or GitHub push, main merge, branch deletion, owner-checkout access, production operation or yggdrasil access occurred.

## Evidence validation

Oxfmt ran on both changed Markdown files with a scratch copy of the repository configuration that permits Markdown. Historical gate formatting is preserved outside the new section. The stdin
invocation under Bun truncated output at 65536 bytes; its output was discarded and the full prior gate restored before adding the focused findings.

`bun run fmt:check`, `bun run lint`, the changed-file readable-code check, the confidential-only leak scan of both internal gate logs and `git diff --check` returned 0. An exact-command
process inspection found no remaining narrow-probe browser job or Vite server.
