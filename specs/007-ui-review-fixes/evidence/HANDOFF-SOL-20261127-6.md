# Admin Git remotes: pair 1857 targeted reproduction

**Verdict: timing.** Main `da54cf17` and candidate `6ec76f7f` each loaded all five project rows in every attempt: five dark and five light per version. First-row arrival was 428.4–618.8 ms after navigation to the Admin section, within the 15-second limit. No candidate loading regression was reproduced. Classify pair 1857 as an early capture; pair 2373 is consistent with the same timing issue.

## Setup and measurement

- Separate source archives and builds: `/srv/dev/repro-1857/main` at `da54cf17` and `/srv/dev/repro-1857/candidate` at `6ec76f7f`.
- Built static frontend and server mode, on ports 5481 and 5482 respectively. The loopback mock Entra provider used port 5483. No external service was contacted.
- The original `capture-matrix.sh`, `compare-main.sh` and `capture-matrix-session3.sh` were read first and copied unchanged into `/srv/dev/repro-1857/originals/`. The original capture-tour implementation was also read. Its server setup uses `startMockOidc`, `startAuthApi` and the shared authentication fixture; the Vite processes in the matrix are for its local-mode captures.
- The reproduction reuses those authentication helpers, signs in as Dave, and uses `adminScreens()` to navigate to `#/admin/git-remotes`, exactly as the tour does. Seed projects: shared-reference, sales-metrics, sales-contracts, hr-people and lab-notes.
- Each version has a separate temporary DATA_DIR beneath `/srv/dev/repro-1857/main-temp` or `/srv/dev/repro-1857/candidate-temp`, created by the fixture and removed by its cleanup. The exact roots are recorded in `out/run-main.log` and `out/run-candidate.log`.
- Each theme has a fresh signed-in browser context. Each attempt opens a fresh page at 2560×1440, waits the original 1,500 ms at the workspace, then enters Admin. A MutationObserver timestamps the first `.admin-records tbody tr`, starting immediately before section navigation. The row wait is 15 seconds.
- Responses, console errors, uncaught page errors and failed requests are recorded from page creation through the row wait. One screenshot per version/theme is taken on attempt 5 after rows and fonts load. Each is a 1600×1000 crop of the 2560×1440 viewport, covering the project rows.

## Per-attempt results

Projects means `GET /api/projects`. Remotes are supplied by `GET /api/projects/<slug>/git/status`; the loader makes one request for each of the five projects, rather than a separate remotes-list request. All observed project requests also returned 200.

| Version   | Theme | Attempt | Rows | First row (ms) | Projects | Five remotes-status requests | Console error                 |
| --------- | ----- | ------: | ---: | -------------: | -------- | ---------------------------- | ----------------------------- |
| main      | dark  |       1 |    5 |          464.4 | 200      | 200 / 200 / 200 / 200 / 200  | 404 missing draft (see below) |
| main      | dark  |       2 |    5 |          490.3 | 200      | 200 / 200 / 200 / 200 / 200  | 404 missing draft (see below) |
| main      | dark  |       3 |    5 |          494.3 | 200      | 200 / 200 / 200 / 200 / 200  | 404 missing draft (see below) |
| main      | dark  |       4 |    5 |          438.5 | 200      | 200 / 200 / 200 / 200 / 200  | 404 missing draft (see below) |
| main      | dark  |       5 |    5 |          448.0 | 200      | 200 / 200 / 200 / 200 / 200  | 404 missing draft (see below) |
| main      | light |       1 |    5 |          543.6 | 200      | 200 / 200 / 200 / 200 / 200  | 404 missing draft (see below) |
| main      | light |       2 |    5 |          432.2 | 200      | 200 / 200 / 200 / 200 / 200  | 404 missing draft (see below) |
| main      | light |       3 |    5 |          479.3 | 200      | 200 / 200 / 200 / 200 / 200  | 404 missing draft (see below) |
| main      | light |       4 |    5 |          618.8 | 200      | 200 / 200 / 200 / 200 / 200  | 404 missing draft (see below) |
| main      | light |       5 |    5 |          452.2 | 200      | 200 / 200 / 200 / 200 / 200  | 404 missing draft (see below) |
| candidate | dark  |       1 |    5 |          548.1 | 200      | 200 / 200 / 200 / 200 / 200  | None                          |
| candidate | dark  |       2 |    5 |          431.4 | 200      | 200 / 200 / 200 / 200 / 200  | None                          |
| candidate | dark  |       3 |    5 |          455.4 | 200      | 200 / 200 / 200 / 200 / 200  | None                          |
| candidate | dark  |       4 |    5 |          428.4 | 200      | 200 / 200 / 200 / 200 / 200  | None                          |
| candidate | dark  |       5 |    5 |          466.9 | 200      | 200 / 200 / 200 / 200 / 200  | None                          |
| candidate | light |       1 |    5 |          465.1 | 200      | 200 / 200 / 200 / 200 / 200  | None                          |
| candidate | light |       2 |    5 |          432.7 | 200      | 200 / 200 / 200 / 200 / 200  | None                          |
| candidate | light |       3 |    5 |          475.7 | 200      | 200 / 200 / 200 / 200 / 200  | None                          |
| candidate | light |       4 |    5 |          449.4 | 200      | 200 / 200 / 200 / 200 / 200  | None                          |
| candidate | light |       5 |    5 |          440.4 | 200      | 200 / 200 / 200 / 200 / 200  | None                          |

Main emitted one console error per attempt: `Failed to load resource: the server responded with a status of 404 (Not Found)`. Its server log identifies the missing-draft route, `GET /api/drafts/:slug/*`, as returning 404. Candidate emitted no console errors. Neither version emitted an uncaught page error or a failed network request in these attempts. There was no failing projects or remotes-status request.

Raw records: `/srv/dev/repro-1857/out/attempts.jsonl`. Detailed HTTP logs: `/srv/dev/repro-1857/out/run-main.log` and `/srv/dev/repro-1857/out/run-candidate.log`.

## Screenshots

- `/srv/dev/repro-1857/out/main-dark.png`
- `/srv/dev/repro-1857/out/main-light.png`
- `/srv/dev/repro-1857/out/candidate-dark.png`
- `/srv/dev/repro-1857/out/candidate-light.png`

Pixel comparison preceded visual inspection: 22,587 changed pixels in dark and 22,591 in light, each out of 1,600,000 pixels. All four images show the same five project rows and “No remote” for each. The remaining visible difference is the candidate’s narrower table, which brings its Actions column into the crop. No missing-row difference remains.

## Explanation and scope

`GitRemotesSection.tsx`, `useAdminData.ts` and `src/app/projects/api.ts` have no diff between these commits. The loader first awaits the project list, then all five Git-status requests before publishing the rows. The table header renders while that work is pending. `admin-tour.ts` waits for the Admin region, and `showScreen` adds a fixed 300 ms pause; neither waits for project rows. Observed row arrival exceeded that pause in all attempts. This explains how a header-only capture can occur on either version without a loading regression.

This verdict uses the requested criterion: both versions loaded every time within the wait. It does not establish the exact elapsed time of the historical screenshots. No product code was changed, and no regression fix is proposed. The broader T076 gate remains outside this targeted reproduction; main’s inherited suite failures remain as documented in its Batch 2 gate.

## Commands and exit codes

- Archive preparation: `git --git-dir=/srv/dev/sw.git archive da54cf17` and `git --git-dir=/srv/dev/sw.git archive 6ec76f7f`, extracted to the two source folders: exit 0.
- Heavy-run command, invoked unchanged from `007-gate-repro`: `sw-midgard-run -- bash -c '<loop below>'`: exit 0. The loop links the installed locked dependencies, copies the reproduction script, formats it, builds each version, and runs it with that version’s temporary root.
- For each source: `bunx --bun oxfmt scripts/repro-1857.ts`: exit 0; `bun --bun run build`: exit 0. Build logs are `out/build-main.log` and `out/build-candidate.log` under the reproduction folder.
- Main: `TMPDIR=/srv/dev/repro-1857/main-temp bun scripts/repro-1857.ts main`: exit 0.
- Candidate: `TMPDIR=/srv/dev/repro-1857/candidate-temp bun scripts/repro-1857.ts candidate`: exit 0.
- `bunx --bun oxfmt --check scripts/repro-1857.ts` and `bunx --bun oxlint --quiet scripts/repro-1857.ts`: exit 0; no lint warnings or errors.
- `python3 ~/.claude/skills/readable-code/scripts/readable_check.py ~/scratch/sw-007/repro-1857/repro.ts`: exit 0.
- Repository `bun run fmt:check` as dev with the Bun bin directory on PATH: exit 0, 1,829 matched files. An initial root-shell attempt exited 127 because bunx was absent from its PATH; the corrected invocation passed.
- Pixel comparison using the already installed `pngjs`: exit 0. An initial ArrayBuffer input attempt exited 1; converting it to Buffer corrected the decoder input. Pillow was unavailable and no dependency was installed.

The shell body passed to the heavy-run command was:

```sh
set -e
for version in main candidate; do
  source=/srv/dev/repro-1857/$version
  ln -s /srv/dev/sw/007-gate-repro/node_modules "$source/node_modules"
  cp /srv/dev/repro-1857/repro.ts "$source/scripts/repro-1857.ts"
  cd "$source"
  bunx --bun oxfmt scripts/repro-1857.ts
  bun --bun run build > /srv/dev/repro-1857/out/build-$version.log 2>&1
  echo BUILD_OK:$version
  mkdir -p /srv/dev/repro-1857/$version-temp
  TMPDIR=/srv/dev/repro-1857/$version-temp bun scripts/repro-1857.ts "$version" > /srv/dev/repro-1857/out/run-$version.log 2>&1
  echo REPRO_OK:$version
done
```

The reproduction script is retained outside Git at `/srv/dev/repro-1857/repro.ts` and in each source copy as `scripts/repro-1857.ts`.

- Handoff `oxfmt`: exit 0.
- Handoff `readable_check.py --changed`: exit 0.
- Handoff `leak_scan.py --confidential-only`: exit 0, zero hits. This is an internal evidence log with explicitly requested commands and paths.

## Cleanup, open regressions and next step

Both helper-owned application processes were stopped with SIGTERM to their exact child PID and awaited by `startAuthApi.stop()`: main PID 3451613 and candidate PID 3456625. Both logs end with `CLEANUP_COMPLETE`. `ps -p 3451613,3456625 -o pid,args` shows neither process remaining. Browser processes and mock listeners were closed by their owning APIs, and fixture directories were removed.

Open regressions for this question: none. Next step: record pair 1857 as timing in the broader gate review, and use a project-row readiness wait for subsequent Git remotes captures. No change was made to the original evidence, review worktrees, tasks checklist or gate file.
