# Hand-off: person sign-in

The three owner decisions are implemented. Final development proofs and the batch obligations
are recorded in the evidence log. The screenshot capture job, the real-client Codex run and
the integrated batch gate remain separate.

## Security boundaries

- Receipts belong to the original person and connection or to the local capability caller.
  The same operation boundary rechecks current authorization and the original targets. A receipt
  cannot cross connection ids, or become usable after an end or revocation.
- The bridge stores its own tokens in a private configuration file with atomic rotation. Browser
  sign-out or revocation ends server authorization and the next rejected refresh removes the
  local file. The bridge sign-out flag removes the file immediately after the bridge exits.
- Browser POSTs preserve the workbench Origin through a same-origin referrer policy. Exact Origin
  and CSRF remain required. Redirect responses keep no-referrer, and each setup form is single use.
- Older or evicted grant/refresh credentials are refused outside the documented replay-retention
  window. A restart loses the short-lived grant memory.

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
  those lists already; no duplicate pipeline edit was needed. The browser check builds its own
  frontend and masks the displayed setup credential in its development captures.
- The targeted mutation selector runs twelve connection cases and exits before unrelated cases.
- Redirect policy is HTTPS or loopback HTTP only; custom schemes were removed from the spec and
  registration contract. Default-brand onward-use wording is unchanged and custom names escape.

## Proofs and artifacts

Detailed results and departures are in `evidence.md`. Logs for the continuation are under
`out/proofs/`; these are ignored working artifacts. The consolidated feature rerun passed 150 tests across 22 files. The scope inventory walk passed 13,672 assertions. The combined
MCP parity/boundary/remote-credential proof passed 7 tests and 26,956 assertions. The direct-tool
matrix passed 12,096 schema-valid calls (21 tools × 64 scope combinations × nine identities),
30,209 assertions, 415.24 seconds. The latest targeted mutation run killed all 12 mutants,
including receipt ownership and current authorization, across three passing baselines. Check
and build passed on the dev server. The browser check passed 96 screens at three widths in
both themes and verified the consent redirect and single-use setup form. The MCP group had
99 passes and one missing contract classification. The dev-server rerun of both affected
documentation test files passed all seven tests after that correction. Logs are under
`out/proofs/connection-final/` and masked browser-check captures are under `out/connections/`.
The reference transport 2.4.0 passed real HTTP discovery (21 tools), authenticated project read
and post-revocation 401. Fixture consent is not browser authorization compatibility.

The dev server ran the characterization recorder. Its canonicalization matches the existing test. Against the base, only administration version hashes
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
run. The remaining integrated batch gate consists of: complete unit/mutation/browser suites, responsive/clipping
checks, release UI comparison, architecture review and security review. Do not mark green or
client-supported from component tests or the fixture-consent transport run.

Security review must cover grant/refresh replay and retention, session-await races, PKCE S256,
exact redirects, resource/program binding, cookie/JWT refusal, effect ceilings, and cross-person
connection privacy. Inspect current grants, scopes and original targets on receipt release, token
cache permissions and rotation, delegated Git sessions and the ACP integration edge. The Windows
ACL proof uses a fake platform process. Verify the actual ACL on Windows before claiming live
Windows acceptance.

The documentation scanner is clean on the updated public prose. Existing public temporary-path
examples in configuration/env docs trigger its generic path rule; their confidential-only scan
is clean. No scanner allow or bypass was used. `scripts/commit_cadence.py` is absent.
