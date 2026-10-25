# Target acceptance and rollback checks

An authorized target operator runs this checklist on the intended subscription and Azure DevOps
project. The local quality gate uses mocks and does not perform this trial. Begin with fixture
data and record pass/fail plus failed check names for every step.

Replace `<release-tag>` with the approved tag of a versioned target release commit. Its core must
match `package.json`; existing unversioned source tags do not satisfy the delivery guard. Follow
[release hand-over](README.md#release-hand-over) without moving a published tag.

Treat a shared report as public even when the current repository is private. Never paste raw
output containing tokens and cookie values, including `Set-Cookie` headers. Exclude output from
`scripts/examples/agent-client.ts`, audit entries with e-mail addresses or object IDs, and the
names of approvers. Replace target identifiers with the report template's placeholders. Use the
approved setup variables from [target setup](README.md); do not copy production secrets into
commands or the report. Real-target acceptance is separate from local implementation validation.

1. **Set up the target.** Follow every portal action and CLI help entry in
   [Target setup](README.md). Check all resources, identities, roles, probes, mount ownership,
   federation, pipeline permissions and environment checks. Check branch control on all three
   service connections (`sw-azure-deploy`: `refs/tags/v*`; `sw-azure-push`: `refs/heads/main` and
   `refs/tags/v*`, with Verify branch protection; `sw-azure-pull`: `refs/tags/v*`). Only the release
   operator should have Create tag permission on `refs/tags/v*`. Check the
   [Entra App Registration](README.md#entra-app-registration) item by item: both Web redirect
   URIs, the front-channel logout URL `https://<host>/auth/front-channel-logout`, groups claim
   and optional claims (`email`, `upn`, `xms_edov`, `sid`, `login_hint` on ID tokens, `idtyp`
   on access tokens), API permissions with admin consent
   (`GroupMember.Read.All` only for the Graph lookups), the exposed `api://<client-id>` with
   `access_as_user`, access token version 2, and the credential (certificate preferred). Record
   which credential was used. Expected: all items present, every value mapped to its setting as
   in the guide's table, and the variable group contains no secrets. Result: [ ] pass [ ] fail.
2. **Hand over `<release-tag>`.** Follow the guide's push or verified bundle sequence: release
   branch, pull request into `main`, then tag. For archive fallback record the commit mapping.
   Inspect the mirror's tag and commit. Expected: the release commit matches (or the archive
   mapping is recorded) and is on the mirror's `main`; the package declares the version core
   of the approved release tag. On a clone of the mirror,
   `git merge-base --is-ancestor <release commit> origin/main` succeeds; for a test commit that
   is not on `main` it fails, and a tag on that commit fails the `check` job before any image
   is pushed. Result: [ ] pass [ ] fail.
3. **Preview both pipelines.** Run the local commands below, then request owner-only Azure
   DevOps Runs API previews with `previewRun: true` for each imported pipeline. Expected:
   Validate, Image, Deploy for the tag; manual Rollback on the tag; environment and connections
   match the target; no external identity provider in tests. `--execute` exercises fake deploy,
   failed smoke and both rollback paths before the local gate. Result: [ ] pass [ ] fail.

   ```sh
   bun run pipeline:lint
   bun run pipeline:dry-run -- --run "tag:<release-tag>" --execute
   bun run pipeline:dry-run -- --pipeline rollback --run "tag:<release-tag>" --execute
   bun run deploy:azure -- --fake --help
   bun run deploy:rollback -- --help
   bun run deploy:smoke -- --help
   ```

4. **Run `main`.** Queue the main pipeline on `main`. Inspect its Image artifacts and the
   registry's Repositories page. Expected: Validate and Image pass, Deploy skipped,
   `sha-<commit>` exists, SPDX bill of materials and JSON/SARIF scan reports are published.
   Local plan: `bun run pipeline:dry-run -- --run main`. Result: [ ] pass [ ] fail.
5. **Run the tag and approve.** Queue the main pipeline on `refs/tags/<release-tag>`. Confirm
   version check completes before the environment approval. Approve and time until smoke passes.
   Expected: rescan passes; version tag and commit tag have the same digest; app updates by
   digest; recorded before/after revisions appear in the JSON summary; every smoke check passes;
   approval to smoke takes at most 15 minutes. Result: [ ] pass [ ] fail.
6. **Exercise real Entra.** Complete every item of
   [quickstart §5](../specs/003-authn-authz/quickstart.md#5-microsoft-entra-id-on-the-real-tenant-manual-checklist-run-by-the-owner-recorded-in-verificationmd).
   The redirect goes to `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize` and
   carries `x-client-SKU=msal.js.node` (MSAL signs in on the server); the browser's cookies,
   storage and responses hold no token. Legacy Entra sessions without an MSAL token cache end at
   refresh with reason `session-upgraded`; current compatible sessions are not expected to end
   merely because the application was upgraded. Record migration and ordinary restart behavior
   separately. Sign out in
   the workbench: Entra does not ask which account. Run `scripts/examples/agent-client.ts` once
   with a granted agent registration (see
   [agent runtime](../docs/agent-runtime.md#agent-clients-in-server-mode)). Check
   provider-initiated sign-out against the real tenant: sign in to the workbench, open another
   application of the tenant (for example `https://myapps.microsoft.com`) in the same browser
   and sign out there; the workbench's next request must return to the Entra sign-in, and the
   audit log must show `signOut` and `sessionEnded` with reason `provider-signed-out` for that
   person. If the session survives, check that the App Registration's front-channel logout URL
   is `https://<host>/auth/front-channel-logout` and that the ID token carries `sid`.
   Expected: direct redirect, bootstrap access, group display name, mixed-case email grant,
   custom role and scoped access, No access for ungranted and unverified guest users, overage
   lookup and failure behavior, group removal after refresh, stable Signed out page, the
   session ended by the sign-out in another application, and an Editor push attributed to that
   person. Any required feature that fails must be recorded as a failure/follow-up, not marked
   passed because local mocks or another release succeeded. Result: [ ] pass [ ] fail.
7. **Restart and hand over.** In Container Apps → Revisions restart the running revision while
   a fixture user has a session and saved edits. Produce the next approved revision: choose
   the next prerelease or patch tag, bump `package.json` to its version, review the change,
   and repeat the release branch/PR/tag hand-over. Deploy that approved tag through the
   pipeline and measure interruption. Expected: session and data survive restart;
   during handover application requests return 503 with Retry-After; interruption is at most
   old-instance shutdown plus 30 seconds; smoke accepts only serving. Result: [ ] pass [ ] fail.
8. **Rollback drill.** Queue the rollback pipeline on the currently deployed version tag,
   `target=previous`, approve and time until serving. Expected: the newest promoted version below
   the active version is deployed by digest, smoke passes within 15 minutes.
   Also queue `target=tag` on a retained older version tag to check digest resolution. An
   owner-controlled smoke-failure drill must show automatic copy and a failed deployment result
   even if recovery passes. Immediately run `target=previous` after automatic restore and
   verify it selects a promoted version below the restored version, never the failed digest
   or the active digest. If none exists, it must refuse. Verify the failed release has no
   version tag. Never inject failure into production. Result: [ ] pass [ ] fail.
9. **Credential and role review.** Inspect repository, pipeline YAML, variable group, logs and
   service connection authentication. Expected: no stored Azure, registry or provider credential;
   service connection sign-ins use federation. Verify app secrets, including
   `SW_OIDC_CLIENT_CERTIFICATE_KEY` when the certificate is used, are Key Vault references. Check
   that the deploy connection holds the custom role of
   [`container-app-deployer-role.json`](container-app-deployer-role.json) on the container app
   (`containerApps/read`, `write`, `revisions/*`,
   `locations/containerappOperationStatuses/read` and `containerappOperationResults/read`) and not
   Contributor, so it cannot call
   `listSecrets` or request an exec token. Run `az provider operation show --namespace
   Microsoft.App` to confirm the action names, then an update and the restore path
   (`az containerapp revision copy`) with the role; if a CLI version needs `listSecrets`, record
   it. A registry in the ABAC repository-permissions mode needs the metadata data actions
   instead of the registry role's actions; that it holds the
   role of [`registry-tag-lock-role.json`](registry-tag-lock-role.json) and that the promoted
   `vX.Y.Z` and `sha-<commit>` tags are read-only afterwards; that the pull connection holds
   `AcrPull` only; and that the container app's ingress is external, HTTPS only, with no CORS
   policy. Record the final deploy roles and exact resource scopes, and any action the trial
   proved necessary beyond the custom roles. Result: [ ] pass [ ] fail.

10. **Branch control without branch protection.** On `sw-azure-deploy` and `sw-azure-pull`
    (allowed ref `refs/tags/v*`, Verify branch protection off) check that a tag run uses them
    and a pull-request or branch run is refused. On `sw-azure-push` (Verify branch protection
    on) check that a `main` run and a tag run use it and a pull-request run is refused. If
    Verify branch protection blocks the tag runs of `sw-azure-push`, turn it off there and
    record it. Result: [ ] pass [ ] fail.

11. **Logging and telemetry (only when the connection string is set).** Confirm in the container
    app that `APPLICATIONINSIGHTS_CONNECTION_STRING` (and `SW_TELEMETRY_ACTOR_SALT`, if used) are
    Key Vault references, then open `/healthz` and check that `telemetry.enabled` is true.
    Run `bun run deploy:smoke -- <url> <version> <commit> --expect-telemetry` and check the
    `telemetry configured` line. In Log Analytics, check that `ContainerAppConsoleLogs` holds JSON
    lines with an `http.request` event, and that the `requestId` of one line equals the
    `X-Request-Id` header of the same request. After a few minutes, in Application Insights
    check that requests, dependencies (Git commands) and custom metrics (`sw.http.server.requests`)
    arrive under the cloud role `semantic-workbench`, that a trace and its log lines share one
    operation id, and that no document text, file name, project name, token or e-mail address
    appears in any of them. Throw an error in the browser console of a signed-in page and check
    that its `browser.error` log/report arrives. Browser reports are not standalone browser spans;
    a sampled HTTP trace is separate evidence. Remove the secret reference, create a revision and
    check that `telemetry.enabled` is false and nothing arrives. Result: [ ] pass [ ] fail.

Copy this report into `specs/003-authn-authz/verification.md` under **Owner trial**, replacing
subscription, tenant, registry and resource identifiers with placeholders:

```text
Trial date: <date>  Release: <release-tag>  Commit: <40 hex>
Hand-over: push | bundle | archive
Target: <subscription> / <tenant> / <registry> / <resource-group> / <app>
Pipelines: <delivery-pipeline> / <rollback-pipeline>  Environment: <environment>
Step 1: pass | fail — <names of the failed checks, no raw output>
Step 2: pass | fail — <names of the failed checks, no raw output>
Step 3: pass | fail — <names of the failed checks, no raw output>
Step 4: pass | fail — <names of the failed checks, no raw output>
Step 5: pass | fail — <names of the failed checks, no raw output>
Step 6: pass | fail — <names of the failed checks, no raw output>
Step 7: pass | fail — <names of the failed checks, no raw output>
Step 8: pass | fail — <names of the failed checks, no raw output>
Step 9: pass | fail — <names of the failed checks, no raw output>
Step 10: pass | fail — <names of the failed checks, no raw output>
Step 11: pass | fail | skipped — <names of the failed checks, no raw output>
Digest deployed: sha256:<digest>  Revisions: <before> -> <after>
SC-015 approval->smoke: <minutes>  rollback: <minutes>
SC-017 interruption: <seconds>  old-instance shutdown: <seconds>
SC-016 credential review: <result>
Deploy role set: <roles and scopes; explain any join or identity operator grant>
Open issues: <one line each; each becomes a follow-up task>
```
