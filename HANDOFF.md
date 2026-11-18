# Person connections and agent panel

The agent panel uses the real person connection service in server mode. An Admin must register
`acp-relay`; the setup credential is exchanged at the token endpoint, relay tokens retain origin
`acp`, and ending a bound connection ends its panel session. This batch adds no runtime dependency.
The complete release gate and independent security and architecture reviews remain outstanding.

## Merge resolutions

The merge joins `015-agent-panel` into `batch-2` with two parents. Both feature branches share
base `84642cb0`. The person sign-in tip is `f9b685f5`; the panel tip is `e13faf11`.

| Conflicted file | Resolution |
| --- | --- |
| `src/server/handler.ts` | Keep MCP mode selection and connection routes, then panel routes or their absent fallback. The subsequent integration supplies the real connection service to the panel. |
| `src/server/auth/route-actions.ts` | Keep the server-capable public MCP dispatch row and append all browser and relay panel rows before the final page row. |
| `src/server/request.ts` | Keep both named request limits and both entries in `REQUEST_LIMITS`. |
| `scripts/mutation-tests.ts` | Register both mutant lists. Apply the connection-only selector after registration so it exits without unrelated mutants or browsers. |
| `schemas/semantic-workbench-operations-v1.json` | Keep both request-limit enum values. |
| `policies/matrix-cases.json` | Regenerate from route examples; preserve the union of both features. |
| `ARCHITECTURE.md` | Use the broader agent-operation heading and keep both module descriptions. |
| `CHANGELOG.md` | Keep the panel addition and the MCP sentence describing server-mode person connections. |
| `.env.server.example` | Keep server connection-key guidance and the relay-only credential guidance. |
| `docs/configuration.md` | Keep both connection and relay configuration sections. Correct obsolete server-mode and credential-storage statements in place. |
| `docs/server-mode.md` | Keep the MCP bridge instructions and the panel connection section, then document the exact Admin registration. |
| `docs/user-guide.md` | Keep both connection management and talking to an agent. |

Automatically merged shared blocks were also retained: both person-menu entries; connection and
panel handler options; exact relay authentication delegation; panel availability in `/api/me`;
both inventory additions; both package scripts and browser gate registrations; mutation dispatch;
README, development and MCP contracts. The missing ten panel/relay dispositions in the MCP
route contract were subsequently added as browser panel and ACP transport rows; the MCP tool
set remains unchanged. Both agreement notes record that classification. Relay rows remain public transport dispatch rows, then
perform authentication in the adapter and authorization at the operation boundary with origin `acp`.

## Generated contracts

All four artifacts were regenerated with their existing generators on the dev server. None was
hand-edited. The matrix generator and operation reference renderer were also run locally.

- `policies/matrix-cases.json`: exact union of parent cases; fixture identities unchanged.
- `docs/operations.md`: exact union of parent lines.
- Dry-run baseline: against either feature tip, twelve additional changed decisions concern only
  the two features. Seventeen protected routes × nine identities add 153 matrix cases, from
  1,035 to 1,188. Existing decisions, people and audit cases are unchanged.
- HTTP characterization: against the person sign-in tip, exactly eight `agentPanel: false` fields
  are added. All other parsed content is identical, including the existing program registration
  changes from person sign-in.

## Integration and contract correction

The handler passes `connections.service` to the existing panel mount. Credential creation uses
`createConnectionForSession({ session, clientId, scopes, origin: 'acp' })`, with named scopes `read`
and `edit`. The relay exchanges that credential for rotating tokens. The existing `resolve`
and `onConnectionEnded` implementation supplies identity and lifecycle. No parallel token service
or session-renewal path was added. The real server adapter also refuses every browser Origin
header before token resolution; this closes a newly reachable gap in the pre-integration adapter. `CALLER_ORIGINS` already includes `acp` after the merge.

The older relay contract asked for a panel session id and operation-effect names. Both plans and
the relay contract now agree with the transport-neutral service: browser session plus named scopes;
the panel binds the resolved connection at authenticated hello. The connection management
contract and data model include origin on listings and revocation. Browser setup creation and
revocation remain `http` audit events; issued/refreshed/replayed connections retain their origin;
unbound token refusals retain the token endpoint's existing `mcp` attribution.

Connection lists and confirmation dialogs show origin as text. Both person and Admin revocation
use the same service. ACP receipts retain the original person and connection and re-enter the
operation boundary before replay; narrowed scopes or removed grants refuse a prior result.
The panel itself still offers only file reads and guarded local writes, never commit operations.

Tasks completed: panel T028; the person sign-in task list's joined connection/lifetime/origin
checklist and ACP receipt checklist. Earlier completed tasks remain checked. Screenshot review
and integrated release tasks remain open.

## Proofs

Proof logs are under `out/batch-2/`. The longer targeted run has a log and status file and executes
only the requested groups under the wrapper’s 24 GiB memory and 1,200% CPU caps. The first connection-group attempt hit seven default five-second
timeouts; its cleanup errors followed those timeouts. The rerun uses `bun test --timeout 60000`
for the slower dev server. That rerun isolated one expected-contract change: the listing test’s
exact metadata keys needed the new `origin` field. The corrected assertion requires that field
and retains the credential/hash exclusion. The next run included this correction and isolated only the ten-consent quota case at the
sixty-second default. Its targeted rerun uses `--timeout 120000`; the other 138 connection tests
already passed. Subsequent groups include the browser-Origin regression. The complete unit, mutation and browser suites were not run.

- Initial join: 33 pass, 0 fail, 1,186 assertions across three files on the dev server.
- Relay idle proof: 1,000 calls, zero session touches, unchanged `lastSeenAt`.
- ACP receipts: 1 pass, 0 fail, 15 assertions through real connection resolution and the boundary.
- Panel mutants: 21 killed, 0 survived; every unmodified baseline passed.
- Connection mutants: 13/13 killed; all unmodified baselines passed.
- Connections: 138 passes in the final grouped run; its only timed-out quota case then passed
  separately (1 pass, 0 fail, 12 assertions, 70.5 seconds). All 139 cases are covered.
- ACP: 255 passes in the grouped run; the brand-dependent route assertion was corrected by
  explicitly loading the existing brand fixture, and its whole file then passed (8 pass, 0 fail,
  37 assertions). All 256 cases are covered. The six real-service cases passed in the group.
- MCP: 99 passes in the grouped run, with only the missing ACP route classification failing.
  Both matrices passed, including 12,096 direct calls; the direct matrix took 434.5 seconds.
  The corrected inventory file passes locally (2 pass, 0 fail; 152 route and contract rows,
  21 tools). Its dev-server rerun also passes (2 pass, 0 fail, 45 assertions).

- Boundary: 138 passes in the grouped run; only the guard inventory classification failed.
  Explicit exemptions now cover consent, setup and own-connection revocation; the obsolete
  public MCP exemption was removed. The whole inventory file passes on the dev server
  (3 pass, 0 fail, 309 assertions). All 139 cases are covered.
- Static: `bun --bun run check` passes, including TypeScript, formatting, lint, comments, theme and brand checks.
- Build: `bun --bun run build` passes; Vite reports its chunk-size warning.
- Connections browser: 96 screens pass at 320/768/1280 pixels in light and dark.
- Panel browser: six viewport/theme conversations pass at 360/768/1280 pixels, with all thirteen
  end reasons; the closed-only run passes six combinations without panel requests.
  Eighteen panel captures and the connection manifest are retained. Representative phone and
  desktop captures in both themes show wrapped long text and visible controls; this is not
  the outstanding every-state release visual judgment.

The focused mutation commands are `bun scripts/acp-mutants.ts` and
`bun --bun run test:mutation -- connections`. Static and build commands are
`bun --bun run check` and `bun --bun run build`. Browser commands are
`bun scripts/connections-browser-check.ts`, `bun scripts/acp-browser-check.ts` and its
`--closed-only` variant, after the build.

The connection group includes `tests/connections/`, `tests/auth/connection*.test.ts`, consent
pages, OAuth public surface, program administration, connection-dialog/Admin component checks
and `tests/docs-agent-connections.test.ts`. The other feature groups are `tests/acp/` and
`tests/mcp/`. Boundary coverage includes operation inventory, route actions, both matrices,
`tests/auth/guard*.test.ts`, all authorization parity files, operation boundary, boundary scan,
ACP origin, dry-run baseline, HTTP characterization and pipeline registration. All run on the
dev server through the approved scratch wrapper; the full suite remains deferred.

## Security review focus

- **Token origin binding:** both adapters resolve real opaque tokens and check origin before
  operations. All four relay routes refuse MCP tokens with the empty refusal; ACP tokens receive
  401 at `POST /api/mcp`. Refresh must preserve origin and must never broaden panel effects.
- **Revocation and lifetime:** after authenticated hello binds a connection, person revocation,
  sign-out, expiry, deactivation and refresh replay end the panel. Subsequent frames are refused.
  Before hello there is no bound connection; a revoked token cannot complete hello, while the
  waiting panel follows its waiting timeout. Review that documented binding boundary explicitly.
- **Refresh races:** existing tests cover concurrent refresh of one token, spent-credential reuse
  and revocation during awaited session lookup. Review the store's reread after awaits, replay
  cancellation and the fact that a racing refresh can invalidate its peer's newly issued tokens.
- **Receipts:** review person and connection keys, current role/scope enforcement, original targets
  and end signals before releasing cached results. ACP-origin receipt tests use the same shared
  tool/boundary path as MCP; the panel does not gain a commit surface from that proof.
- **Known retention limits:** retired refresh hashes and pending-grant memory are bounded;
  sufficiently old, evicted or pre-restart credentials can be refused without ending a surviving
  connection. No stronger replay-retention promise is made.

## Remaining work and limits

Admin deactivation already ends browser sessions with generic reason `admin`. The real connection
service maps that to `session-ended`, so the bound panel reports expiry. Authorization stops
correctly. A distinct deactivation notice needs a separately reviewed session-reason change.

The full batch gate, every-state screenshot judgment, release visual comparison, independent
architecture/security reviews, real external-agent server compatibility and actual Windows ACL
acceptance remain open. No origin push, tag, deployment or production access occurred.

The repository has a formatter. Changed TypeScript files were formatted with Oxfmt; generated
and prose files follow its existing exclusions. The requested `scripts/commit_cadence.py` is absent.
The public documentation scanner still flags the pre-existing public temporary-path examples in
the environment example, configuration and development documentation (eight existing hits).
The confidential-only scan is clean across all 275 changed files, including the
handoff; no scanner allow was added. The handoff itself passes the complete scanner.

All browser, relay and fixture-server lifecycles completed. No process remains with this
worktree as its dev-server working directory. The proof driver has exited.
