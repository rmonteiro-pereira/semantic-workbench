# Quickstart: capture and check a lane

How an implementing agent produces the before/after pair and runs its checks. Paths assume the lane worktree `/home/rodrigo/projetos/semantic-workbench-wt/007-lane-<x>`.

## Prerequisites

- The foundation tasks are merged and the lane branch is rebased on them (fonts change text width; no 'after' image before that).
- `bun install --frozen-lockfile` in the worktree.
- A free port per lane: A 5201, B 5202, C 5203, D 5204, E 5205 (the capture scripts' own fixtures use 5190-5195; do not reuse those).
- A neutral Git identity in the environment: `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`.

## Start the dev server on a temporary data folder

```sh
cd /home/rodrigo/projetos/semantic-workbench-wt/007-lane-a
DATA_DIR=$(mktemp -d /tmp/sw-lane-a-XXXXXX) bun x vite-plus dev --host 127.0.0.1 --strictPort --port 5201
```

Never point a lane at the owner's real `data/` or at a dev port in use.

## Capture the 'after' side

The review's scripts write files with the same names as the review's screenshots, so a pair is two files with one basename.

```sh
OUT=/home/rodrigo/projetos/semantic-workbench-ui-review-20261115/after/a
SW_BASE_URL=http://127.0.0.1:5201 SW_THEME=light bun scripts/ui-review/capture-states.ts $OUT/states graphs
SW_BASE_URL=http://127.0.0.1:5201 SW_ONLY=neighborhood bun scripts/ui-review/capture-states.ts $OUT/states graphs
SW_BASE_URL=http://127.0.0.1:5201 bun scripts/ui-review/lineage-walk-states.ts $OUT/states
SW_BASE_URL=http://127.0.0.1:5201 bun scripts/ui-review/known-issues.ts $OUT/states 1 1
```

`capture-index.md` gives the exact command for every state named in the tasks. `SW_ONLY` limits a group; `SW_THEME` limits the theme; `SW_FOLLOWUP_WIDTH` and `SW_FOLLOWUP_ONLY` limit the follow-up scripts to one width or state.

## Compare

Open `<review>/screenshots/<folder>/<name>.png` and `$OUT/<folder>/<name>.png` at native resolution. Record each pair in `specs/007-ui-review-fixes/evidence/<lane>.md` with: finding id, requirement, the two paths, the check that passed, and one sentence saying what changed.

## Lane checks

```sh
bun test
bun --bun run check
bun --bun run build
bun run test:graph        # lane A; see each lane's final task for its list
bun scripts/mutation-tests.ts
```

Browser suites run against the dev server (`SW_BASE_URL`); they use mocked or isolated stores and never touch the owner's workspace.

## Whole-journey gate

The gate task captures the stock tour, `capture-states.ts graphs` and `rest` and every script named in a task on the merged branch, pairs each file with its review baseline and classifies it in `evidence/GATE.md`. Screenshot work is handed to Codex with a brief that names the output folder, a temporary `DATA_DIR`, a spare port, and forbids touching `data/`, running dev ports, application code, commits and pushes.
