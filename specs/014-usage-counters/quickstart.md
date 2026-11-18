# Quickstart: verifying usage counters

Run from the repository root with Bun. Heavy steps go to the dev server with
`sw-midgard-run -- <command>`. These are the acceptance path for the feature; the tasks name the tests.

## 1. Counting and privacy

```sh
bun test tests/usage/
```

Passes when scripted application-client and twin calls produce the expected counts, refused and
browser requests produce none, and a scan of the stored files finds no identity field.

## 2. Turn counters on locally and look

```sh
SW_USAGE_COUNTERS=on SW_USAGE_RETENTION_DAYS=30 bun run dev
```

Make an application-client request (see `docs/agent-runtime.md`) for a mapping context, wait 30
seconds or stop the server cleanly, then read `data/state/usage/<project>/<today>.json`. The file holds
addresses and numbers only. Open the graph, choose **Traffic** in the options, and select a counted
item: the details panel states the count, the period and "requests through this workbench".

## 3. Counters off

Start without the variables. No `data/state/usage/` folder appears. The Traffic option says
"Not collected" (an Admin sees how to enable it).

## 4. Rename and expiry

```sh
bun test tests/usage/usage-migration.test.ts tests/usage/usage-retention.test.ts
```

## 5. Reading rules

```sh
bun test tests/auth/usage-read-parity.test.ts tests/auth/access-boundary.test.ts
```

## 6. Interface

```sh
bun run test:usage-traffic
```

Runs `scripts/usage-traffic-browser-check.ts` against a mocked usage answer: Traffic off equals the
baseline structure, on, empty, off-state, loading, error, long names, phone width, light and dark.
Screenshots for review are captured by Codex from the brief in the tasks, never in this session.

## 7. Gate

Left to the integrated batch: full unit suite, `bun run test:mutation`, every browser suite, the UI
regression comparison and the architecture review.
