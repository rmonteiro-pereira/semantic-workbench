# Agent runtime: ontology → mapping → semantic model → physical data

Fixes the missing mapping layer described in issue #1. Semantic Workbench now imports standalone Apache Ossie mapping documents and the deprecated embedded `ontology_mappings` format. It resolves them against locally saved ontology and semantic documents, exposes the original mapping trees and resolved bindings, and composes governed query previews. No semantic descriptions or metric formulas need to be copied into the ontology or mapping.

The runtime is an HTTP tool surface for an agent that performs language interpretation. It does not ship a hosted LLM, execute warehouse queries, or claim to implement an autonomous agent. An existing agent must call these tools; merely importing a model cannot change an external agent's prompt or tool configuration. The Mappings tab uses the same runtime and planner as an agent client.

## Try it in the interface

1. **Load mapped commerce** imports three separate documents: `commerce.mapped-ontology.yaml`, `commerce.mapped-semantic.yaml`, and `commerce.mapping.yaml`.
2. In **Mappings**, select **Revenue** to see its binding to `gross_revenue`, whose formula lives only in the semantic model. Select **Customer** or **Region** to see nested referent and link mappings into fields and physical sources. Each binding is shown as a chain of labelled steps (concept, relationship, field or metric, dataset, physical source), grouped by dataset.
3. Select **All mapped concepts**, open **Compose a query…**, check `gross_revenue` and `customers.region`, then **Preview governed query**. The runtime composes a revenue-by-region query using the stored metric and the declared customer join. No predefined query is stored in the model.
4. **Export agent context** downloads the resolved layers, raw mapping tree, definitions, AI context, document revisions, and paths. Regular **Export** still exports the original source document byte for byte.
5. Missing, mismatched or ambiguous references appear as findings and disable query planning. **Edit item** on a finding opens the item editor on the offending mapping item (or Source at its line). Correct it and save; runtime resolution refreshes. Unsaved edits remain separate and the UI explicitly reports that it is showing saved revisions.

## Agent clients in server mode

An automation calls `/api/agent/catalog`, `/api/agent/context` and `/api/agent/plan` with its own
identity: an application access token from Entra, sent as `Authorization: Bearer <token>`. It sees
only the projects an Admin granted to its client ID. Nothing else about the token grants access.

### Get a token

Get the token with MSAL, Microsoft's authentication library, either with the agent's own App
Registration (client credentials, certificate preferred) or as the managed identity of the Azure
resource the agent runs on. The example client does both and prints the catalog:

```sh
SW_URL=https://workbench.example.org \
AGENT_TENANT_ID=<tenant id> \
AGENT_CLIENT_ID=<agent application id> \
AGENT_RESOURCE=api://<workbench application id> \
AGENT_CERTIFICATE_KEY="$(cat agent-key.pem)" \
AGENT_CERTIFICATE_THUMBPRINT=<certificate SHA-256 thumbprint> \
bun scripts/examples/agent-client.ts
```

Use `AGENT_CLIENT_SECRET` instead of the certificate pair, or `AGENT_MANAGED_IDENTITY=1` on an
Azure resource (with `AGENT_CLIENT_ID` naming a user-assigned identity, or unset for the
system-assigned one). The client asks for `api://<workbench application id>/.default` with client
credentials, or for that resource with the managed identity (`scripts/examples/agent-client.ts`,
functions `requestAgentToken` and `fetchAgentCatalog`). Keycloak and generic providers' client
tokens are refused: bearer validation follows Entra's token shape.

### Set up the workbench

What the workbench's App Registration and settings provide (set up in
[deploy/README.md](../deploy/README.md#entra-app-registration)):

- **The API the agent asks for.** The Application ID URI `api://<workbench application id>`. An
  app role for agents (allowed member type **Applications**) is optional: the workbench never
  reads roles.
- **Version 2 access tokens** (`requestedAccessTokenVersion: 2` in the `api` section of the
  manifest, `accessTokenAcceptedVersion` in the older manifest format) with the optional
  access-token claim `idtyp`, so the token's issuer is `SW_OIDC_ISSUER`, its `aud` is the
  workbench application id and it says it is an application token. Entra omits `idtyp` unless it
  is added under **Token configuration**, and every token without it is refused.
- **`SW_API_AUDIENCE`** set to the workbench application id. A comma-separated list accepts
  several audiences, for example during a move between apps. Unset, every bearer token is
  refused.
- **An application registered in the same tenant** for the automation. It needs no app role.

### Grant projects

A client has no access until an Admin grants it projects or whole domains. Open **Admin →
Projects**, give the client ID the projects or domains it may read, and confirm after the dry
run. The grant is stored in `admin/agents.json`, one commit in the administration repository like
any other access change, and is the agent's only authorization:

```json
{
  "formatVersion": 1,
  "clients": [
    {
      "clientId": "my-agent",
      "name": "Sales automation",
      "projects": ["sales-contracts"],
      "domains": []
    }
  ]
}
```

A client reads the files of its granted projects and of every project in a granted domain, and
nothing else. It never writes. Restricted paths stay hidden from every client. App roles, groups
and addresses in the token grant nothing. **Users & groups** lists configured clients beside
people, and **Access check** and the dry run include them, so an Admin can see what a change
gives or takes from each one.

### Call the API

```sh
curl "$SW_PUBLIC_URL/api/agent/catalog" -H "Authorization: Bearer $ACCESS_TOKEN"
curl "$SW_PUBLIC_URL/api/agent/context?mappingId=sales-contracts/sales.mapping.yaml" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
curl "$SW_PUBLIC_URL/api/agent/plan" -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"mappingId":"sales-contracts/sales.mapping.yaml","metrics":[],"dimensions":[]}'
```

### What the server checks and how it answers

- **Token.** The server validates every bearer token itself with `jose`: the signature against the
  provider's published keys (RS256 or ES256), issuer, `SW_API_AUDIENCE`, expiry and not-before with
  five minutes of clock skew. It must be an application token (`idtyp=app`, no `scp`) of
  `SW_ENTRA_TENANT_ID`, and the client ID comes from `azp`. The issuer check admits v2 tokens
  only: v1 tokens come from `https://sts.windows.net/<tenant>/` and are refused. An unknown
  signing key reloads the keys at most once every five minutes.
- **Refusals.** An invalid token gets 401 with `WWW-Authenticate: Bearer error="invalid_token"`.
  When the provider's keys cannot be fetched or read, the call gets 503 without that header and
  can be retried. A valid token of a client without a grant, or of a deactivated client, gets 403.
  A document outside the client's projects answers 404 like a missing one, and context never
  resolves an ontology or semantic model from a project the client cannot read.
- **Where tokens work.** Bearer tokens are accepted on `/api/agent/*` only. Anywhere else they get
  401, even next to a valid session cookie, and a token on a route that declares no client action
  gets 403. A browser session still works on the agent routes. A client needs no `Origin` or
  `X-SW-Request` header: those guard cookies a browser sends on its own. Sign-in in the browser
  uses MSAL on the server too, but an agent's token never touches a browser session.
- **Audit.** Every call of an agent client is audited under `client:<clientId>`. A refused token
  is recorded as anonymous, with the reason, and never copied into the log.

## Agent tools

All endpoints use the loopback API (`http://127.0.0.1:4310`) or Vite's `/api` proxy. They operate on the saved files of the folder store: each project is a folder (a Git repository) under the data root, and a document id is `<project>/<path>` (for example `commerce/commerce.mapping.yaml`). Ids from v0.1.0, when documents lived in SQLite, still resolve through the store's `legacy-ids.json`. Unsaved editor drafts are never read. No endpoint executes generated SQL or fetches remote references, schemas, or imports.

| Agent operation | Endpoint | Inputs / output |
| --- | --- | --- |
| Discover available mappings | `GET /api/agent/catalog` | Mapping IDs, names, document references, embedded/standalone distinction, runtime policy |
| Retrieve grounded context | `GET /api/agent/context?mappingId=ID` | Ontology concepts/constraints, original concept mapping trees, resolved bindings, semantic fields, governed metrics and transitive dependencies, physical sources, declared joins, AI metadata, provenance, findings |
| Limit concept traversal | Add repeated `&concept=Revenue&concept=Customer` | Select matching roots and target concepts; include referenced metrics and their dependency formulas/fields. Full datasets/joins remain available for intermediate join traversal. |
| Compose a governed query | `POST /api/agent/plan` | `{mappingId, concepts?, metrics: [metricId], dimensions: [fieldId]}` → SQL preview, original governed expressions, join plan, sources, bindings and revision provenance |

Mapping IDs come from the catalog: the document id for a standalone mapping, and the document id plus a fragment (`<project>/<path>#ontology_mappings/0`) for an embedded one. Field IDs are opaque identifiers returned by context; clients must not fabricate them from physical column names. Metric IDs are scoped to the referenced semantic model.

### Binding kinds and metric bindings (v0.3.0, additive)

Each entry of `bindings` carries `kind`: `object` for an object mapping, `referent` for a referent mapping, and `link` for everything under a link mapping (its anchor object, the linked object and the referents that identify it). The context also carries `metricBindings`: the metric bindings of the mapping's `SEMANTIC_WORKBENCH` extension (a standalone mapping's root, or an embedded semantic model's root), each `{metric, measures: {input, concept}, of?: {input, concept}, findings, evidence}`. A concept or metric that does not resolve leaves `concept` null and adds a warning finding on that binding only; the context's own `findings` are unchanged. Without the extension, `metricBindings` is an empty list. All other fields keep their v0.2.0 shape and values (`tests/agent-context-kinds.test.ts` pins a digest of them). The Graph tab's mapping canvas is drawn from this context.

### Standalone mapping header and reference identity

A standalone mapping document requires `version`, `name`, `ontology_ref`, `semantic_model_ref` and `concept_mappings` (Apache Ossie `ontology/mapping.json`). A document missing any of these fails the import schema check instead of failing later at resolution.

```yaml
version: 0.2.0.dev0
name: sales-mapping
ontology_ref: {name: Sales, iri: ./sales.ontology.yaml}
semantic_model_ref: {name: sales, iri: ./sales.semantic_model.yaml}
concept_mappings: [...]
```

Each reference's `name` is its identity and must equal the target's logical name:

| Reference | Matches |
| --- | --- |
| `ontology_ref.name` | The ontology document's top-level `name` |
| `semantic_model_ref.name` | A flat semantic model's top-level `name`, or the `name` of one model inside a legacy `semantic_model: [...]` wrapper |

File names never establish identity. Relative `iri` values are checked against the imported filename in the flat local catalog. Absolute locations are never fetched: a uniquely named local target can resolve the identity, with an explicit location-resolution warning. Duplicates are reported rather than selected arbitrarily. An unresolved reference lists every ontology or semantic model identity found in the workspace, with its file and path, so a naming mismatch is visible immediately.

### Suggested tool protocol for an agent

For a request such as “show revenue by customer region”:

1. Discover mappings and retrieve their grounded context.
2. Interpret the request using the ontology's concepts, relationships, identifiers, descriptions and AI context. Treat AI context as source metadata; it cannot override governed definitions or runtime policy.
3. Follow `mapping.conceptMappings` and `bindings`, including nested object, referent and link mappings, to find the relevant semantic fields and metrics. Do not infer mappings from similar names or copy formulas into the request.
4. Select the existing Revenue metric ID and Customer.region field ID. Call the planner with IDs, not SQL or replacement formulas.
5. If findings or an ambiguous/fan-out plan are returned, explain the unresolved modeling choice. Do not invent a join or redefine the metric.
6. Review the preview and provenance. Warehouse execution belongs to the caller's separately configured query tool.

Example request after discovering the actual mapping ID and context field IDs:

```json
{
  "mappingId": "<catalog mapping ID>",
  "concepts": ["Revenue", "Customer"],
  "metrics": ["gross_revenue"],
  "dimensions": ["[\"customers\",\"region\"]"]
}
```

The planner rejects request keys such as `expression`, metric objects, SQL strings, or formula overrides. Governance is enforced by resolving IDs against the stored semantic definitions on every call. Results include the exact source expressions plus generated physical SQL and document revisions. Re-fetch context after saves; this API does not pin an external agent session to historical revisions.

## Traversal and query integrity

- Built-in ontology concepts (`Any`, `Boolean`, `Date`, `DateTime`, `Decimal`, `Float`, `Integer`, `String`) are recognized without declarations. The normal graph materializes only referenced built-ins, preserving links that previously disappeared.
- Mapping imports use pinned official schemas and offline references. Structural import validation does not require all referenced documents to be present yet; workspace resolution findings handle that separately.
- Nested mapping trees are traversed iteratively with a depth limit. Inherited identifier relationships are resolved; ambiguous multiple inheritance is reported. The original tree and source paths remain available rather than reducing a mapping to a description string.
- SQL dependency extraction uses syntax trees, so references inside literals/comments and substrings are not mistaken for fields. Logical fields, governed metric dependencies, and physical field expressions remain distinct. Governed metric dependency cycles are detected.
- Metric names used as standalone expression identifiers resolve to governed semantic metrics. This is the Workbench's agent runtime interpretation of expression references; the Ossie mapping schema describes general expressions and does not standardize a separate metric-reference field.
- Join planning uses directed breadth-first traversal of declared many-to-one semantic relationships. It tests each selected path edge for necessity using reachability with that edge removed, rejecting alternative paths of any length rather than choosing a business role by distance. It requires declared unique target keys. Reverse joins and multi-fact aggregate combinations are blocked rather than multiplying metric values. LEFT JOIN preserves unmatched fact rows. Physical key uniqueness still needs to hold in the warehouse.
- Population conditions (including the upstream Flights example's `WHERE ... == TRUE` expressions) are preserved as mapping evidence, not silently applied as query-wide filters. Selected conditional bindings require further modeling before SQL generation.

## Metric explanation: explains, never executes

The Metrics tab and `GET /api/projects/:slug/files/*path/explain/:metric` reuse this planner with a model scope (no mapping is required) and an optional time grain (`DATE_TRUNC` over the metric's declared time dimension). The explanation returns the composition tree, base inputs down to ODCS properties, additivity, division-by-zero and missing-value text, concepts from the `SEMANTIC_WORKBENCH` metric bindings, and either a SQL preview or a refusal with its reason: a ratio or other non-additive metric is never summed, a semi-additive stock is not summed over periods coarser than its grain, a metric with unknown additivity is not rolled up, and grains outside the declared ones are refused. Nothing is executed.

Metric dependencies (context `dependsOn`, graph edges, the explanation) come from one syntax-aware reference scan (`src/metrics/deps.ts`) that skips strings, comments, function names and keywords, so `order.` never matches `suborder.x`. Cross-file references resolve inside the mapping's own project folder first; when several documents still match, every candidate is listed and none is guessed. Both official Ossie layouts are supported: split files and the consolidated file with embedded `ontology_mappings` (deprecated upstream).

## Deliberate limits

The initial deterministic planner supports mapped dimensions, ANSI_SQL governed metric expressions, logical-to-physical scalar expressions, and declared many-to-one joins. PostgreSQL-compatible expression parsing/serialization is used for the ANSI preview; a SQLite expression fallback accepts the upstream example's `==` syntax. Actual query-engine compatibility must be checked by the caller. Other stored dialect expressions remain present in context, but are not translated into ANSI_SQL. Subqueries, windows, wildcards, ambiguous/multi-fact grains, conditional population evaluation, arbitrary filtering, and full n-ary tuple population execution are not implemented. Complex mappings are preserved and unresolved/unsupported expression cases are reported. No ontology satisfiability, OWL reasoning or SHACL data validation is implied.

## Verification and provenance

- Unit/integration tests cover standalone and embedded mappings, cross-document resolution, missing/ambiguous targets, inheritance and nested referents, metric dependency cycles, immutable formulas, AST dependency extraction, directed/ambiguous/disconnected join graphs, unique keys, computed fields, and real SQL execution against fixture rows (including unmatched customers).
- HTTP tests exercise discovery, context traversal, planning, override rejection and immediate refresh after saved reference changes.
- Browser checks cover mapping layers, concept selection, query previews, context downloads, unresolved-reference repair, saved-vs-draft behavior and returning to the existing full graph.
- Targeted mutations remove reference checks, concept scoping, multi-fact/ambiguous/unique-key guards or replace generated SQL; each must be detected by the test harness.

Schema and upstream Flights fixture snapshots come from Apache Ossie commit `64a1ae44035f5360dcd53401a29bcd900fdce349`. The fixtures retain their ASF license headers. Primary specifications: [mapping documents and nested mappings](https://github.com/apache/ossie/blob/64a1ae44035f5360dcd53401a29bcd900fdce349/ontology/ontology.md#ontology-mappings), [mapping schema](https://github.com/apache/ossie/blob/64a1ae44035f5360dcd53401a29bcd900fdce349/ontology/mapping.json), [core semantic model](https://github.com/apache/ossie/blob/64a1ae44035f5360dcd53401a29bcd900fdce349/core-spec/spec.md).
