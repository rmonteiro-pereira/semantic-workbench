# Research: Shared Proposals

Each entry gives the decision, the evidence in the code at the base commit, and what was rejected.
The governing decisions (E7, E8, E9) are not reopened; this file settles how to carry them out.

## R1. Where a proposal lives in Git

**Evidence.** Branch lists, `git push --all` style commands and the branch picker work on
`refs/heads/`. `isPersonalBranch` hides only names that start with `work/` (`src/server/projects/worktrees.ts`).
The earlier evaluation proposed `proposal/<name>` under `refs/heads/` so that roles could be limited
by branch name (`src/server/auth/role-compiler.ts` accepts a `branch` condition).

**Decision.** Store each open proposal at `refs/workbench/proposals/<id>` and each closed one at
`refs/workbench/closed-proposals/<id>`. Use the logical branch name `proposal/<id>` only as the
`branch` value in access decisions, so a custom role can still be limited to `proposal/*`.

**Why.** A ref outside `refs/heads/` is not listed as a branch, cannot be checked out by mistake, is
not sent by a plain branch push, and is not taken by a clone of the folder. The branch name in
decisions keeps the existing role conditions useful.

**Rejected.** `refs/heads/proposal/<id>`: it would show in every branch list, need a new hiding rule in
each reader of branches, and be one wrong refspec away from a push.

## R2. Naming a contribution branch

**Evidence.** A personal branch is `work/<handle>`. Git stores refs as files, so `work/<handle>` and
`work/<handle>/<proposal>` cannot both exist. Handles contain only `a-z`, `0-9` and `-`
(`userHandle` in `src/server/projects/state.ts`). `branchShownTo` shows a `work/` branch only to the
person whose own personal branch has exactly that name.

**Decision.** A contribution branch is `work/<handle>.<id>`. A handle never contains a dot and an
identifier is `[a-z0-9-]` of at most 40 characters, so the name can be split unambiguously at the first
dot. `branchShownTo` gains one rule: a branch is also shown to its owner when it starts with the owner's
personal branch name followed by a dot. Everything else that treats `work/` as personal (the checkout
authorization, the push refusal, the unpublished-work archive) keeps working with no change.

**Rejected.** `work/<handle>/<id>` (a Git conflict, found while reading the review's suggestion);
a new top-level prefix such as `contrib/` (needs a second hiding rule everywhere `work/` is handled).

## R3. Where the record lives and what is truth

**Evidence.** Durable state uses atomic JSON files under `state/` (`src/server/projects/atomic.ts`,
`src/server/projects/state.ts`). Publication keeps its intent in a durable pointer that recovery
reconciles against the ref (`src/server/projects/published-pointer.ts`).

**Decision.** One file per repository, `state/proposals/<repository>.json`, holds identity (id, name,
declared projects, base, creator, time) and outcome (status, who, when, commits before and after).
The tip is never stored; it is the ref. Status is derived:

| State of refs and record | Meaning |
| --- | --- |
| open ref exists, record open | open |
| closed ref exists, record closed | closed |
| record promoted | promoted (the proposal ref is removed after promotion) |
| record open, ref missing and tip not in published history | damaged |
| ref exists, record missing | unregistered: ignored and never shown |

Creating writes the ref first, then the record, so a crash leaves an unregistered ref (invisible and
harmless) and never a record without a ref. After a promotion, reconciliation marks a proposal promoted
when its ref's tip is contained in the published history.

**Rejected.** Storing the tip in the record (two truths); writing the record first (a crash would show
a damaged proposal that was never created).

## R4. How promotion reuses publication

**Evidence.** `createPublication` (`src/server/projects/publication.ts`) owns ordering, the durable
intent and the compare-and-swap of the default ref, and runs `publicationChecks` (ancestry, readable
candidate, guard). `moveDefault` in `worktrees.ts` moves the ref and the published checkout together.
`judgePublish` in `publishing.ts` judges `changesBetween(previous, next)` with the mover's content guard.
Publishing today takes the candidate from the person's working copy HEAD.

**Decision.** Add a `promote(repository, tip)` path beside `publish` that calls the same
`moveDefault` with `next` set to the proposal tip and the same guard. It adds no second writer of the
default ref. Authorization (all projects sharing the repository) is checked before it, using
`authorizePublish` semantics extended to name the proposal.

**Open point resolved in the first task.** `changesBetween` is implemented on a working-copy place. A
Steward who has no copy needs it on the repository base. The first foundation task proves it runs on the
base checkout's folder, and if not, adds a read-only variant.

**Rejected.** Letting the promoter fast-forward their own copy to the proposal and then publish: it would
move a person's copy and index and make promotion depend on their working-copy state.

## R5. Authorization without a new permission

**Evidence.** `ACTIONS` (`src/shared/auth/actions.ts`) already has `branch`, `commit`, `edit`, `publish`
and `pull`; `BRANCH_ACTIONS` carry a branch condition. Editors have `branch`, `commit`, `pull`; Stewards
and Admins have `publish`. Handler checks live in `src/server/auth/git-access.ts`.

**Decision.** Create: `branch` on every declared project with branch `proposal/<id>`, plus `edit`.
Work and synchronize: `branch` and `pull`. Contribute: `commit` with branch `proposal/<id>` on every
declared project and `edit` on every changed path (the same path loop as `authorizeGitPaths`). Promote,
check, close, restore: `publish` on the default branch for every project that shares the repository. List
and read: `read`, filtered by the reader. A new handler check `authorizeProposal` is added to the handler
check vocabulary of the inventory so the parity table covers it.

**Rejected.** New actions `proposeCreate` and so on: they change the Cedar schema, the role matrix, the
Admin UI and every custom role.

## R6. Keeping proposal content out of everything else

**Evidence.** Agent reads pin published objects (`src/server/projects/published-snapshot.ts`); exports read
the reader's working view (`src/server/projects/project-export.ts`); the remote actions run Git against
the project folder (`src/server/projects/scm-remote.ts`).

**Decision.** Nothing new reads a proposal except the proposal service, which reads objects at the
proposal ref through the Git helper. A test lists every operation in the inventory whose exposure is a
read and runs it with an open proposal that contains a unique marker, as SC-001 requires. The push rule
(FR-032) is one function, `refuseWorkInProgressPush`, called by `push` and `sync`; a second test records
the arguments of every Git push the workbench makes and asserts that none names `refs/workbench` and none
uses `--all`, `--mirror` or `--tags`.

## R7. The refusal to push work-in-progress branches

**Evidence.** `remoteAction` pushes the current branch with `git push -u <remote> <branch>` for push and
sync (`scm-remote.ts`). In local mode the authoring branch is `work/local`.

**Decision.** In both modes `push` and `sync` refuse when the current branch is a workbench-managed
branch: starts with `work/` (any case) or `proposal/`. The default branch and any other branch push as
before. The refusal message says to publish and use "Push default". The user guide, server guide and
changelog state the change.

**Rejected.** Refusing only in server mode (local `work/local` would stay pushable and contradict E7);
refusing all non-default branches (breaks ordinary feature branches that E7 does not name).

## R8. Contribution checks on the diff

**Decision.** Compute changed paths with `git diff --name-status --no-renames`, so a rename is a delete plus an
add and both paths are checked against the declared set and for authorization. Map every path to its owner project with the same longest-prefix rule as
`authorizeGitPaths`. A path with no owner is refused. Run the content guard over `changesBetween(old, new)`
as the contributor.

## R9. Interface placement

**Evidence.** Source Control is `src/app/scm/SourceControl.tsx` inside `SourceControlView.tsx`; the
existing diff view is `src/app/scm/DiffView.tsx`; dialogs use `src/app/projects/Modal`.

**Decision.** A "Proposals" section in the Source Control view. List, detail and create dialog are new
components in `src/app/proposals/`. The text diff reuses `DiffView`. No new top-level navigation.
Server mode only: the section is absent in local mode.

## R10. Events

**Decision.** Reuse the invalidation stream (`src/server/projects/events.ts`) with a `proposal` event
tagged with the declared projects, filtered per reader by the existing event access, so a person who
cannot read any declared project never receives it.
