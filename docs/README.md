# Documentation

Start with [the project README](../README.md). It explains what Semantic Workbench does, how its
architecture and stack fit together, and how to start a local workspace. The guides below cover
specific tasks without duplicating the same instructions in several places.

## Choose a guide

| I want to… | Read |
| --- | --- |
| Understand the product, architecture and stack | [Project README](../README.md) |
| Edit definitions, inspect metrics or navigate graphs | [User guide](user-guide.md) |
| Use Source Control, sparse folders, export or trash | [User guide](user-guide.md) |
| Run a team server and understand access | [Server operation](server-mode.md) |
| Configure environment variables and storage | [Configuration](configuration.md) |
| Change code, run tests or capture the UI | [Development](development.md) |
| Find module owners and request boundaries | [Architecture map](../ARCHITECTURE.md) |
| Understand graph engines, ports and measurements | [Graph design](graph-design.md) |
| Integrate an agent or request a governed query plan | [Agent runtime](agent-runtime.md) |
| Change colors, logos or deployment identity | [Theme and branding](theme.md) |
| Verify the security audit chain | [Audit integrity](audit-tamper-evidence.md) |
| Prepare an Azure target and delivery pipeline | [Target setup](../deploy/README.md) |
| Accept a real deployment or test rollback | [Operator runbook](../deploy/trial-runbook.md) |
| Understand schema provenance and extensions | [Schema snapshots](../schemas/README.md) |
| Review user-visible release changes | [Changelog](../CHANGELOG.md) |

## Examples and evidence

The shipped examples have their own scope and provenance notes:

- [Commerce](../public/examples/commerce/README.md)
- [OASIS UBL projection](../public/examples/ubl/README.md)
- [Apache Ossie Flights snapshots](../public/examples/ossie/README.md)
- [Subscription billing](../public/examples/billing/README.md)
- [Shopping center administration](../public/examples/mall/README.md)

[Example verification](example-verification.json) records results from disposable synthetic
fixtures. Those executions belong to verification scripts; the application only explains and
previews queries.

Historical specifications and release evidence remain under `specs/`. For the v0.5.1 quality
gate, see [the closure report](../specs/004-ui-polish/remaining-polish.md) and
[the recorded results](../specs/004-ui-polish/remaining-polish-results.json). Historical
counts, design proposals and earlier incomplete states are not current installation instructions.

A local/mock quality gate is not proof of a real Entra tenant or Azure deployment. Use the
operator runbook for consent, provider permissions, infrastructure, approved delivery and recovery.
