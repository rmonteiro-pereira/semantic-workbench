# Subscription billing: generated end-to-end example

A fictional B2B SaaS subscription-to-cash model with **36 business entity types**, 36 datasets, 46 joins, 119 resolved mapping bindings, and four governed metrics. Supporting value types and implicit Ossie built-ins bring the ontology graph to 45 inspectable concepts and 92 relationships. This is a business model and executable fixture, not an official accounting or revenue-recognition standard.

The model covers account governance, customer segmentation, contracts and amendments, subscriptions, product plans, entitlements, usage, pricing, invoicing, tax, credit notes, payment allocation, refunds, collections, and revenue recognition/journals. Some ancillary tables are deliberately empty in the small query fixture. The eight invoice-line rows exercise the analytic paths and edge cases; they do not simulate a complete production ledger.

## Open it

Click **Load subscription billing** in the sidebar. Alternatively, use **Import definitions** to select these three files together, then open **Mappings**:

- `billing.ontology.yaml`: concepts, relationships, identifiers and ontology-level AI context.
- `billing.semantic.yaml`: physical bindings, scalar fields, directed joins and immutable governed formulas.
- `billing.mapping.yaml`: separate concept/object/referent/link mappings, referencing the other two files by name and filename.

Under **All mapped concepts**, select `net_revenue`, `invoice_count` and `revenue_per_invoice`, group by `plans.tier`, and preview the query. Large binding lists are initially folded; expand **resolved bindings · source evidence** or select one concept to inspect its complete mappings. Exported agent context always contains all bindings.

## Verified numbers

All fixture amounts are USD. `net_amount = quantity × unit_price − discount_amount`; taxes, credits and refunds are excluded by definition. Recurring revenue excludes usage-only lines.

| Plan tier | Net revenue | Distinct invoices | Revenue per invoice |
| --- | ---: | ---: | ---: |
| Growth | 560 | 3 | 186.6666667 |
| Enterprise | 1,350 | 2 | 675 |
| Usage | 100 | 2 | 50 |
| Unmatched subscription item | 80 | 1 | 80 |
| All invoice lines | **2,090** | **6** | **348.3333333** |

Recurring revenue is **1,990**. Product-family net revenue is Platform **1,910**, Usage **100**, unmatched **80**. The missing subscription item deliberately tests LEFT JOIN fact preservation. Distinct invoice counts by plan sum to 8 while the overall count is 6: invoices with multiple plan tiers appear in multiple groups. Summing distinct counts would be wrong.

Grouping revenue by BillingCycle is explicitly blocked: the model has both the invoiced cycle and the subscribed cycle. The planner must not choose the business meaning by path length. Account also has billed/subscribed roles; production modeling should resolve the intended role explicitly.

`fixture.sql` creates an **isolated synthetic SQLite test database**, including all 36 tables. It is not a warehouse migration or a supported definition input, and the application never executes it. `expected.json` summarizes independent expected results.

## Reproduce

```sh
bun run examples:generate
bun run test:examples
# With the dev server running:
bun run test:examples:ui
```

The verification runs 18 generated billing query compositions (single/multiple metrics, multiple groupings, ratios and unmatched dimensions) and two official Flights projections. It asserts actual SQL results, retained governed expressions, exact source round-trips, negative cases, and browser behavior. The report is saved to `docs/example-verification.json`; screenshots are under `/tmp/`.
