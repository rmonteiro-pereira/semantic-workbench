# Shopping center administration: reference ontology and governed metrics

A fictional model for administering shopping centers and other retail real estate. It covers
assets, leasing and mall operations, along with the back office: contract registration, legal
affairs, human resources, payroll, procurement, payables, billing, tax, fixed assets, debt and
treasury.

| Model element | Count |
| --- | ---: |
| Entity types | 145 (142 concrete, 3 abstract) |
| Value types | 20 |
| Metric concepts and governed metrics | 25 |
| Namespaced modules | 11 |
| Datasets / declared joins | 142 / 259 |
| Resolved mapping bindings | 1,057 |

Every concept and relationship has a description and a global identifier (`iri`) expressed as a
QName over the ontology's `prefixes`, so the **Overview** groups the model by module. The
namespaces are under `https://example.org/mall/` and are illustrative.

## Open it

Choose **Examples → Load shopping center administration** in the sidebar. The ontology opens
grouped by namespace. In **Mappings**, select *Shopping center administration mappings*, choose
`occupancy_rate`, group by `calendar_months.year_month` and `properties.name`, and preview the
governed query. The application explains the definitions; it does not run the query.

## Files

| File | Content |
| --- | --- |
| `mall.ontology.yaml` | Apache Ossie ontology: concepts, inheritance, identifiers, typed attributes, links, verbalizations and AI context |
| `mall.semantic.yaml` | Ossie semantic model: one dataset per concrete concept, declared many-to-one joins and governed metrics |
| `mall.mapping.yaml` | Standalone mapping of every concept, attribute and link to its dataset and of every metric concept to its metric |
| `mall.odcs.yaml` | ODCS 3.1.0 data contract for all tables, with foreign keys and business-definition links to the concept IRIs |
| `mall.owl.ttl` | OWL ontology: classes per module, subclass axioms, required-link restrictions, disjointness, functional properties, and `skos:closeMatch` alignment hints to schema.org |
| `mall.shacl.ttl` | SHACL node shapes and named property shapes: datatypes, cardinalities, non-negative amounts and areas, fractions between 0 and 1, date ordering |
| `mall-data.ttl` | The fixture rows as labelled RDF instance data typed by the OWL classes |
| `fixture.sql` | Isolated synthetic SQLite database for the metric checks; not a warehouse migration |
| `expected.json` | Metric values computed from the fixture rows, independently of SQL |

## Modules

**`core:` Shared parties, places, calendar and currencies.** Party *(abstract)*, Organization,
Person, Address, City, StateProvince, Country, Currency, CalendarMonth, PriceIndex, PriceIndexValue.

**`asset:` Properties, buildings, floors and spaces.** Portfolio, Property, Building, Floor, Zone,
Space *(abstract)*, LeasableUnit, UnitType, CommonArea, ParkingFacility, Entrance, AreaMeasurement,
OwnershipStake, Valuation, Permit, Equipment.

**`party:` Tenant, investor and broker roles, brands and tenant mix.** Tenant, Investor, Broker,
Brand, MerchandiseCategory, TenantContact.

**`lease:` Leasing pipeline, leases and clauses.** LeasingProspect, LeasingProposal, LeaseStatus,
Lease, LeasedUnit, RentStep, LeaseClause *(abstract)*, PercentageRentClause, IndexationClause,
ExclusivityClause, RadiusClause, CoTenancyClause, RenewalOption, EarlyTerminationOption,
GuaranteeType, Guarantee, KeyMoneyAgreement, RentConcession, TenantAllowance, FitOutProject,
LeaseTermination.

**`legal:` Contract register, legal entities, governance, litigation and compliance.** LegalEntity,
ContractType, Contract, ContractParty, ContractDocument, ContractAmendment, ContractObligation,
ContractApproval, PowerOfAttorney, GovernanceMeeting, Resolution, LegalProceeding,
LitigationProvision, ComplianceRequirement, ComplianceCheck, DataSubjectRequest.

**`hr:` Organization structure, employees, payroll and talent.** Department, Position, Employee,
EmploymentContract, CompensationChange, PayrollRun, PayrollLine, TimeEntry, LeaveRequest, Benefit,
BenefitEnrollment, TrainingCourse, TrainingRecord, PerformanceReview, JobOpening, JobApplication.

**`proc:` Suppliers, sourcing, purchasing and payables.** Supplier, SupplierQualification,
SupplierEvaluation, SupplierAgreement, PurchaseRequisition, RequestForQuotation, SupplierQuote,
PurchaseOrder, PurchaseOrderLine, GoodsReceipt, SupplierInvoice, SupplierPayment.

**`ops:` Service charges, maintenance, utilities and marketing.** ExpenseCategory,
ServiceChargeBudget, ServiceChargeBudgetLine, AllocationKey, AllocationShare, ServiceContract,
OperatingExpense, WorkOrder, UtilityType, UtilityMeter, MeterReading, InsurancePolicy, Incident,
MarketingFund, MarketingCampaign, MallEvent.

**`fin:` Billing, collections, ledger, budgets, tax, assets, debt and treasury.** ChargeType,
Invoice, Charge, BankAccount, Payment, PaymentAllocation, ArrearsCase, CollectionAction,
PaymentAgreement, LedgerAccount, JournalEntry, JournalLine, OwnerDistribution, CapitalProject,
CostCenter, OperatingBudget, BudgetLine, TaxType, TaxObligation, TaxWithholding, FixedAsset,
DepreciationEntry, LoanAgreement, DebtServicePayment, BankTransaction, InsuranceClaim.

**`perf:` Occupancy, tenant sales, footfall and parking facts.** OccupancySnapshot, SalesReport,
SalesAudit, FootfallCount, ParkingActivity.

**`kpi:` Governed performance indicators.** One value type per governed metric, mapped to the
metric by name.

## Modeling decisions

- **Parties and roles.** Organization and Person specialize the abstract Party. Tenant, Investor,
  Broker, Supplier, Employee and LegalEntity are roles that refer to an organization or person.
  One company can be a supplier, a contract counterparty and a litigant without duplicate records.
- **One contract register.** Every lease, service contract, supply framework, employment contract
  and loan points to a `Contract` entry holding its number, type, term, value, contracting legal
  entity and currency. Parties, documents, amendments, obligations and approvals attach to the
  register. Legal can monitor all contracts while each business area keeps its specific terms.
- **Legal entities.** Properties are held by special-purpose companies and staff are employed by
  the administrator. Contracts, books, payroll, tax, budgets, payables and loans are kept per
  legal entity.
- **Cost centers.** Journal lines, payroll lines, budgets and departments carry cost centers.
  A property cost center attributes results to its property.
- **Area-based occupancy.** Occupancy is occupied over total gross leasable area (GLA, Portuguese
  ABL) from month-end unit snapshots, not a count of stores. Area metrics are stocks: group or
  filter by month.
- **Rent structure.** Minimum rent, percentage (overage) rent, the December thirteenth rent,
  service charges and the marketing fund are separate charge types. Percentage rent is billed
  only when rate × gross sales exceeds the minimum rent. Key money and right-of-use fees
  (*luvas*, *res sperata*) are agreements, not rent.
- **Clauses as subtypes.** Percentage rent, indexation, exclusivity, radius, co-tenancy, renewal
  and early termination specialize an abstract lease clause. Each carries only its own terms.
- **Procure to pay.** Requisition, request for quotation, quotes, purchase order and lines, goods
  receipt, supplier invoice (electronic fiscal document), tax withholdings and payment are separate
  steps. This allows the model to express three-way matching and approval controls.
- **Payroll.** Pay components are lines flagged as employer cost or employee deduction. Payroll
  cost excludes amounts withheld from employees.
- **Litigation and compliance.** Proceedings carry loss-probability assessments and provisions.
  Compliance checks verify recurring requirements per property; data-subject requests track
  data-protection deadlines.
- **Explicit roles in queries.** A charge reaches a tenant through its lease (contracted tenant)
  and through its invoice (billed tenant). Grouping charges by tenant is refused until the role
  is chosen. Links were directed so that each verified metric has exactly one route to its
  dimensions: a leasing proposal points to the lease it results in, and contract responsibility
  is recorded on obligations and approvals rather than on the contract.

## Verified metrics

These are synthetic verification results, not values calculated by the application. The workbench
explains definitions and previews SQL without executing it. Separate test code runs the queries
against disposable fixture data and compares the results with independently computed values.

All fixture amounts are BRL. The planner composes queries from governed metrics and declared joins;
the verification results match `expected.json`.

| Month | Property | Occupancy rate | Visitors | Net operating income |
| --- | --- | ---: | ---: | ---: |
| 2026-08 | Aurora Shopping | 92.1% | 530,000 | R$ 141,800 |
| 2026-08 | Brisa Outlet | 54.5% | 95,000 | R$ 12,000 |
| 2026-09 | Aurora Shopping | 92.1% | 586,000 | R$ 149,300 |
| 2026-09 | Brisa Outlet | 100.0% | 118,000 | R$ 32,000 |

| Month | Department | Payroll cost |
| --- | --- | ---: |
| 2026-08 | Property operations | R$ 37,200 |
| 2026-08 | Finance | R$ 9,000 |
| 2026-09 | Property operations | R$ 38,100 |
| 2026-09 | Finance | R$ 9,000 |
| 2026-09 | Leasing | R$ 16,800 |

Other fixture results:

- **Billed by charge type, both months:** minimum rent R$ 276,300, percentage rent R$ 12,300,
  service charge R$ 166,020 and marketing fund R$ 27,630.
- **Delinquency:** 0.0% in August and 8.7% in September (R$ 22,420 open).
- **Occupancy cost ratio:** Aurora Shopping 8.1%, Brisa Outlet 10.0%.
- **Net operating income margin:** Aurora Shopping 82.4%, Brisa Outlet 70.4%.
- **Headcount:** 3 in August and 4 in September.
- **Purchase spend by category:** cleaning R$ 25,000, security R$ 25,200, maintenance R$ 3,000.
- **Payables outstanding:** R$ 22,428 for September, none for August.

Two requests are refused by design: grouping charges by tenant (two tenant roles) and combining
metrics of different grains, such as occupancy and tenant sales, in one query.

## Reproduce

Every metric carries Semantic Workbench attributes in its `custom_extensions`: label, type,
additivity, unit, owner, status, time dimension `calendar_months.first_day`, breakdowns and targets.
The `mall.mapping.yaml` file binds each metric to the concept it measures and the entity it is
about. The ODCS contract declares selected quality rules and service levels. Open the **Metrics**
tab to see how each metric is calculated and where its data comes from.

Run from the project root. The first command rewrites the generated shopping center example files:

```sh
bun scripts/mall-example.ts      # regenerate all files
bun test tests/mall.test.ts      # validate files and execute every metric query
bun run test:examples:ui         # with the dev server running
```
