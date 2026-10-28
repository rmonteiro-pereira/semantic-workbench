# Agent runtime: grounded metadata and query plans

The agent API resolves saved ontology, mapping and semantic definitions into metadata, metric
explanations and SQL previews. It does not execute a plan, contact a warehouse, call a hosted LLM
or provide an autonomous agent. The calling agent supplies language interpretation and its own
explicitly configured execution tool, if one is needed outside this application.

The Mappings view and agent endpoints use the same resolver/planner. Metric formulas stay in the
semantic definition; they are not copied into an ontology, mapping or agent request.

## Try it in the interface

1. Choose **Add project → Load an example → Mapped commerce**. It loads separate ontology, semantic and mapping
   documents, plus the ODCS contract used by their metrics.
2. In **Mappings**, select Revenue to inspect its binding to `gross_revenue`. Customer and Region
   expose nested referent/link mappings to fields and physical sources, with source evidence.
3. Choose All concepts, open **Compose a query…**, and select `gross_revenue` with
   `customers.region`. Preview the composed query; the stored metric and declared join determine
   it rather than a predefined query or replacement formula.
4. **Export agent context** downloads resolved layers, the original mapping tree, definitions,
   AI context, revisions and evidence. **More actions → Export** still returns source bytes.
5. Inspect missing or ambiguous references in findings. **Edit item** opens the affected form or
   Source line. Save a correction to refresh resolution. Unsaved drafts are not planner inputs;
   the view identifies the saved revisions it is using.

## Agent clients in server mode

Automation uses an Entra application access token in `Authorization: Bearer <token>`.
An Admin grants that client ID projects or domains; token app roles, groups or addresses do not
supply workbench authorization. Local browser workflows do not require this server setup.

### Get a token

The example client uses MSAL and supports an App Registration credential or an Azure managed
identity. A certificate is preferable to a client secret where supported:

```sh
SW_URL=https://workbench.example.org \
AGENT_TENANT_ID=YOUR-TENANT-ID \
AGENT_CLIENT_ID=YOUR-AGENT-APPLICATION-ID \
AGENT_RESOURCE=api://YOUR-WORKBENCH-APPLICATION-ID \
AGENT_CERTIFICATE_KEY="$(cat agent-key.pem)" \
AGENT_CERTIFICATE_THUMBPRINT=YOUR-CERTIFICATE-THUMBPRINT \
bun scripts/examples/agent-client.ts
```

Replace the certificate pair with `AGENT_CLIENT_SECRET`, or use `AGENT_MANAGED_IDENTITY=1` on an
Azure resource. For a user-assigned managed identity, set `AGENT_CLIENT_ID`; omit it for the
system-assigned identity. Obtain credentials from an approved secret source rather than committing
them or copying the placeholder values above.

Client credentials request `api://<workbench application ID>/.default`; managed identity requests
that resource. Keycloak/generic client tokens are not accepted by the workbench's agent path.
See `scripts/examples/agent-client.ts` for the client implementation.

### Set up the workbench

Follow [the Entra App Registration guide](../deploy/README.md#entra-app-registration). Configure:

- The exposed API URI `api://<workbench application ID>`.
- Version 2 access tokens and the optional access-token claim `idtyp`. Missing `idtyp` is refused.
- `SW_API_AUDIENCE` containing the actual expected token audience, commonly the workbench app ID.
  A comma-separated list supports an intentional audience transition; an empty list rejects all
  bearer tokens.
- An agent application in the same configured tenant. An application app role may be configured
  in Entra, but the workbench does not read it as permission.

Browser sign-in uses the server's MSAL flow too, but a client token does not create or attach to a
browser session.

### Grant projects

In **Admin → Projects access**, register the client ID, permitted projects/domains and display
name. Review the dry run and confirm. The versioned `admin/agents.json` document has this shape:

```json
{
  "formatVersion": 1,
  "clients": [
    {
      "clientId": "YOUR-AGENT-APPLICATION-ID",
      "name": "Sales automation",
      "projects": ["sales-contracts"],
      "domains": []
    }
  ]
}
```

A client reads only those granted projects and projects in granted domains. Restricted paths
remain hidden. It never writes. Users & groups, Access check and dry-run results include client
identities so an Admin can inspect changes in their readable scope.

### Call the API

Discover IDs rather than guessing them. The following uses a shell-held token and a mapping ID
returned by the catalog:

```sh
curl "$SW_URL/api/agent/catalog" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

curl --get "$SW_URL/api/agent/context" \
  --data-urlencode "mappingId=$MAPPING_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

URL-encode embedded mapping IDs: their `#ontology_mappings/...` fragment is part of the identifier,
not a browser URL fragment. Field IDs are opaque values from context, not names clients should
construct from physical columns.

After discovering the actual IDs, a mapped-commerce-style plan body is:

```json
{
  "mappingId": "<catalog mapping ID>",
  "concepts": ["Revenue", "Customer"],
  "metrics": ["gross_revenue"],
  "dimensions": ["[\"customers\",\"region\"]"]
}
```

Save the adapted body as `plan-request.json` and request a preview:

```sh
curl "$SW_URL/api/agent/plan" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @plan-request.json
```

Use actual context IDs and authorized project names. An empty or invented request is not a valid
revenue query. A refusal is a modeling/access result to explain, not permission to replace the
stored formula with SQL supplied by the caller.

### What the server validates

Bearer validation checks signature against provider keys, RS256/ES256, issuer, audience, expiry
and not-before with five minutes of skew. Entra clients need `idtyp=app`, no delegated `scp`, the
configured tenant and an `azp` client ID. V1 tokens from `sts.windows.net` are refused. Unknown
signing keys have bounded refresh rather than an unbounded provider lookup per request.

| Outcome | Response |
| --- | --- |
| Invalid token | 401 with a Bearer invalid-token challenge |
| Provider keys cannot be fetched/read | 503; no invalid-token challenge |
| Valid client without an active grant | 403 |
| Unreadable document | 404, like a missing document |
| Bearer token outside `/api/agent/*` | 401, even beside a valid session cookie |
| Valid client on a route without client permission | 403 |

Browser sessions can also use agent endpoints through their normal cookie/CSRF boundary.
A bearer caller does not need Origin or `X-SW-Request`, because those protect automatically sent
browser cookies. A bearer header is evaluated independently of any adjacent cookie.

All client calls are audited as `client:<clientId>`. Refused tokens are anonymous, untrusted input
and are never copied into logs. Context resolution cannot widen the caller's readable project or
path scope.

## Agent tools

Use the local API origin in local mode or the configured HTTPS origin on a shared server.
Endpoints read saved project files. Legacy document IDs can resolve through the migration map;
unsaved editor drafts are not read and remote references/schemas are never fetched.

| Operation | Endpoint |
| --- | --- |
| Discover mappings | `GET /api/agent/catalog` |
| Read context | `GET /api/agent/context?mappingId=ID` |
| Request a plan | `POST /api/agent/plan` |

Catalog returns mapping IDs, names, the project each mapping belongs to, references,
standalone/embedded distinctions and runtime policy. Context includes concepts/constraints,
original mapping trees, resolved bindings, semantic fields/metrics/dependencies, sources, joins,
AI metadata, revisions, evidence and findings.
Repeated `concept` query parameters can limit selected roots/targets; the necessary metric
formulas/fields remain included and full datasets/joins remain available for traversal.

Plan accepts `{mappingId, concepts?, metrics: [metricId], dimensions: [fieldId]}`. It returns a SQL
preview, original expressions, joins, sources, bindings and revision provenance. Keys such as
`expression`, raw SQL, metric objects and formula overrides are rejected. Re-fetch context after
saves; this is not a historical-revision-pinned agent session.

### Binding kinds

A resolved binding's `kind` is object, referent or link. Link scope includes its anchor, linked
object and identifying referents. `metricBindings` carries the workbench mapping extension's
metric/concept relationships and local findings; an unresolved concept remains null with a
warning rather than being guessed. Without the extension, the list is empty.

The graph consumes this same context. Bindings retain source paths and definitions rather than
reducing the mapping to a natural-language description.

### Mapping identity

A standalone mapping requires `version`, `name`, `ontology_ref`, `semantic_model_ref` and
`concept_mappings`. Missing required fields fail schema validation during import:

```yaml
version: 0.2.0.dev0
name: sales-mapping
ontology_ref: {name: Sales, iri: ./sales.ontology.yaml}
semantic_model_ref: {name: sales, iri: ./sales.semantic_model.yaml}
concept_mappings: []
```

`ontology_ref.name` must match the ontology's logical name. `semantic_model_ref.name` must match
the flat model's name or a model inside a legacy model array. A filename is a location, not an
alternative identity. Relative locations are checked against the local catalog; absolute locations
are never fetched. A uniquely named local target may resolve with a location warning. Duplicates
and ambiguous matches are reported, not selected arbitrarily.

## Suggested agent workflow

For “show revenue by customer region”:

1. Discover an authorized mapping and retrieve context.
2. Interpret the request from concepts, relationships, descriptions and declared AI context.
   Treat AI context as source metadata, not an instruction that overrides governance or access.
3. Follow explicit object/referent/link bindings to the semantic fields and governed metrics.
4. Request the existing metric and dimension IDs, without supplying replacement formulas.
5. Explain unresolved references, fan-out or ambiguous business roles rather than inventing a join.
6. Return the preview and provenance. Any warehouse execution is a separate caller-owned action.

## Traversal and query integrity

- Known built-in concepts do not require redundant declarations. Only referenced built-ins are
  materialized in ordinary model views.
- Import/schema validity is separate from workspace resolution: referenced documents can arrive
  later, with unresolved references reported as findings.
- Nested mapping traversal is iterative and depth-bounded. Inherited identifiers are resolved;
  ambiguous inheritance is reported. The original tree remains inspectable.
- Syntax-aware dependency extraction skips comments, literals, functions and keywords. A field
  reference is not inferred from a substring, and governed metric cycles are rejected.
- Standalone metric-name references resolve to stored semantic metrics as a workbench planner
  interpretation; they are not a new field invented in the Ossie mapping standard.
- Directed declared many-to-one joins require unique target keys. Alternative paths of any
  length, reverse joins and unsafe multi-fact combinations are refused. LEFT JOIN preserves
  unmatched facts; declared uniqueness still has to be true in the real external data.
- Conditional population mappings remain evidence. They are not silently converted into global
  query filters or treated as fully implemented population semantics.

## Metric explanation: explains, never executes

The Metrics tab and `GET /api/projects/:slug/files/*path/explain/:metric` use the planner with a
model scope, so a mapping is not required. Explanations include a dependency tree, ODCS inputs,
concept bindings, additivity, missing-value/division behavior, and a SQL preview or refusal.
Declared time grains can produce a `DATE_TRUNC` preview. Ratios are not summed; stock metrics are
not rolled into prohibited time grains; unknown additivity and undeclared grains are refused.

Dependencies, graph edges and explanation inputs use the same syntax-aware scan. Resolution
prefers the mapping's own project and reports every remaining ambiguous candidate. Split Ossie
files and deprecated consolidated `ontology_mappings` layouts are supported.

## Deliberate limits

The deterministic planner supports mapped dimensions, governed ANSI_SQL expressions,
logical-to-physical scalar expressions and declared many-to-one joins. ANSI previews use
PostgreSQL-compatible parsing/serialization, with a SQLite expression fallback for syntax such as
`==`. The caller must validate compatibility with any actual target query engine.

Other stored dialects are preserved, not translated into ANSI_SQL. Subqueries, window expressions,
wildcards, arbitrary filters, ambiguous/multi-fact grains, conditional-population execution and
full n-ary tuple population execution are not implemented. There is no ontology satisfiability
check, OWL reasoner or SHACL instance validator.

## Verification and provenance

Unit/API/browser tests cover reference resolution, nested/inherited mappings, immutable governed
expressions in plans, dependency cycles, keys, joins, source preservation, saved/draft separation
and refusal/repair flows. Synthetic query execution belongs to verification scripts, never the
workbench runtime. Mutations check meaningful omissions in those guarantees.

Ossie schema/fixture provenance is recorded in [schema snapshots](../schemas/README.md) and
[official examples](../public/examples/ossie/README.md). The pinned upstream revision is
`64a1ae44035f5360dcd53401a29bcd900fdce349`; the source files retain their ASF license headers.
