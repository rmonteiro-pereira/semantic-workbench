# Verification

## Local gate

The owner runs the complete gate with containers and Chromium available. Restricted development
checks do not stand in for the full gate.

| Criterion | Command | First full duration | Result |
| --- | --- | --- | --- |
| SC-013 | `bun run ci:validate` | about 46 min (2026-10-22, shared development machine) | see below; the owner's workstation run is still to be recorded |

### First full run on the development machine (2026-10-22)

The machine was shared with other heavy jobs throughout (load average between 20 and 70 on 28
threads), so durations are upper bounds and timing budgets were at risk.

| Step | Duration | Result |
| --- | --- | --- |
| verify | 169 s | passed |
| mutation | 77 s | passed, 151 of 151 mutants killed |
| browser | about 1,460 s over 23 suites | 21 passed; `test:graph` (longest main-thread task 118–140 ms against 100 ms) and `test:editor` (31–33 ms per keystroke against 30 ms) missed their timing budgets |
| image | 123 s | passed |
| container | 928 s | passed |
| pipeline | 7 s | passed |

The two timing misses repeat only under that load. This change touches no application code (`src/`
and `server/` are unchanged), and both suites passed on the same frontend in the previous gate run.
Their budgets are unchanged. Both suites must pass in the owner's run before SC-013 is accepted.

## Sign-in (development machine, 2026-10-22)

Gates this change affects, run on the integrated tree. The full browser matrix and the timing
budgets run once more in the final gate.

| Check | Result |
| --- | --- |
| `bun test` | 914 passed |
| `bun run test:mutation` (through `ci:validate --step mutation`) | 163 of 163 mutants killed |
| `bun run test:auth` | passed: every fixture person, refresh, expiry, directory overage and failure, live updates, sign-out, local mode unchanged; screenshots at the four widths |
| `bun run test:auth:keycloak` | passed against Keycloak 26.4 (pinned digest) |
| `bun run test:container` | passed: local group and the server-mode group with the mock provider |
| `pipeline:lint`, dry runs for `pr`, `main`, `tag:v0.4.0-alpha.1` | passed; the `auth` leg is in the browser matrix and no Keycloak or service container appears |

## Azure delivery definition (development machine, 2026-10-22)

No Azure, registry or identity provider was contacted; the deploy paths ran against the fake client.

| Check | Result |
| --- | --- |
| `bun test` | 1,001 passed |
| `ci:validate --step mutation` | 169 of 169 mutants killed |
| `ci:validate --step image` | passed |
| `ci:validate --step container` | passed, including `deploy:smoke --loopback` against the server-mode container (10 of 10 checks) |
| `pipeline:lint`; dry runs `pr`, `main`, `tag:v0.4.0-alpha.1`, rollback pipeline | passed; Deploy runs on tags only with the deploy connection; Rollback is manual and tag-only |
| `deploy:azure -- --fake`, `deploy:rollback -- --fake --to previous`, every script's `--help` | passed |

## Read filtering (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,044 passed |
| `ci:validate --step mutation` | 176 of 176 mutants killed |
| `test:auth` | passed, including the read-visibility part and "1 file you cannot open" |
| Browser suites | all passed; `test:lineage`, `test:mappings-layout`, `test:trash` and `test:examples:ui` each failed once while the machine's load average was 56–75 and passed on rerun; no budget was changed |
| `test:container` | passed (local, server-mode and smoke groups) |

## Write authorization (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,091 passed |
| `ci:validate --step mutation` | 185 of 185 mutants killed |
| `test:auth` | passed, including the role-aware controls |
| Browser suites | all passed; `test:ui`, `test:autosave` and `test:dialogs` failed once each because the Vite server or the page process stopped before the first check, and passed on rerun; no budget was changed |
| `test:container` | passed (local, server-mode and smoke groups); one earlier run stopped in `test:responsive` and the rerun passed |

## Timing budgets on an idle machine (development machine, 2026-10-22)

Commit 0240c68, load average about 1 on 28 cores, each suite run alone through the gate.

| Suite | Result |
| --- | --- |
| `test:graph` | passed; 1,000-entity neighbourhood centred and laid out in 220 ms; longest main-thread task while piercing 0 ms |
| `test:editor` | passed; 26.3 ms mean per keystroke without a save (30 ms budget), 17.2 ms with an automatic save in flight; inline finding 333 ms after the last keystroke (500 ms budget) |

These replace the misses measured under load earlier; no budget was changed.

## Admin panel (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,194 passed |
| `ci:validate --step mutation` | 199 of 199 mutants killed |
| `test:auth`, `test:admin` | passed; Admin panel screenshots at 390×844, 1280×720, 1440×900 and 2560×1440 reviewed |
| Browser suites | `test:responsive`, `test:projects`, `test:trash` and `test:dialogs` passed; run in parallel, Vite sometimes did not start, and each passed alone |
| `test:container` | passed (local, server-mode and smoke groups) |

## Agent clients (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,216 passed |
| `ci:validate --step mutation` | 204 of 204 mutants killed |
| `test:auth`, `test:admin` | passed, including both agent-client checks |
| `test:container` | passed (local, server-mode and smoke groups) |

## Governed metrics and classifications (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,262 passed |
| `ci:validate --step mutation` | 218 of 218 mutants killed |
| `test:auth`, `test:admin` | passed, including the governance steps |
| Browser suites | `test:metrics`, `test:odcs`, `test:item-edit`, `test:projects`, `test:trash`, `test:autosave` and `test:ui` passed; `test:odcs` once needed a rerun because Vite did not start while three servers optimised dependencies at once |
| `test:container` | passed (local, server-mode and smoke groups); one run stopped in `test:monorepo` waiting for a clone in the image and the rerun passed |

## Remote Git with personal credentials (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,285 passed |
| `ci:validate --step mutation` | 238 of 238 mutants killed |
| `test:auth` | passed, including the connected-accounts dialog and the connect prompt |
| Browser suites | `test:scm` and `test:git-setup` passed; `test:git-setup` once stopped at its credential-guide step and passed on rerun |
| `test:container` | passed (local, server-mode and smoke groups) |

## Your own working copy (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,324 passed |
| `ci:validate --step mutation` | 257 of 257 mutants killed |
| `test:auth`, `test:two-editors` | passed; two editors on one repository never affect each other, and a Viewer sees only what was published |
| Browser suites | `test:scm`, `test:git-setup`, `test:projects`, `test:trash`, `test:monorepo` and `test:autosave` passed |
| `test:container` | passed (local, server-mode and smoke groups) |

## Entra sign-in through MSAL (development machine, 2026-10-22)

| Check | Result |
| --- | --- |
| `bun test` | 1,361 passed |
| `ci:validate --step mutation` | 269 of 269 mutants killed |
| `test:auth`, `test:admin`, `test:two-editors` | passed, signing in through MSAL against the mock provider's Entra endpoints, including provider-initiated sign-out |
| `pipeline:lint` | passed |
| `test:container` | passed on the third run; the first stopped in `test:edges` (the mini-map covered the node being clicked) and the second in `test:git-setup` (credential-guide step); both suites passed twice against the dev server and no budget was changed |

## Security review: authentication, sessions and HTTP boundary

### Authentication, sessions and the HTTP boundary

| Finding | Fix | Test |
| --- | --- | --- |
| 1 High: a changed `SW_SESSION_KEY` or a corrupt session file stopped the server, failed every request and the callback | A record that cannot be decrypted or parsed is deleted, logged as `session-unreadable` and read as absent; the sweep and the start-up index continue | `tests/auth/session-key-rotation.test.ts` (restart with a new key, corrupt records, sweep, old cookie, callback with an old cookie) |
| 2 Medium: unknown errors answered 400 with their text and were not logged | Server mode answers `500 {"error":"Internal error."}` and logs `[http] <requestId> <name>: <message>`; only `BadRequestError`, `InputError` and the other typed errors keep their status; the legacy routes follow the same mapping | `tests/auth/error-boundary.test.ts` |
| 3 Medium: anonymous refusals and failed sign-ins each wrote a durable audit record | Per source address and reason, the first 20 are recorded, then one a minute; a per-address token bucket answers 429 before dispatch | `tests/auth/request-limits.test.ts`, `tests/auth/rate-limit.test.ts` |
| 4 Medium: no limit on `/auth/login` and `/auth/callback`; the replay ledger was scanned on every consume | The two routes share a tighter per-address bucket; the ledger is pruned at start-up and once a minute | `tests/auth/request-limits.test.ts`, `tests/auth/sign-in-ledger.test.ts` |
| 5 Low: Entra `preferred_username` counted as a verified address | The user name and UPN count only for a member of the home directory; otherwise a verified e-mail claim is required | `tests/auth/entra-verified-address.test.ts` |
| 6 Low: the provider-session index used the session-encryption key | The index HMAC uses a key derived from it with its own HKDF label (`sw-provider-index`) | `tests/auth/provider-index-key.test.ts` |
| 7 Low: an unreachable provider during refresh ended the session | The session stays and the request answers 503; a refused refresh, a foreign tenant, an upgraded token format or another identity ends it | `tests/auth/refresh-outage.test.ts` |
| 8 Low: development mode, no error handler, no idle timeout on any connection | `serveOptions` sets `development: false`, an error handler and an idle timeout; only the event stream asks for none | `tests/server/listener.test.ts` |
| 9 Low: failed sign-in pages answered 200 | 400 for attempt-invalid, token-invalid and tenant-mismatch; 503 for provider-unreachable | `tests/auth/sign-in-failure-status.test.ts` |
| 10 Low: the logout form body was buffered before its size check | A declared length over 4096 is refused unread; any other body is read in chunks and cut off at 4096 bytes | `tests/auth/csrf-body-limit.test.ts` |
| Re-review 1: behind ingress every visitor shared one rate-limit key | `SW_TRUSTED_PROXY_HOPS` takes the client address from the Nth entry from the right of `X-Forwarded-For`; a signed-in person is limited as themselves; IPv6 counts as its /64; the deployment preflight requires `1` | `tests/auth/source-address.test.ts`, `tests/auth/trusted-proxy-config.test.ts`, `tests/auth/request-limits.test.ts`, `tests/pipeline/deploy.test.ts` |
| Re-review 2: the audit throttle lost volume | The next admitted record carries `suppressed: n`; rate-limited sources are logged once a minute | `tests/auth/rate-limit.test.ts`, `tests/auth/request-limits.test.ts` |
| Re-review 3: malformed percent escapes became 500 | `decodeSegment` answers a path error (400) at every route | `tests/auth/malformed-path.test.ts` |
| Re-review 4: remote Git commands outlast the idle timeout | Fetch, pull, push, sync and the default-branch commands keep the connection open | `tests/server/remote-git-timeout.test.ts` |
| Re-review 5: Git's output reached the client | Server mode answers `Git failed.` and logs the output with the request id | `tests/auth/git-failure-response.test.ts` |
| Re-review 6: a read error must not delete a session | Only decrypt, parse and format errors discard a record | `tests/auth/session-read-failure.test.ts` |
| Re-review 7: only the provider call counts as an outage | A failure after the provider answered is an internal error and keeps the session | `tests/auth/refresh-outage.test.ts` |

Checks on the development machine (2026-10-23): `bun test` 1,443 passed; `bunx tsc --noEmit`,
`fmt:check`, `lint`, `check:comments` and `build` clean; `test:auth`, `test:admin` and
`test:scm` passed; `test:git-setup` passed alone and after `test:scm`, but stopped once at its
credential-guide step when run in a chain and passed on rerun; `test:mutation` 337 of 337
mutants killed, 68 of them new.

Each decision above has mutants in `scripts/session-security-mutants.ts`, checked by
`scripts/session-security-mutation-cases.ts`.

## Security review: image, Compose, pipeline and deployment (development machine, 2026-10-22)

All tests below are in `tests/pipeline/delivery-security.test.ts` unless another file is named.

| Finding | Fix | Test |
| --- | --- | --- |
| High: branch control on service connections was optional, so pull-request validation could run a changed step with `sw-azure-deploy` or `sw-azure-push` | Branch control is mandatory in the setup guide, the contract and trial step 1 (deploy `refs/tags/v*`; push `refs/heads/main`, `refs/tags/v*` with Verify branch protection; pull `refs/tags/v*`); the tag-only connections keep Verify branch protection off because tags have no policies, and trial step 10 confirms it. `pipeline:lint` refuses a service connection outside the deployment jobs and `image-jobs.yml`, an ungated or second connection step in `Image`, and the wrong connection per step; `pipeline:dry-run --run pr` fails when any step with a connection would run | "service connection gates" (five refusals plus the delivered files), "dry-run plan" (a pull-request run enables no connection step; a changed condition fails the plan), "the setup guide makes branch control mandatory"; mutants `pipeline-gates`, `pipeline-pr-azure` |
| High: a tag on any commit passes `refs/tags/v*` | Create tag on `refs/tags/v*` for the release operator only (guide, contract); `deploy:check-version` requires the tagged commit to be an ancestor of `origin/main` and the check job checks out with `fetchDepth: 0`; approvers compare the tag's commit with the merged pull request | "release commit on main" (real Git repository: reviewed commit passes, unreviewed refused, missing `origin/main` fails closed, script refuses before the registry), "the tag check needs the full history", dry-run "tag check uses ... full history"; mutants `deploy-ancestry`, `deploy-ancestry-cli` |
| Medium: Contributor on the container app includes `listSecrets` and the exec token | Custom role `deploy/container-app-deployer-role.json` (`containerApps/read`, `write`, `revisions/*`, `locations/containerappOperationStatuses/read`, `locations/containerappOperationResults/read`; resource-group assignable scope; trial step 9 verifies the names, an update and `revision copy`) in the guide, the contract and trial step 9 | "deployment roles and documents" (exact action list, no secret or exec action, one container-app scope) |
| Medium: preflight checked the ingress port, not its security | Preflight reads `external`, `allowInsecure`, `transport`, `corsPolicy` and requires external, HTTPS only, no CORS origin but `SW_PUBLIC_URL`, and app `SW_PUBLIC_URL` equal to the variable; missing values count as unsafe; guide row "HTTPS only, no CORS" | "ingress preflight" (seven refusals with no Azure write, the accepted forms, the Azure response boundary); mutants `deploy-ingress`, `deploy-ingress-read` |
| Medium: version tags locked by hand, `sha-*` never locked, a rerun on `main` overwrote `sha-<commit>` | `deploy()` locks `sha-<commit>` then the version tag after promotion through the client (`az acr repository update --write-enabled false`); a rerun skips a promotion already on the digest; custom role `deploy/registry-tag-lock-role.json`; `image:push` takes the digest from the push, locks `sha-<commit>` at once and re-reads it, and keeps an existing tag only if it is locked and its revision and version labels match, then scans and lists that digest by reference | "tag locking", "rerun after a half-finished lock", "commit tag push" (kept only when locked and labelled, unlocked or mislabelled refused, digest from the push, re-read, no digest reported); mutants `deploy-lock`, `image-lock`, `deploy-lock-client`, `deploy-promote-rerun`, `image-push-guard` |
| Low: the tag check used the push connection only to list tags | New parameter `acrPullServiceConnection` (`sw-azure-pull`, `AcrPull`) used by the `check` job; lint requires it | "the tag check must use the pull connection", "the push step must use the push connection", "the pull connection needs its own parameter"; mutant `pipeline-gates` |
| Low: deploy and rollback jobs installed development dependencies | `setup-steps.yml` parameter `production` runs `bun install --frozen-lockfile --production`; deployment, rollback and the check job set it; the deploy scripts import no development package | "deployment and rollback install production dependencies only", "delivery installs production dependencies and validation installs everything" (dry-run); mutant `pipeline-gates` |
| Low: the trial report goes into a public repository | Runbook asks for pass or fail with check names, and lists what to redact (tokens, `Set-Cookie` values, agent-client output, audit lines with emails or object IDs, approver names) | "the trial report keeps raw output, tokens and names out" |
| Low: `--logs-workspace-key` typed in clear text | Guide reads the key with `az monitor log-analytics workspace get-shared-keys ... --query primarySharedKey` | "the Log Analytics key is read by command" |
| Low: nothing proved the image runs read-only without capabilities | `compose.yaml` `workbench` and `workbench-server` set `read_only`, `tmpfs: [/tmp]`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`; `test:container` starts its containers with `--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges` (`scripts/container-hardening.ts`); the server code writes only below `DATA_DIR` (`/data`) and `SW_CACHE_DIR` (`/tmp/sw-cache`) | "read-only container run", `tests/server/container-check.test.ts` "the checked container runs read-only"; mutant `container-hardening`; the container suites themselves run in the coordinator's pass |
## Security review: data access, files and Git (development machine, 2026-10-22)

Each row names a finding of the review of release 0.4.0, the change that closes it and the test
that fails without the change. Each decision added has mutants in `scripts/security-review-mutants.ts`.

| Finding | Fix | Test |
| --- | --- | --- |
| High: a restricted folder opens through a case variant (`SECRET/plan.yaml`) on the SMB share, which ignores case; files, drafts, history and staging were affected | `assertExactCase` in `server/projects/paths.ts` refuses a path that spells an existing name in another case, or a new name that differs from a sibling only in case; `projectFile`, the Source Control path checks and the draft route use it, and the error answers 404 like a hidden file | `tests/case-variants.test.ts` (fake listing standing for a case-insensitive volume, and the real disk); `tests/auth/case-variants.test.ts` (every route that names a path) |
| Medium: anyone could check out another person's `work/<handle>` branch once no copy held it | `copyScmHooks` refuses any personal branch but the person's own; the branch list leaves other people's out | `tests/auth/branch-access.test.ts` |
| Medium: staging answered with the unfiltered status, which listed hidden paths | `stage`, `unstage` and `stageAll` take the request's reader and answer with its view | `tests/auth/stage-status.test.ts` |
| Medium: restoring a file whose project is gone made a project without a creation decision; a file deleted outside any copy was restored into the published checkout | the restore route runs the creation checks and records the domain; a copy-less entry is restored into the person's own copy | `tests/auth/trash-restore-access.test.ts`; `tests/auth/write-regressions.test.ts` (changed, see below) |
| Low to medium: drafts of up to 24 MB, without a limit on their number, for paths that do not exist | a draft body is at most about 4 MB, a person keeps 200 drafts per project and 1,000 in all, and a draft needs a file on disk or in the index | `tests/draft-limits.test.ts` |
| Low: `@{-1}`, a tag or a remote branch such as `origin/-x` passed the branch check, and the authorized name could differ from the branch Git switched to | the name is resolved with `rev-parse --symbolic-full-name`, only branches are accepted, the local name must be a plain branch name, and the switch ends its options | `tests/auth/branch-access.test.ts` |
| Low: a remote named like an option, from a repository's own configuration, reached `git fetch` and `git push` | `chosenRemote` validates the name and every remote command ends its options before it | `tests/git-remote-names.test.ts` |
| Low: a guard refusal could name a metric in a file the person cannot read | the message names the first refused change the person can read, and is generic when there is none; the audit record is unchanged | `tests/auth/guard-messages.test.ts` |
| Low: the audit chain restarted every month, was not anchored and was not checked | the first record of a month continues the chain; the closed month's last hash goes to the mirror; `bun run audit:verify` checks the chain and the anchors | `tests/auth/audit-chain.test.ts`; `tests/auth/audit.test.ts` (changed, see below) |
| Low: delete impact, a read route, named people with unpublished work | `unpublished` is returned only to callers who may delete the project | `tests/auth/delete-impact-access.test.ts` |
| Low: Git authorization read a different place than the command ran in | `pendingScm` answers the person's copy once it exists, and authorization reads it | `tests/auth/git-places.test.ts` |
| Re-review: the scanner indexed index paths spelled differently from the disk | the scanner skips any index path that fails `assertExactCase`, listing each folder once per scan | `tests/scanner-case.test.ts` |
| Re-review: branch names compared case-sensitively | personal-branch checks fold case, and a switch or create is refused for a spelling that differs only in case from an existing branch | `tests/auth/branch-case.test.ts` |
| Re-review: `audit:verify` failed open | it fails without an anchor, checks every mirrored record against the stored months, and takes the oldest kept month from the retention period | `tests/auth/audit-chain.test.ts` |
| Re-review: legacy trash entries left the published checkout dirty | server-mode start restores trashed deletions from HEAD, logs one line, and refuses to start on any other change | `tests/auth/published-checkout.test.ts` |
| Re-review: undo ignored the domain | undo takes the optional `{domain}` like restore | `tests/auth/trash-restore-access.test.ts` |

Existing tests changed because the specified behavior changed:

- `tests/auth/audit.test.ts`, "months start new chains…" (renamed "a new month continues the
  chain…"): the first record of a new month now names the last record of the month before, where it
  used to start from zeros.
- `tests/auth/write-regressions.test.ts`, "deletion records its principal…": local-mode trash
  entries now come back into the restorer's own copy, so the test deletes two different files and
  commits both deletions before the restores, where it used to delete one file twice in the
  published checkout.
- `scripts/two-editors-check.ts`: the branch picker no longer offers another person's
  `work/<handle>` branch, so the check expects no such option; the API still refuses it with 409.

The counts `hiddenFiles`, `hiddenCommits` and `hiddenReferences` stay as deliberate disclosures
(recorded under the read-filtering requirement of the specification).

| Check | Result |
| --- | --- |
| `bun test` | 1,407 passed (1,361 before) |
| `tsc --noEmit`, `fmt:check`, `lint`, `check:comments`, `build` | passed |
| `test:mutation` | 471 of 471 mutants killed after merging the three sets |
| `test:auth`, `test:two-editors` | passed |
| `test:scm`, `test:trash`, `test:projects`, `test:autosave` | passed |

## Release gate (development machine, 2026-10-23)

`bun run ci:validate` on commit 1891220 passed in 1,989 seconds (about 33 minutes) on an idle
machine, followed by `bun run test:auth:keycloak`.

| Step | Result |
| --- | --- |
| verify | `check` (types, formatting, lint, comments), `bun test` 1,548 passed in 217 files, `build` |
| mutation | 474 of 474 targeted mutants killed, every unmodified module baseline passed, plus the three browser mutants |
| browser | all 26 suites passed against a fresh Vite server each, including `test:auth`, `test:two-editors` and `test:admin` serving the built frontend through server mode and the mock provider (Entra endpoint layout, MSAL) |
| timing budgets | `test:graph`: 1,000-entity neighbourhood centred and laid out in 162 ms; `test:editor`: 26.1 ms mean per keystroke without a save and 16.8 ms with an automatic save in flight (budget 30 ms), inline finding 317 ms after the last keystroke (budget 500 ms) |
| image | `image:build`, `image:scan` (no HIGH or CRITICAL finding), `image:sbom` |
| container | every workspace suite again against the built image in local mode, the server-mode group with the mock provider, persistence, the single-replica refusal and the deploy smoke check, all with a read-only root filesystem and no capabilities |
| pipeline | `pipeline:lint` and dry runs for a pull request, `main` and a release tag |
| `test:auth:keycloak` | passed against Keycloak 26.4 (pinned digest) in 29 seconds |

Earlier runs of the same gate stopped twice in browser suites, each time traced to a cause and
fixed rather than rerun: the Remote dialog appended a typed address to the previous one when the
Git status arrived late, and the lineage view hid its cards again after a resize under load. No
timeout, budget or assertion was changed. The commit after this run only silences the gate's
console report inside its own unit tests.

SC-010 (Entra), SC-015, SC-016 and the trial are recorded from the owner's report below.

## Owner trial

The owner records the report of `deploy/trial-runbook.md` here after running it on the target.
