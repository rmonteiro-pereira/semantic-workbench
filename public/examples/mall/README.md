# Shopping center administration: reference ontology and governed KPIs

A fictional, end-to-end model for administering shopping centers and other retail real estate. It covers the asset and its space, tenants and brands, the leasing pipeline, leases and their clauses, service charges and operations, billing and collections, accounting and investor distributions, and the monthly performance facts used to run a mall.

| | |
| --- | ---: |
| Entity types | 92 (89 concrete, 3 abstract) |
| Value types | 20 |
| KPI concepts and governed metrics | 21 |
| Namespaced modules | 8 |
| Datasets / declared joins | 89 / 143 |
| Resolved mapping bindings | 669 |

Every concept and relationship has a description and a global identifier (`iri`) expressed as a QName over the ontology's `prefixes`, so the **Overview** groups the model by module. The namespaces are under `https://example.org/mall/` and are illustrative.

## Files

| File | Content |
| --- | --- |
| `mall.ontology.yaml` | Apache Ossie ontology: concepts, inheritance, identifiers, typed attributes, links, verbalizations and AI context |
| `mall.semantic.yaml` | Ossie semantic model: one dataset per concrete concept, declared many-to-one joins and governed metrics |
| `mall.mapping.yaml` | Standalone mapping of every concept, attribute and link to its dataset and of every KPI concept to its metric |
| `mall.odcs.yaml` | ODCS 3.1.0 data contract for all tables, with business-definition links to the concept IRIs |
| `mall.owl.ttl` | OWL ontology: classes per module, subclass axioms, required-link restrictions, disjointness, functional properties, and `skos:closeMatch` alignment hints to schema.org |
| `mall.shacl.ttl` | SHACL shapes: datatypes, cardinalities, non-negative amounts and areas, fractions between 0 and 1, date ordering |
| `mall-data.ttl` | The fixture rows as RDF instance data typed by the OWL classes |
| `fixture.sql` | Isolated synthetic SQLite database for the KPI checks; not a warehouse migration |
| `expected.json` | KPI values computed from the fixture rows, independently of SQL |

## Modules

**`core:` Shared parties, places, calendar and currencies.** Party *(abstract)*, Organization, Person, Address, City, StateProvince, Country, Currency, CalendarMonth, PriceIndex, PriceIndexValue.

**`asset:` Properties, buildings, floors and spaces.** Portfolio, Property, Building, Floor, Zone, Space *(abstract)*, LeasableUnit, UnitType, CommonArea, ParkingFacility, Entrance, AreaMeasurement, OwnershipStake, Valuation, Permit, Equipment.

**`party:` Tenants, brands, investors and providers.** Tenant, Investor, ServiceProvider, Broker, Brand, MerchandiseCategory, TenantContact.

**`lease:` Leasing pipeline, leases and clauses.** LeasingProspect, LeasingProposal, LeaseStatus, Lease, LeasedUnit, LeaseAmendment, RentStep, LeaseClause *(abstract)*, PercentageRentClause, IndexationClause, ExclusivityClause, RadiusClause, CoTenancyClause, RenewalOption, EarlyTerminationOption, GuaranteeType, Guarantee, KeyMoneyAgreement, RentConcession, TenantAllowance, FitOutProject, LeaseTermination.

**`ops:` Service charges, maintenance, utilities and marketing.** ExpenseCategory, ServiceChargeBudget, ServiceChargeBudgetLine, AllocationKey, AllocationShare, ServiceContract, OperatingExpense, WorkOrder, UtilityType, UtilityMeter, MeterReading, InsurancePolicy, Incident, MarketingFund, MarketingCampaign, MallEvent.

**`fin:` Billing, collections, ledger and capital projects.** ChargeType, Invoice, Charge, BankAccount, Payment, PaymentAllocation, ArrearsCase, CollectionAction, PaymentAgreement, LegalProceeding, LedgerAccount, JournalEntry, JournalLine, OwnerDistribution, CapitalProject.

**`perf:` Occupancy, tenant sales, footfall and parking facts.** OccupancySnapshot, SalesReport, SalesAudit, FootfallCount, ParkingActivity.

**`kpi:` Governed performance indicators.** One value type per governed metric, mapped to the metric by name.

## Modelling decisions

- **Area-based occupancy.** Occupancy is occupied over total gross leasable area (GLA, Portuguese ABL) from month-end unit snapshots, not a count of stores. Area metrics are stocks: group or filter by month.
- **Rent structure.** Minimum rent, percentage (overage) rent, the December thirteenth rent, service charges and the marketing fund are separate charge types. Percentage rent is billed only when rate × gross sales exceeds the minimum rent. Key money and right-of-use fees (*luvas*, *res sperata*) are agreements, not rent.
- **Clauses as subtypes.** Percentage rent, indexation, exclusivity, radius, co-tenancy, renewal and early termination specialise an abstract lease clause, so each carries only its own terms.
- **Parties as subtypes.** Tenants, investors, service providers and brokers specialise Organization, which with Person specialises the abstract Party.
- **Multi-unit leases.** `LeasedUnit` relates leases and units over time, so one lease can cover several units and a unit is leased successively.
- **Fractional ownership.** `OwnershipStake` records undivided shares held by investors; distributions are paid per stake.
- **Explicit roles.** A charge reaches a tenant through its lease (contracted tenant) and through its invoice (billed tenant). Grouping charges by tenant is refused until the role is chosen. A leasing proposal points to the lease it results in, so occupancy does not gain a second route to the property through the offered unit.
- **Tenant mix.** The lease's permitted use is the merchandise category of record; categories form a hierarchy.

## Verified KPIs

All fixture amounts are BRL. The planner composes each query from governed metrics and declared joins; the results equal `expected.json`.

| Month | Property | Occupancy rate | Visitors | Net operating income |
| --- | --- | ---: | ---: | ---: |
| 2026-08 | Aurora Shopping | 92.1% | 530,000 | R$ 141,800 |
| 2026-08 | Brisa Outlet | 54.5% | 95,000 | R$ 12,000 |
| 2026-09 | Aurora Shopping | 92.1% | 586,000 | R$ 149,300 |
| 2026-09 | Brisa Outlet | 100.0% | 118,000 | R$ 32,000 |

Billed by charge type over both months: Minimum rent R$ 276,300, Percentage rent R$ 12,300, Service charge R$ 166,020, Marketing fund R$ 27,630. The delinquency rate is 0.0% in August and 8.7% in September (R$ 22,420 open). Occupancy cost ratio: Aurora Shopping 8.1%, Brisa Outlet 10.0%. NOI margin: Aurora Shopping 82.4%, Brisa Outlet 70.4%.

Two requests are refused by design: grouping charges by tenant (two tenant roles) and combining metrics of different grains, such as occupancy and tenant sales, in one query.

## Open it

Click **Load shopping center administration** in the sidebar. The ontology opens grouped by namespace. In **Mappings**, select *Shopping center administration mappings*, choose `occupancy_rate`, group by `calendar_months.year_month` and `properties.name`, and preview the governed query.

## Reproduce

```sh
bun scripts/mall-example.ts      # regenerate all files
bun test tests/mall.test.ts      # validate files and execute every KPI query
bun run test:examples:ui         # with the dev server running
```
