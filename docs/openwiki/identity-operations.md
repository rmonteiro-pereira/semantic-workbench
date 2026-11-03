# Identity operations

[OpenWiki](README.md) | [Identity and access](identity-and-access.md)

## Configuration and ownership

Use the [configuration reference](../configuration.md) for all settings and
[Entra target setup](../../deploy/README.md#entra-app-registration) for registration steps.
The following are distinct ownership checks, not commands run automatically by the workbench.

| Owner | Required decision |
| --- | --- |
| Tenant administrator | Single tenant, Enterprise Application assignment, entry group, admin consent and Conditional Access |
| Application owner | Web redirect/logout URIs, exposed `access_as_user` scope, v2 tokens and one valid client credential |
| Workbench administrator | Optional internal group/e-mail grants, scopes, restricted paths and bootstrap recovery identities |
| Platform/SRE | HTTPS ingress, trusted proxy configuration, persistent storage, session-key custody, workload identity and monitoring |

Set `SW_OIDC_PROVIDER=entra` with the matching tenant, v2 issuer, client ID and public origin
(see the [configuration reference](../configuration.md)). Register `/auth/callback`, `/auth/signed-out` and `/auth/front-channel-logout`.
Retain the default API scope if overriding `SW_OIDC_SCOPES`; otherwise the token needed for
OBO may be missing or unsuitable.

Use GUID object IDs for Entra internal grants/restricted paths. Labels may differ between
grants and have no authorization meaning. Review and save access changes through the Admin
dry run and last-Admin guard rather than editing live policy files behind the application.

Persist `DATA_DIR`, session state and the session key; encrypted files alone are not a recovery
plan if the key is lost. Follow the documented single-instance ownership/storage model rather
than assuming per-process refresh coalescing or file locks provide distributed coordination.
See [server operation](../server-mode.md) for the complete lifecycle.

## Failure and recovery behavior

| Situation | Implemented result | Operator response |
| --- | --- | --- |
| Entra refresh returns temporary OAuth error, HTTP 429 or 5xx | 503; existing session is preserved | Check provider health/throttling; retry after recovery instead of clearing everyone's sessions |
| Definitively refused/invalid refresh or changed identity | Session ends | Require sign-in and investigate credential, consent or identity-policy changes |
| Graph/OBO fails or the total membership deadline expires | No group-derived grants from that lookup; degradation is audited | Check scope, API-token audience, consent, Graph health and group references |
| Degradation audit fails after successful token refresh | New credentials and safe principal remain persisted; session-backed requests fail closed | Restore audit storage; valid renewed tokens allow audit-only retry, including after process restart |
| Malformed Entra group ID | Startup or administration validation rejects activation | Correct the grant/restricted-path object ID; do not broaden Graph permissions |
| Role deletion removes group grants | Group-name cache is invalidated with the committed policy | Reload Admin; a deleted grant must not leave a cached local label |
| A local label differs from Entra's group name | No permission change | Treat it as operator-entered metadata, not directory verification |

Pending audit recovery is durable. While the renewed credentials remain valid, the next request
retries the audit rather than repeating provider refresh/OBO with stale material. If they have
expired, the pending audit must complete before another refresh. Session updates never recreate
a session that logout, expiry or administration already removed.

The five-second membership budget covers token acquisition and all batches together, not five
seconds per batch. Directory lookup failure does not silently fall back to stale token groups.
Independent grants may still authorize a person when the degradation audit succeeds.

Consent/MFA/Conditional Access failures during OBO also remove group-derived access. There is
no automatic interactive claims-challenge recovery in this flow. Resolve the tenant policy
and reauthenticate/refresh; do not interpret a successful OIDC callback as proof that Graph OBO
or Azure DevOps OBO is ready.

Group removal is not immediate revocation. For urgent application-access removal, use the
Workbench's deactivation/session-termination controls as well as the approved Entra process.
Removing a grant or entry-group member alone must not be described as instant sign-out.

## Invariants

| Behaviour | Invariant protected |
| --- | --- |
| Transient MSAL errors are classified separately from definitive refusal | A provider outage does not destroy valid sessions |
| Entra group GUIDs are validated before a policy is activated | One malformed ID cannot poison every project's membership batch |
| Refreshed credentials and the safe principal are persisted before audit side effects | Rotated credentials are not lost when audit storage fails |
| One cancellable deadline covers the whole membership lookup | More configured groups cannot multiply request latency by the batch count |
| Each grant shows its own label, or an explicit absence | Another grant for the same object cannot supply the wrong label |
| Role changes, grant changes and rollback invalidate the label cache | A cascaded grant removal does not retain a stale name |

Mocked issuer and Graph responses cannot establish live tenant consent, network reachability or
policy compatibility; the acceptance gates below do.

## Production acceptance

Use the [operator runbook](../../deploy/trial-runbook.md) to record results. Do not check an
item merely because configuration exists.

| Gate | Required evidence before production |
| --- | --- |
| Entry | An ordinary directly assigned member can enter; an unassigned user cannot; unintended direct assignments and Global Administrator exceptions are reviewed |
| Nested groups | Nested-only entry membership is not relied on; nested internal role membership is tested separately through Graph |
| Consent and OBO | Real Workbench sign-in obtains its API token, real OBO obtains delegated `User.Read`, and `/me/checkMemberGroups` returns the expected configured IDs |
| Internal permissions | Group and verified e-mail grants, scopes, restricted paths, No access and bootstrap recovery behave as intended |
| Group visibility | Real group types and hidden-membership rules do not produce unexplained omissions |
| Least privilege | Old Graph application grants are reviewed for removal after checking other consumers; no broad permissions are added as a shortcut |
| Credentials and workload identity | Exactly one app credential works; expiry/rotation is owned; registry/Key Vault roles and any federated assertion identify the intended principal |
| Policy | Required consent, MFA and Conditional Access scenarios are exercised; the absence of automatic interactive OBO recovery is accepted |
| Optional integrations | Agent token issuance/assignment and explicit agent grants, plus Azure DevOps OBO, are accepted separately when enabled |
| Revocation | Group-removal delay is measured; deactivation, session termination and front-channel logout are exercised |
| Availability | Entra/Graph outages, throttling, audit write failure, restart and return to service preserve the documented fail-closed behavior |
| Persistence | Durable storage and session-key recovery are tested; a normal restart does not lose sessions; ownership/replica constraints are respected |
| Delivery | Approved build, deployment smoke tests and rollback succeed using the actual target adapter |

The shipped delivery guide targets Container Apps. App Service requires its own validated
deployment/rollback adapter; do not assume a Container Apps trial proves an App Service target.

Record request IDs, status codes, the expected decision and sanitized timestamps for incident
correlation. Never attach raw tokens, cookies, serialized MSAL caches, secret-bearing CLI output
or personal audit records to tickets or the wiki.
