# OpenWiki

Semantic Workbench's versioned knowledge base. These Markdown pages live with the code and can
be read directly on GitHub or in a local checkout; no separate wiki service is required.

## Identity and production operations

| Page | Contents |
| --- | --- |
| [Identity and access](identity-and-access.md) | Entry groups, MSAL/OIDC/OBO, least-privilege Graph access, sessions and managed identities |
| [Identity operations](identity-operations.md) | Configuration, failure recovery, the six reviewed corrections, validation and production acceptance |
| [Logging, telemetry and UI profiling](observability-operations.md) | Enable/disable collection, App Service setup, React profiling builds, viewing signals, costs and acceptance |

The identity documentation describes the implementation introduced in
[`00a4a9e`](https://github.com/rmonteiro-pereira/semantic-workbench/commit/00a4a9ed68b23259e8f095dc684560df7b81be2f).
It is not a live tenant inventory or proof of an Azure deployment. Real-target acceptance,
consent and Conditional Access checks are still required.

## Project guides

| Topic | Guide |
| --- | --- |
| Product and technology overview | [Project README](../../README.md) |
| Editing, metrics, graphs and source control | [User guide](../user-guide.md) |
| Shared server, grants and personal working copies | [Server operation](../server-mode.md) |
| Environment variables and storage | [Configuration](../configuration.md) |
| Module boundaries and implementation map | [Architecture](../../ARCHITECTURE.md) |
| Agent authentication and governed query planning | [Agent runtime](../agent-runtime.md) |
| Azure resources, credentials and pipeline | [Target setup](../../deploy/README.md) |
| Real deployment, recovery and rollback | [Operator runbook](../../deploy/trial-runbook.md) |
| Audit hash chain and verification | [Audit integrity](../audit-tamper-evidence.md) |
| Tests and contribution | [Development](../development.md) |

Keep the variable contract in the configuration reference and the full delivery lifecycle in the
deployment guide/runbook. The observability guide provides a focused App Service monitoring
procedure, not a replacement deployment adapter. Update these wiki pages when the identity model or operational
invariants change. Do not copy tokens, credentials, tenant exports or personal audit data into
documentation.
