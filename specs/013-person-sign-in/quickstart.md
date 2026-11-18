# Quickstart: verifying person sign-in

Run from the repository root with Bun. Steps 1 to 6 need only this feature's tests. Steps 7 and 8
need feature 006 merged. Heavy runs go to the dev server: `sw-midgard-run -- <command>`.

## 1. The pure parts

```sh
bun test tests/connections/
```

Scope mapping, redirect validation, PKCE check, token hashing, code and refresh state machines.

## 2. The four unauthenticated answers

```sh
bun test tests/auth/oauth-public-surface.test.ts
```

Walks every route row; the set answered without a principal must equal the four. Checks sameness of
unknown and invalid client answers, body and parameter limits, no cookie, rate limit.

## 3. The whole flow against a mock identity provider

```sh
bun run mock-oidc &
bun test tests/auth/connection-flow.test.ts
```

Sign in, consent, trade, refresh, replay, revoke, sign out.

## 4. Lifetime

```sh
bun test tests/auth/connection-lifetime.test.ts
```

Sign-out, expiry, deactivation, grant change, program removal, restart; agent calls leave the
session's last-seen time unchanged.

## 5. Registrations

```sh
bun test tests/auth/programs-admin.test.ts tests/auth/programs-schema.test.ts
```

## 6. Browser pages and screens (hand to Codex)

```sh
bun run test:connections
```

Runs `scripts/connections-browser-check.ts`: consent, setup, error pages, the person's dialog and
both Admin sections, light and dark, phone and desktop width, empty, loading, error and long-text
states. Screenshots are taken from a fresh worktree of current `main` by Codex, per the owner's rule.

## 7. The MCP endpoint in server mode (needs 006)

```sh
bun test tests/mcp/server-mode-gate.test.ts tests/mcp/connection-parity.test.ts
```

Bearer-only, cookie ignored, invalid bearer never falls back, scope narrowing of the tool list and of
direct calls, caller fields.

## 8. The bridge and a real program (needs 006)

```sh
bun scripts/mcp-acceptance.ts --server http://localhost:4311 --setup-credential <value>
```

Records which programs completed the flow, with versions. Codex CLI is listed only after a run.

## Expected outcomes

Each step prints the failing case by name. A run that finds a token, code or credential in a state
file, the audit log or the logs fails step 3.
