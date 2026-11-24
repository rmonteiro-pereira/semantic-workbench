# Quickstart: verifying the agent panel

Run from the repository root with Bun. Heavy runs use `sw-midgard-run -- <command>`.

## 1. Origin acp is accepted everywhere

```sh
bun test tests/auth/audit-origin.test.ts tests/auth/audit-compat.test.ts
```

Passes when records with origin `acp` are written, filtered and exported, and old months verify.

## 2. The frame layer and session rules

```sh
bun test tests/acp/
```

Covers frame numbering and replay, schema refusal, session states and all 13 end reasons.

## 3. File requests equal ordinary operations

```sh
bun test tests/acp/file-parity.test.ts tests/acp/hostile-requests.test.ts
```

The parity table prints one line per case. A failure names the case and the field that differs.

## 4. Try it by hand (local mode, needs feature 006)

```sh
bun run dev
```

Open the person menu, choose **Agent panel**, read the statement, choose **Start session**. In a
terminal run the command the panel shows, for example:

```sh
bun scripts/acp-relay.ts --session <code> -- <your agent command>
```

The panel changes to **Connected**. Ask the agent to read and change a definition; the change
appears as a diff. Close the panel: the relay exits.

## 5. Browser check

```sh
bun run test:acp
```

Runs the panel against the scripted reference agent: connect, converse, write, conflict, question,
cancel, end by each route, in light and dark at 360, 768 and 1280 pixels.

## 6. Closed by default

```sh
bun run test:acp -- --closed-only
```

Opens the application, never opens the panel, and fails on any request to a panel route.
