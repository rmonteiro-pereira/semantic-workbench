# Owner trial

Run on the owner's target subscription and Azure DevOps project, never by the implementer.
Identifiers below are placeholders. Set `<release-tag>` to the delivered tag, for example
`v0.4.0`. Use fixture data only. Record an observed output or error
for every step, and turn each failure into a follow-up task. This trial does not gate local
implementation completion. Commands assume the release checkout and the setup guide's variables.

1. **Set up the target.** Follow every portal action and CLI help entry in
   [Target setup](README.md). Check all resources, identities, roles, probes, mount ownership,
   federation, pipeline permissions and environment checks. Check the
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
   mapping is recorded); the package declares version core `0.4.0`. Result: [ ] pass [ ] fail.
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
   storage and responses hold no token. People signed in before this release are signed out once,
   at their first token refresh (audit reason `session-upgraded`), and sign in again. Sign out in
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
   person. Features from later phases that are unavailable must
   be recorded as failures/follow-ups, not marked passed. Result: [ ] pass [ ] fail.
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
   `SW_OIDC_CLIENT_CERTIFICATE_KEY` when the certificate is used, are Key Vault references and
   record the final deploy roles and exact resource scopes. Result: [ ] pass [ ] fail.

Copy this report into `specs/003-authn-authz/verification.md` under **Owner trial**, replacing
subscription, tenant, registry and resource identifiers with placeholders:

```text
Trial date: <date>  Release: <release-tag>  Commit: <40 hex>
Hand-over: push | bundle | archive
Target: <subscription> / <tenant> / <registry> / <resource-group> / <app>
Pipelines: <delivery-pipeline> / <rollback-pipeline>  Environment: <environment>
Step 1: pass | fail — <observed output or error>
Step 2: pass | fail — <observed output or error>
Step 3: pass | fail — <observed output or error>
Step 4: pass | fail — <observed output or error>
Step 5: pass | fail — <observed output or error>
Step 6: pass | fail — <observed output or error>
Step 7: pass | fail — <observed output or error>
Step 8: pass | fail — <observed output or error>
Step 9: pass | fail — <observed output or error>
Digest deployed: sha256:<digest>  Revisions: <before> -> <after>
SC-015 approval->smoke: <minutes>  rollback: <minutes>
SC-017 interruption: <seconds>  old-instance shutdown: <seconds>
SC-016 credential review: <result>
Deploy role set: <roles and scopes; explain any join or identity operator grant>
Open issues: <one line each; each becomes a follow-up task>
```
