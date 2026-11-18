# Quickstart: verifying shared proposals

Run from the repository root with Bun. These steps are the acceptance path; the tasks name the tests
behind each. Heavy runs go to the dev server with `sw-midgard-run -- <command>`.

## 1. A proposal moves only by compare-and-swap

```sh
bun test tests/proposals-contribution.test.ts tests/proposals-concurrency.test.ts
```

Passes when one of many simultaneous contributions wins, the others answer stale, and the proposal never
holds a commit from a personal branch.

## 2. Scope and authorization

```sh
bun test tests/proposals-scope.test.ts tests/auth/proposal-parity.test.ts
```

Passes when every case of the declared-project rules and the authority matrix gives the expected answer
and each route's HTTP and in-process answers agree.

## 3. Promotion is atomic

```sh
bun test tests/proposals-promotion.test.ts tests/proposals-recovery.test.ts
```

Passes when promotion with partial authority never moves the default branch, a guard or validation
failure moves nothing, and an interruption at each step ends with the proposal promoted only if the
default branch moved.

## 4. Nothing leaves the workbench

```sh
bun test tests/proposals-confinement.test.ts tests/work-in-progress-push.test.ts
```

Passes when no export, agent read or snapshot contains proposal bytes and no push names a proposal ref or
a work-in-progress branch.

## 5. The interface

```sh
bun run test:proposals
```

Starts a mocked API, walks list, create, detail, check, promote, close and restore at desktop and phone
widths in both themes, with the empty, loading, error and long-text states, and writes screenshots to the
folder the script prints. The two-editor journey (create, contribute, synchronize, contribute, promote) is
added to `bun run test:two-editors`.

## 6. Before the batch gate

```sh
bun --bun run check
bun --bun run build
```
