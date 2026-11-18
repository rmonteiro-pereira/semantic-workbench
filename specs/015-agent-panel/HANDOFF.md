# Hand-off: agent panel

## Current state

Completed: T001–T027, T029–T036 and T038–T043. Final proof summaries follow below. T028, T037 and T044 remain open deliberately. No project remote push, deployment,
screenshot capture or complete batch suite was performed.

The panel is closed by default. Its person-menu entry dynamically imports a separate React root
inside the canvas row, preserving the closed canvas and restoring menu focus on close. It renders
plain-text messages, tools, the agent's plan, versioned diffs/Undo and permission choices. Writes
use the existing browser API helper and its X-SW-Request header. Transcript content stays in
memory; sessionStorage stores only the session id. The workbench neither calls a model nor starts
an agent. The person-run relay starts the selected process without workbench credentials or tool
servers in the ACP handshake.

## Integration and review still required

- T028: assemble the real connection service from the sign-in worktree in server mode. The
  interface and double now match its named read/edit scopes, optional origin, credential result
  and complete end notice. The real service must supply createConnectionForSession, resolve and
  onConnectionEnded. Exercise sign-out, expiry, deactivation and revocation, and prove 1,000 agent
  requests never touch the browser session. Local acceptance is not proof of this assembly.
- T037: capture and judge every planned state at 360/768/1280, light and dark, including long text.
  The browser check makes geometry assertions without capturing images.
- T044: integrated batch owns the full unit suite, full mutation suite, all browser suites,
  release-screen visual comparison and independent architecture review/marker. Run it after
  combining the related features, not independently here.
- Security review: the four relay rows remain public inventory rows so the relay adapter can
  authenticate its own capability/token. Authenticated requests then re-enter the operation
  boundary with origin acp; all four route policies have allow/refusal proofs. Foreign origins
  and hosts, invalid credentials and replayed codes return the bounded empty refusal. Do not
  restore the old outer 403 path or authorize relay operations in the transport.
- The agent surface is text-file read/write only, using virtual-root validation and a version
  read in the same session before write. There is no terminal, commit, push, publish or arbitrary
  filesystem operation. The threat model explicitly discloses draft text that the agent opens.

## Corrections and departures

The consecutive-oversize counter no longer resets before an oversized frame. All thirteen end
reasons now have lifecycle coverage, including browser inference after process-owned memory is
replaced. Refused relay attempts and unsupported method classes have content-free audit records.
Token exchanges validate HTTP status and required token fields. Malformed session-create bodies
are refused before state changes. Completed messages render once; permission focus waits until
pending actions settle.

Tests remain under tests/acp rather than adding a second presentation-test group. Layout and
focus are verified through the real browser entry point rather than a server-rendered geometry
assertion. No main.tsx or WorkspaceCanvas.tsx edit was needed. CI already consumes the suite
inventories, so no direct ci-validate.ts edit was needed. One proposed mutant is equivalent
because the existing equality guard proves both hash values equal; nineteen other mutants were
killed. Compatibility is claimed only for reference-agent 1.0.0 in local mode.

Shared-file blocks, individual proofs, the scanner caveat and reasons for these departures are
recorded in evidence.md. Changes to the five shared files identified in the brief are each one
contiguous block relative to the feature base. The additional authentication dispatcher and
route-verdict changes are each one block as well.

## What T001 verified

Source: the protocol's own repository and published pages, 2026-11-17. Pinned revision: protocol
version 1, schema release `schema-v1.32.0` (published 2026-11-14), Apache-2.0, `schema.json` sha-256
`e747a7be...ae21`. Version 2 exists only as an alpha and is not used. Stdio is the only published
transport (the client launches the agent; one JSON-RPC message per line). The methods used:
`initialize`, `session/new` (`cwd` absolute, `mcpServers` required), `session/prompt`,
`session/cancel`, `session/update` (including `plan`), `session/request_permission`,
`fs/read_text_file` (absolute path, 1-based `line`, `limit`), `fs/write_text_file` (no base version;
the client must create a missing file). Terminal and elicitation are not advertised. Cancel rule:
the client must answer every pending permission request `cancelled`. No JSON-RPC batch is
defined. The full record is in `research.md` (R1 verified record) and `docs/agent-panel.md`
(Protocol record). No plan assumption failed. Documents changed: `research.md` (record added),
`contracts/acp-client-surface.md` (verified method names, terminal answer, cancel rule,
authentication-required rule, `cwd` and `mcpServers`), then `docs/agent-panel.md` and
`schemas/acp-1.32.0.json` (T001 and T002).

## Proofs for this continuation

- Feature tests, operation inventory, route actions, read/write matrices, guards, origin parity,
  boundary scanner and pipeline registration: 353 pass, 0 fail, 47,506 assertions across 41 files
  on the dev server. The final setup-response validation then passed its targeted file: 2 pass,
  0 fail, 14 assertions; the closing check/build/browser run includes that correction.
- Lifecycle: 13 pass, 0 fail, 87 assertions, including loss of server memory and refusal after ending.
- Connection contract: 3 pass, 0 fail. Token replies: 2 pass, 0 fail, 9 assertions.
- Session routes: 8 pass, 0 fail, 37 assertions. Event reducer: 2 pass, 0 fail, 9 assertions.
- Presentation: connect/setup 2 pass/14 assertions; transcript 1 pass/6; Undo 1 pass/3;
  questions 1 pass/4. Pipeline registration: 8 pass, 0 fail, 32 assertions.
- Audit: 2 pass, 0 fail; bounded anonymous records and no content canary in audit/logs/metrics.
- Four relay-route policy proofs: 2 pass, 0 fail, 18 assertions.
- Final browser transport, reducer and presentation files: 7 pass, 0 fail, 36 assertions.
- Focused mutation run: 19 killed, 0 survived. One equivalent hash mutant omitted with its proof
  in evidence.md. The full mutation suite belongs to the batch.
- Browser: two consecutive passing runs of six width/theme conversations, thirteen ending notices, setup failure, disconnected
  recovery, long text, diffs, Undo/conflict, question focus and keyboard visibility. Closed-only:
  six width/theme visits with no ACP requests. No screenshots were taken.
- Final dev-server check: exit 0, including TypeScript, formatting, lint, comments, theme and
  brand. Lint has 2,696 existing warnings and no errors. Build: exit 0, 2,333 modules, 2.97 seconds;
  existing chunk-size and ReactFlow directive warnings remain.
- Main-entry comparison against fe462cc0: 2,521,830 to 2,521,415 bytes, down 415 bytes. The
  final product build keeps that size and no panel-transport code in the eager entry.
- Readability and comment checks: clean. Docs sync: exit 0. Confidential-term scan: clean for all
  changed files. Full scanner: the eight pre-existing public temporary-path examples described
  in evidence.md remain flagged. The requested cadence script does not exist in this repo.

## Commits in this continuation

- `35f5d96e` fix: end agent sessions after consecutive oversized frames
- `c82c4e13` fix: align relay connection contract with connection service
- `8073b399` fix: authorize relay calls through the operation boundary and audit refusals
- `e235565a` feat: reduce numbered panel events and share browser transport contracts
- `4e9f4e70` test: type relay refusal headers for the request contract
- `d9baf7af` feat: display plain-text agent messages tools and task lists
- `9e678bfe` feat: show guarded edit diffs and undo from the accepted version
- `0093ae58` feat: answer agent permission questions with explicit choices
- `0c54ed16` feat: connect and end in-memory agent conversations in a responsive sheet
- `49314098` fix: keep undo errors readable and reject unsupported panel statuses
- `298f7949` refactor: confine relay authentication delegation to the request stage
- `8894c4ff` test: detect faults in agent paths versions lifetimes and protocol limits
- `8c6a2941` fix: focus agent permission options after pending actions settle
- `5a9e1992` test: cover every agent session ending including lost server memory
- `c2a80527` fix: validate relay token replies before using connection credentials
- `73e6a2ed` feat: open the lazy agent sheet from the person menu
- `34c7b4bd` test: prove policy authorization for all four relay routes
- `b4e7e29d` docs: describe agent panel setup scope limits and reference compatibility
- `ba8073bf` fix: align relay request dependency and setup refusal types
- `dbcab6bf` fix: announce completed agent messages without duplicating their text
- `16f3b44d` fix: reject malformed agent session options before creating state
- `8bfea1c8` test: exercise agent conversations and recovery across widths and themes
- `f5062831` fix: preserve route inventory order when registering conversations
- `5d00ac91` test: compare audit decision rules without depending on iteration order
- `8a127e3e` test: constrain panel audit and identity infrastructure imports by symbol
- `50592223` fix: pass audit normalizer field names only through explicit callbacks
- `2b57dbc5` test: await the simulated stream failure before checking panel recovery
- `e7a1c26c` fix: validate complete session instructions before accepting setup replies
- `edebede1` test: keep one persistent interceptor across agent connection failures
