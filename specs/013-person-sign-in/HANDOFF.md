# Hand-off: person sign-in

The feature is not ready for a green batch gate. Server MCP authentication, session-reference
Git credential writes, person/Admin screens, targeted mutation cases and gate wiring are
implemented. Browser authorization and the server bridge have unresolved contract blockers.
A completed-receipt shortcut also bypasses operation authorization for a narrower connection.
No origin push, tag, deployment or production access was performed.

## Blocking decisions

0. **Completed MCP receipt authorization:** a read-only connection can recover a completed
   git_commit result belonging to the same person/key/arguments without a twin call. The earlier
   effect is not repeated, but the current scope/resource decision and boundary audit are bypassed.
   `tests/mcp/connection-receipt-authorization.test.ts` is an explicit TODO; running it with
   `--todo` reaches the refusal assertion and gets true instead of false. Phase 9 is stopped and
   T029 is unticked again. Fresh-key matrices are not sufficient. Reconcile receipt replay with
   the existing operation boundary before further server-mode sign-off.

1. **Browser consent and setup:** the required `Referrer-Policy: no-referrer` in
   `contracts/consent-and-scopes.md` makes Chromium send `Origin: null` on the form POST.
   `request-authentication.ts` requires the exact public origin. The real browser proof stops
   there with 403. Reconcile the header/CSRF contract before changing either protection.
2. **Server bridge:** `contracts/bootstrap-credential.md` / the bridge task require an owner-only client
   token file, but the execution brief forbids plaintext token storage. The owner has not
   answered the storage exception question. No bridge changes or undocumented env vars landed.
3. **Replay retention:** the existing plan keeps eight retired refresh hashes and at most
   5,000 short-lived grants. Older/evicted credentials are refused but cannot revoke a surviving
   connection as recognized replay. Restart loses grant memory. This separate pre-existing
   limit is now public in the threat model; reconcile unqualified replay requirements before release.

## Task state

Completed in the continuation: T022, T025, T026, T028, T030, T031 and T040–T043.
T029 is partial and blocked by receipt authorization. The final consolidated feature run passed
132 tests with 15,414 assertions in 417 seconds; final check and build passed. HTTP
characterization passed 1 test / 1,602 assertions. These scoped passes do not clear the receipt
TODO or failed browser proof.
T024 is paused on storage. T033/T034 are implemented and component-tested, but remain unticked
until the browser proof passes. On resumption, finish successful-response member validation
for program registrations and reject empty client identifiers in connection replies. Phase 10 is stopped: T035–T037 remain unticked.
T039 remains unticked: no external model/account session was used for a real Codex client run.
T044 remains unticked: the integrated batch cannot be reported green.

## What changed

- Server `/api/mcp` uses the ordered opaque-token gate, ignores cookies, refuses provider JWTs
  and carries person, session reference, connection, effects and cancellation per request.
  The transport row is public only for dispatch; every tool still uses the operation boundary.
- Reference-only sessions now support locked delegated Git credential writes without extending
  idle lifetime or reconstructing the browser cookie.
- Unsupported ACP origins fail explicitly before token/record creation. Feature 015 must extend
  the shared caller/audit vocabulary before its exchange can succeed.
- Code replay during an exchange and revocation/rotation during session lookup cannot resurrect
  an active connection. Indexed credential candidates use constant-time keyed-hash verification.
- Person connections and the two Admin sections use existing components and theme tokens.
- `test:connections` is wired into the canonical and self-served gate lists. The pipeline imports
  those lists already; no duplicate pipeline edit was needed. The browser script is deliberately
  red at the real consent-origin regression, with only a partial first-screen capture.
- The targeted mutation selector runs ten connection cases and exits before unrelated cases.
- Redirect policy is HTTPS or loopback HTTP only; custom schemes were removed from the spec and
  registration contract. Default-brand onward-use wording is unchanged and custom names escape.

## Proofs and artifacts

Detailed results and departures are in `evidence.md`. Logs for the continuation are under
`out/proofs/`; these are ignored working artifacts. The first consolidated feature run passed
131 tests across 16 files. The scope inventory walk passed 13,672 assertions. The combined
MCP parity/boundary/remote-credential proof passed 7 tests and 26,956 assertions. The direct-tool
matrix passed 12,096 schema-valid calls (21 tools × 64 scope combinations × nine identities),
30,209 assertions, 415.24 seconds. The final targeted mutation rerun killed 10/10 mutants, with
both baselines passing. Check passed with zero lint errors and 2,680 warnings; build passed.
The reference transport 2.4.0 passed real HTTP discovery (21 tools), authenticated project read
and post-revocation 401. Fixture consent is not browser authorization compatibility.

The characterization was regenerated by its script on the dev server, not hand-patched. Its
canonicalization matches the existing test. Against the base, only administration version hashes
and `programs.json` in version document lists differ after that canonicalization.

## Shared-file overlaps for integration

- `handler.ts`: one mode-selection block with an unconfigured-endpoint 404 fallback.
- `request-authentication.ts`: program endpoint bypass set and address-based rate-limit admission.
- `route-actions.ts` and `operation-inventory.json`: existing MCP transport row becomes public dispatch.
- `sessions.ts`: transient reference metadata and locked update by reference; `remote-credentials.ts`
  selects that writer for delegated sessions.
- `routes/mcp.ts` and `mcp-call-audit.ts`: mode gate, per-request caller, cancellation and audit identity.
- `PersonMenu.tsx`: server-mode connection dialog entry; Admin page/sections/API/types/review/CSS
  contain the new program and connection sections.
- `package.json`, `gate-suites.ts`, mutation runner/dispatcher and MCP acceptance runner each have
  their connection entry points. `ci-validate.ts` itself is unchanged because it imports the lists.
- Characterization recorder and generated HTTP fixture; README, architecture, configuration,
  server-mode, MCP, acceptance, user guide, schema README, env example and changelog.

## Batch and review requirements

No full unit suite, full mutation suite, unrelated browser suite or integrated review marker was
run. After the blocking contracts are settled, finish the bridge and browser phase, then perform
the owner's integrated batch gate: complete unit/mutation/browser suites, responsive/clipping
checks, release UI comparison, architecture review and security review. Do not mark green or
client-supported from component tests or the fixture-consent transport run.

Security review must cover grant/refresh replay and retention, session-await races, PKCE S256,
exact redirects, resource/program binding, cookie/JWT refusal, effect ceilings, cross-person
connection privacy, no secret output/storage, delegated Git sessions and the ACP integration edge.

The documentation scanner is clean on the updated public prose. Existing public temporary-path
examples in configuration/env docs trigger its generic path rule; their confidential-only scan
is clean. No scanner allow or bypass was used. `scripts/commit_cadence.py` is absent.
