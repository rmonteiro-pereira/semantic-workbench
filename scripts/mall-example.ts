// Generates shopping center models and synthetic fixtures from shared business definitions.
import { mkdir } from 'node:fs/promises';
import { stringify } from 'yaml';
import { inspect } from '../src/model';
import { buildContext } from '../server/agent/runtime';
// Fictional shopping-center and real-estate administration model. One domain specification
// produces the Ossie ontology, OWL, SHACL, RDF data, ODCS contract, semantic model, mapping and an
// isolated SQLite fixture with expected KPIs.
const base = 'https://example.org/mall/';
const modules = {
  core: 'Shared parties, places, calendar and currencies',
  asset: 'Properties, buildings, floors and spaces',
  party: 'Tenant, investor and broker roles, brands and tenant mix',
  lease: 'Leasing pipeline, leases and clauses',
  legal: 'Contract register, legal entities, governance, litigation and compliance',
  hr: 'Organization structure, employees, payroll and talent',
  proc: 'Suppliers, sourcing, purchasing and payables',
  ops: 'Service charges, maintenance, utilities and marketing',
  fin: 'Billing, collections, ledger, budgets, tax, assets, debt and treasury',
  perf: 'Occupancy, tenant sales, footfall and parking facts',
  kpi: 'Governed performance indicators',
} as const;
type Module = keyof typeof modules;
const prefixes = Object.fromEntries(Object.keys(modules).map(m => [m, `${base}${m}#`]));
// Attributes use "field|ValueType|flags|description".
// Links use "relationship>Target|flags|verb phrase|description".
// Flags mean required (!), nonnegative (+), or a fraction between zero and one (%).
type Def = {
  concept: string;
  module: Module;
  table?: string;
  description: string;
  extends?: string[];
  attrs?: string[];
  links?: string[];
};
const valueTypes: [string, string, string][] = [
  ['Identifier', 'Integer', 'Surrogate key of a business record.'],
  ['Name', 'String', 'Human-readable name.'],
  ['Code', 'String', 'Business code or controlled-vocabulary value.'],
  ['Text', 'String', 'Free text.'],
  [
    'TaxId',
    'String',
    'Tax registration number, such as a Brazilian CNPJ for companies or CPF for individuals.',
  ],
  ['EmailAddress', 'String', 'Email address.'],
  ['PhoneNumber', 'String', 'Telephone number in international format.'],
  ['CalendarDate', 'Date', 'Calendar date.'],
  ['YearMonth', 'String', 'Calendar month in YYYY-MM form.'],
  ['Year', 'Integer', 'Calendar or fiscal year.'],
  ['Count', 'Integer', 'Whole-number count.'],
  ['LevelNumber', 'Integer', 'Floor level; negative values are below ground.'],
  ['Flag', 'Boolean', 'True or false indicator.'],
  ['AreaM2', 'Decimal', 'Area in square metres.'],
  ['LengthM', 'Decimal', 'Length in metres.'],
  ['DistanceKm', 'Decimal', 'Distance in kilometres.'],
  ['Quantity', 'Decimal', 'Measured quantity in the unit of the related meter or clause.'],
  ['MoneyAmount', 'Decimal', 'Monetary amount in the currency of the property or lease.'],
  ['Rate', 'Decimal', 'Fraction where 1 means 100 percent.'],
  ['IndexNumber', 'Decimal', 'Published price-index level.'],
];
const defs: Def[] = [
  // Core.
  {
    concept: 'Party',
    module: 'core',
    description:
      'Abstract legal or natural person. The roles a party plays (tenant, investor, broker, supplier, employee, legal entity, contract counterparty) are separate concepts that refer to the party, so one company can be a supplier and a counterparty at the same time.',
    attrs: [
      'name|Name|!|Name used in day-to-day administration.',
      'legal_name|Name||Registered legal name.',
      'tax_id|TaxId||Tax registration number.',
      'email|EmailAddress||Main email address.',
      'phone|PhoneNumber||Main phone number.',
    ],
    links: ['address>Address||is located at|Registered or correspondence address.'],
  },
  {
    concept: 'Organization',
    module: 'core',
    table: 'organizations',
    extends: ['Party'],
    description:
      'Legal entity such as a company, fund, bank, insurer, public authority, court, law firm or condominium association.',
    attrs: [
      'organization_type|Code||Kind of organization, for example company, fund, bank, insurer, authority, court or law firm.',
      'legal_form|Code||Legal form, for example limited company, corporation, investment fund or association.',
    ],
    links: ['parent_organization>Organization||belongs to group|Economic group or parent company.'],
  },
  {
    concept: 'Person',
    module: 'core',
    table: 'people',
    extends: ['Party'],
    description:
      'Natural person: employee, tenant contact, attorney, candidate, guarantor or individual investor. Personal data is subject to data-protection law.',
    attrs: ['birth_date|CalendarDate||Date of birth.', 'nationality|Code||Nationality.'],
  },
  {
    concept: 'Address',
    module: 'core',
    table: 'addresses',
    description: 'Postal address of a property or party.',
    attrs: [
      'street|Text|!|Street name.',
      'street_number|Code||Street number.',
      'complement|Text||Additional address detail.',
      'district|Name||District or neighbourhood.',
      'postal_code|Code||Postal code.',
    ],
    links: ['city>City|!|is in|City of the address.'],
  },
  {
    concept: 'City',
    module: 'core',
    table: 'cities',
    description: 'Municipality.',
    attrs: ['name|Name|!|City name.'],
    links: ['state>StateProvince|!|is in|State or province of the city.'],
  },
  {
    concept: 'StateProvince',
    module: 'core',
    table: 'state_provinces',
    description: 'State, province or other first-level administrative region.',
    attrs: ['name|Name|!|State name.', 'code|Code||Abbreviation.'],
    links: ['country>Country|!|is in|Country of the region.'],
  },
  {
    concept: 'Country',
    module: 'core',
    table: 'countries',
    description: 'Country.',
    attrs: ['name|Name|!|Country name.', 'iso_code|Code|!|ISO 3166-1 alpha-2 code.'],
  },
  {
    concept: 'Currency',
    module: 'core',
    table: 'currencies',
    description: 'Currency in which leases, invoices and accounts are denominated.',
    attrs: ['name|Name|!|Currency name.', 'iso_code|Code|!|ISO 4217 code.'],
  },
  {
    concept: 'CalendarMonth',
    module: 'core',
    table: 'calendar_months',
    description:
      'Reporting and billing period. Charges, sales reports, occupancy snapshots and ledger entries are stated per month.',
    attrs: [
      'year_month|YearMonth|!|Month in YYYY-MM form.',
      'year|Year|!|Calendar year.',
      'month_number|Count|!|Month of the year, 1 to 12.',
      'quarter|Code||Calendar quarter, for example 2026-Q3.',
      'first_day|CalendarDate|!|First day of the month; the time dimension of monthly KPIs.',
    ],
  },
  {
    concept: 'PriceIndex',
    module: 'core',
    table: 'price_indices',
    description:
      'Inflation index used to adjust rents, such as IGP-M or IPCA in Brazil or a consumer price index elsewhere.',
    attrs: [
      'name|Name|!|Index name.',
      'code|Code|!|Index code.',
      'publisher|Name||Publishing institution.',
    ],
  },
  {
    concept: 'PriceIndexValue',
    module: 'core',
    table: 'price_index_values',
    description: 'Published level and monthly change of a price index.',
    attrs: [
      'index_level|IndexNumber|!+|Index level for the month.',
      'monthly_change|Rate||Change against the previous month as a fraction.',
    ],
    links: [
      'price_index>PriceIndex|!|is a value of|Index being published.',
      'month>CalendarMonth|!|is published for|Reference month.',
    ],
  },
  // Asset.
  {
    concept: 'Portfolio',
    module: 'asset',
    table: 'portfolios',
    description: 'Group of properties managed under one strategy or fund.',
    attrs: ['name|Name|!|Portfolio name.', 'strategy|Text||Investment or management strategy.'],
    links: [
      'asset_manager>Organization||is managed by|Asset manager responsible for the portfolio.',
    ],
  },
  {
    concept: 'Property',
    module: 'asset',
    table: 'properties',
    description:
      'Shopping center or other managed real-estate asset. Gross leasable area (GLA, in Portuguese ABL) is the area available for lease to tenants.',
    attrs: [
      'code|Code|!|Property code.',
      'name|Name|!|Property name.',
      'property_format|Code||Format, for example regional, super-regional, community, outlet, lifestyle or power center.',
      'opening_date|CalendarDate||Date the property opened to the public.',
      'total_gla_m2|AreaM2|!+|Gross leasable area.',
      'gross_built_area_m2|AreaM2|+|Total built area.',
      'parking_spaces|Count|+|Number of parking spaces.',
    ],
    links: [
      'portfolio>Portfolio|!|belongs to|Portfolio of the property.',
      'address>Address|!|is located at|Address of the property.',
      'currency>Currency|!|is administered in|Currency of leases and accounts.',
      'administrator>Organization||is administered by|Company contracted to administer the property.',
      'general_manager>Person||is run by|General manager of the property.',
    ],
  },
  {
    concept: 'Building',
    module: 'asset',
    table: 'buildings',
    description:
      'Structure within a property, such as the mall, an office tower or a parking building.',
    attrs: [
      'code|Code|!|Building code.',
      'name|Name||Building name.',
      'built_year|Year||Year of completion.',
    ],
    links: ['property>Property|!|is part of|Property containing the building.'],
  },
  {
    concept: 'Floor',
    module: 'asset',
    table: 'floors',
    description: 'Floor or level of a building.',
    attrs: [
      'code|Code|!|Floor code, for example L1.',
      'name|Name||Floor name.',
      'level_number|LevelNumber||Level number; negative below ground.',
    ],
    links: ['building>Building|!|is in|Building of the floor.'],
  },
  {
    concept: 'Zone',
    module: 'asset',
    table: 'zones',
    description:
      'Wing, corridor or sector of a floor used to locate units and plan the tenant mix.',
    attrs: ['code|Code|!|Zone code.', 'name|Name||Zone name.'],
    links: ['floor>Floor|!|is on|Floor of the zone.'],
  },
  {
    concept: 'Space',
    module: 'asset',
    description:
      'Abstract measured area of a property: leasable units, common areas or parking facilities.',
    attrs: [
      'code|Code|!|Space code, for example a store number.',
      'name|Name||Space name.',
      'area_m2|AreaM2|!+|Measured area.',
    ],
  },
  {
    concept: 'LeasableUnit',
    module: 'asset',
    table: 'units',
    extends: ['Space'],
    description:
      'Store, kiosk or other unit that counts towards gross leasable area and can be leased to a tenant.',
    attrs: [
      'frontage_m|LengthM|+|Shop-front length.',
      'has_mezzanine|Flag||Whether the unit has a mezzanine.',
    ],
    links: [
      'zone>Zone|!|is located in|Zone of the unit.',
      'unit_type>UnitType|!|is classified as|Unit type.',
    ],
  },
  {
    concept: 'UnitType',
    module: 'asset',
    table: 'unit_types',
    description:
      'Classification of units: anchor, mega-store, inline store, kiosk, food court, restaurant, entertainment, services, office or storage.',
    attrs: [
      'code|Code|!|Unit type code.',
      'name|Name|!|Unit type name.',
      'counts_as_gla|Flag|!|Whether units of this type count towards gross leasable area.',
    ],
  },
  {
    concept: 'CommonArea',
    module: 'asset',
    table: 'common_areas',
    extends: ['Space'],
    description:
      'Shared area operated by the property: corridors, food-court seating, restrooms, loading docks and technical areas. Its costs are recovered through service charges.',
    attrs: ['area_kind|Code||Kind of common area.'],
    links: ['floor>Floor|!|is on|Floor of the common area.'],
  },
  {
    concept: 'ParkingFacility',
    module: 'asset',
    table: 'parking_facilities',
    extends: ['Space'],
    description: 'Parking area of a property.',
    attrs: [
      'capacity|Count|!+|Number of parking spaces.',
      'is_paid|Flag||Whether visitors pay for parking.',
    ],
    links: ['property>Property|!|serves|Property served by the facility.'],
  },
  {
    concept: 'Entrance',
    module: 'asset',
    table: 'entrances',
    description: 'Visitor entrance where footfall is counted.',
    attrs: [
      'code|Code|!|Entrance code.',
      'name|Name||Entrance name.',
      'entrance_kind|Code||Pedestrian, parking, public transport or service.',
    ],
    links: ['property>Property|!|gives access to|Property of the entrance.'],
  },
  {
    concept: 'AreaMeasurement',
    module: 'asset',
    table: 'area_measurements',
    description: 'Certified measurement of a unit area under a stated method.',
    attrs: [
      'measurement_date|CalendarDate|!|Measurement date.',
      'measured_area_m2|AreaM2|!+|Measured area.',
      'method|Code||Measurement standard.',
    ],
    links: [
      'unit>LeasableUnit|!|measures|Unit measured.',
      'surveyor>Organization||is certified by|Surveyor.',
    ],
  },
  {
    concept: 'OwnershipStake',
    module: 'asset',
    table: 'ownership_stakes',
    description:
      'Fractional ownership of a property by an investor. Shopping centers are often held in undivided shares by several investors.',
    attrs: [
      'share|Rate|!%|Ownership fraction.',
      'start_date|CalendarDate|!|Start of ownership.',
      'end_date|CalendarDate||End of ownership.',
    ],
    links: [
      'investor>Investor|!|is held by|Owner of the stake.',
      'property>Property|!|is a share of|Property owned.',
    ],
  },
  {
    concept: 'Valuation',
    module: 'asset',
    table: 'valuations',
    description: 'Appraisal of the market value of a property.',
    attrs: [
      'valuation_date|CalendarDate|!|Valuation date.',
      'market_value|MoneyAmount|!+|Appraised market value.',
      'capitalization_rate|Rate|%|Capitalization rate applied.',
      'discount_rate|Rate|%|Discount rate applied.',
    ],
    links: [
      'property>Property|!|values|Property valued.',
      'appraiser>Organization||is prepared by|Appraiser.',
    ],
  },
  {
    concept: 'Permit',
    module: 'asset',
    table: 'permits',
    description:
      'Licence or certificate required to operate the property, such as an occupancy certificate, fire safety certificate or operating licence.',
    attrs: [
      'permit_number|Code|!|Permit number.',
      'permit_type|Code|!|Permit type.',
      'issue_date|CalendarDate||Issue date.',
      'expiry_date|CalendarDate||Expiry date.',
    ],
    links: [
      'property>Property|!|authorises|Property covered.',
      'issuer>Organization||is issued by|Issuing authority.',
    ],
  },
  {
    concept: 'Equipment',
    module: 'asset',
    table: 'equipment',
    description:
      'Maintained building equipment such as escalators, elevators, chillers, generators and fire pumps.',
    attrs: [
      'tag|Code|!|Asset tag.',
      'name|Name|!|Equipment name.',
      'equipment_type|Code|!|Equipment type.',
      'install_date|CalendarDate||Installation date.',
      'manufacturer|Name||Manufacturer.',
    ],
    links: [
      'property>Property|!|is installed at|Property of the equipment.',
      'fixed_asset>FixedAsset||is capitalised as|Fixed-asset record.',
    ],
  },
  // Party.
  {
    concept: 'Tenant',
    module: 'party',
    table: 'tenants',
    description:
      'Role of an organization that leases space in a property: retailer, restaurant or service operator.',
    attrs: [
      'trade_name|Name|!|Trading name used at the store.',
      'since_date|CalendarDate||First lease start in the portfolio.',
    ],
    links: ['organization>Organization|!|is a role of|Organization acting as tenant.'],
  },
  {
    concept: 'Investor',
    module: 'party',
    table: 'investors',
    description:
      'Role of an organization or person that owns ownership stakes, such as a pension fund, real-estate fund, developer or individual.',
    attrs: ['investor_type|Code||Pension fund, real-estate fund, developer or private investor.'],
    links: [
      'organization>Organization||is a role of|Investing organization.',
      'person>Person||is a role of|Individual investor.',
    ],
  },
  {
    concept: 'Broker',
    module: 'party',
    table: 'brokers',
    description: 'Role of a leasing broker or agency that introduces tenants.',
    attrs: [
      'license_number|Code||Broker licence number.',
      'commission_rate|Rate|%|Standard commission as a fraction of the first-year rent.',
    ],
    links: ['organization>Organization|!|is a role of|Brokerage organization.'],
  },
  {
    concept: 'Brand',
    module: 'party',
    table: 'brands',
    description: 'Commercial brand operated in a store. One tenant can operate several brands.',
    attrs: ['name|Name|!|Brand name.'],
    links: ['owner>Tenant||is owned by|Tenant owning the brand.'],
  },
  {
    concept: 'MerchandiseCategory',
    module: 'party',
    table: 'merchandise_categories',
    description:
      'Tenant-mix category, such as apparel, footwear, food court, services or entertainment. Categories form a hierarchy.',
    attrs: ['code|Code|!|Category code.', 'name|Name|!|Category name.'],
    links: ['parent_category>MerchandiseCategory||is a subcategory of|Broader category.'],
  },
  {
    concept: 'TenantContact',
    module: 'party',
    table: 'tenant_contacts',
    description:
      'Person a tenant designates for a responsibility, such as store manager, finance or legal.',
    attrs: ['role|Code|!|Responsibility.', 'is_primary|Flag||Whether this is the primary contact.'],
    links: [
      'person>Person|!|is filled by|Contact person.',
      'tenant>Tenant|!|is a contact of|Tenant represented.',
    ],
  },
  // Lease.
  {
    concept: 'LeasingProspect',
    module: 'lease',
    table: 'leasing_prospects',
    description: 'Potential tenant in the leasing pipeline.',
    attrs: ['name|Name|!|Prospect name.', 'first_contact_date|CalendarDate||First contact.'],
    links: [
      'brand>Brand||intends to operate|Brand proposed.',
      'category>MerchandiseCategory||is classified as|Intended category.',
      'broker>Broker||is introduced by|Introducing broker.',
    ],
  },
  {
    concept: 'LeasingProposal',
    module: 'lease',
    table: 'leasing_proposals',
    description: 'Commercial offer or letter of intent for a unit.',
    attrs: [
      'proposal_number|Code|!|Proposal number.',
      'proposal_date|CalendarDate|!|Proposal date.',
      'proposed_minimum_rent|MoneyAmount|+|Monthly minimum rent offered.',
      'proposed_term_months|Count|+|Lease term offered.',
      'status|Code||Draft, sent, accepted, rejected or withdrawn.',
    ],
    links: [
      'prospect>LeasingProspect|!|is made to|Prospect.',
      'unit>LeasableUnit|!|offers|Unit offered.',
      'resulting_lease>Lease||results in|Lease signed after the proposal was accepted.',
    ],
  },
  {
    concept: 'LeaseStatus',
    module: 'lease',
    table: 'lease_statuses',
    description:
      'Lifecycle state of a lease: pending signature, fit-out, active, holdover, in renewal proceedings, terminated or expired.',
    attrs: ['code|Code|!|Status code.', 'name|Name|!|Status name.'],
  },
  {
    concept: 'Lease',
    module: 'lease',
    table: 'leases',
    description:
      'Commercial lease of one or more units to a tenant, registered as a contract. Shopping-center leases usually combine a monthly minimum rent with a percentage rent on gross sales, plus service charges and a marketing fund contribution.',
    attrs: [
      'term_months|Count|+|Lease term.',
      'store_opening_date|CalendarDate||Date the store opened.',
      'monthly_minimum_rent|MoneyAmount|+|Current monthly minimum rent.',
      'has_thirteenth_rent|Flag||Whether a thirteenth minimum rent is billed in December.',
    ],
    links: [
      'contract>Contract|!|is registered as|Contract register entry with number, dates, parties and documents.',
      'tenant>Tenant|!|is signed by|Contracting tenant.',
      'brand>Brand|!|is operated under|Brand operated.',
      'status>LeaseStatus|!|is in|Operational lifecycle status.',
      'permitted_use>MerchandiseCategory|!|permits use as|Permitted use, which is the tenant-mix category of record.',
      'broker>Broker||is brokered by|Leasing broker.',
    ],
  },
  {
    concept: 'LeasedUnit',
    module: 'lease',
    table: 'leased_units',
    description:
      'Unit covered by a lease for a period. A lease can cover several units and a unit is leased successively.',
    attrs: [
      'start_date|CalendarDate|!|Start of coverage.',
      'end_date|CalendarDate||End of coverage.',
      'leased_area_m2|AreaM2|+|Area leased.',
    ],
    links: ['lease>Lease|!|is covered by|Lease.', 'unit>LeasableUnit|!|covers|Unit.'],
  },
  {
    concept: 'RentStep',
    module: 'lease',
    table: 'rent_steps',
    description:
      'Step of the minimum-rent schedule, such as a discounted first year followed by full rent.',
    attrs: [
      'effective_from|CalendarDate|!|First day of the step.',
      'effective_to|CalendarDate||Last day of the step.',
      'monthly_amount|MoneyAmount|!+|Monthly minimum rent during the step.',
    ],
    links: ['lease>Lease|!|schedules rent of|Lease.'],
  },
  {
    concept: 'LeaseClause',
    module: 'lease',
    description: 'Abstract contractual clause of a lease.',
    attrs: [
      'clause_reference|Code||Clause number in the signed lease.',
      'effective_from|CalendarDate||Start of effect.',
      'effective_to|CalendarDate||End of effect.',
      'notes|Text||Clause notes.',
    ],
    links: ['lease>Lease|!|is a clause of|Lease containing the clause.'],
  },
  {
    concept: 'PercentageRentClause',
    module: 'lease',
    table: 'percentage_rent_clauses',
    extends: ['LeaseClause'],
    description:
      'Percentage rent: when the rate times monthly gross sales exceeds the minimum rent, the tenant pays the difference as overage rent.',
    attrs: [
      'rate|Rate|!%|Percentage of gross sales.',
      'excludes_thirteenth_rent|Flag||Whether the December thirteenth rent is excluded from the comparison.',
    ],
  },
  {
    concept: 'IndexationClause',
    module: 'lease',
    table: 'indexation_clauses',
    extends: ['LeaseClause'],
    description: 'Periodic adjustment of rent by a price index.',
    attrs: [
      'anniversary_month|Count||Month of the year in which the adjustment applies.',
      'frequency_months|Count|+|Months between adjustments.',
    ],
    links: ['price_index>PriceIndex|!|is adjusted by|Index applied.'],
  },
  {
    concept: 'ExclusivityClause',
    module: 'lease',
    table: 'exclusivity_clauses',
    extends: ['LeaseClause'],
    description: 'Commitment by the landlord not to lease to competitors in a protected category.',
    links: ['protected_category>MerchandiseCategory|!|protects|Protected category.'],
  },
  {
    concept: 'RadiusClause',
    module: 'lease',
    table: 'radius_clauses',
    extends: ['LeaseClause'],
    description: 'Restriction on the tenant opening another store within a radius of the property.',
    attrs: ['radius_km|DistanceKm|!+|Restricted radius.'],
  },
  {
    concept: 'CoTenancyClause',
    module: 'lease',
    table: 'co_tenancy_clauses',
    extends: ['LeaseClause'],
    description: 'Rent relief if required anchors close or occupancy falls below a threshold.',
    attrs: [
      'required_occupancy_rate|Rate|%|Occupancy threshold.',
      'remedy_rent_rate|Rate|%|Fraction of rent payable while the condition is unmet.',
    ],
  },
  {
    concept: 'RenewalOption',
    module: 'lease',
    table: 'renewal_options',
    extends: ['LeaseClause'],
    description: 'Tenant option to renew the lease.',
    attrs: [
      'notice_months|Count|+|Notice required before exercise.',
      'renewal_term_months|Count|!+|Term of the renewal.',
    ],
  },
  {
    concept: 'EarlyTerminationOption',
    module: 'lease',
    table: 'early_termination_options',
    extends: ['LeaseClause'],
    description: 'Right to end the lease early against a penalty.',
    attrs: [
      'earliest_exercise_date|CalendarDate||First date the option can be exercised.',
      'penalty_months_of_rent|Quantity|+|Penalty in months of minimum rent.',
    ],
  },
  {
    concept: 'GuaranteeType',
    module: 'lease',
    table: 'guarantee_types',
    description:
      'Kind of lease guarantee: surety bond, bank guarantee, security deposit, personal guarantor or rent-guarantee insurance.',
    attrs: ['code|Code|!|Type code.', 'name|Name|!|Type name.'],
  },
  {
    concept: 'Guarantee',
    module: 'lease',
    table: 'guarantees',
    description: 'Security provided for the obligations of a lease.',
    attrs: [
      'amount|MoneyAmount|+|Guaranteed amount.',
      'start_date|CalendarDate||Start of cover.',
      'end_date|CalendarDate||End of cover.',
    ],
    links: [
      'lease>Lease|!|secures|Lease secured.',
      'guarantee_type>GuaranteeType|!|is of type|Guarantee type.',
      'guarantor>Organization||is provided by|Bank, insurer or guarantor company.',
    ],
  },
  {
    concept: 'KeyMoneyAgreement',
    module: 'lease',
    table: 'key_money_agreements',
    description:
      'One-off fee for the right to use a location: a right-of-use fee (res sperata) in a new development or key money (luvas) for an existing location. It is not rent.',
    attrs: [
      'total_amount|MoneyAmount|!+|Total fee.',
      'installments|Count|+|Number of instalments.',
      'agreement_date|CalendarDate||Agreement date.',
    ],
    links: ['lease>Lease|!|is agreed for|Lease.'],
  },
  {
    concept: 'RentConcession',
    module: 'lease',
    table: 'rent_concessions',
    description: 'Rent-free period, discount or deferral granted on a lease.',
    attrs: [
      'concession_type|Code|!|Rent-free, discount or deferral.',
      'start_date|CalendarDate|!|Start of the concession.',
      'end_date|CalendarDate||End of the concession.',
      'discount_rate|Rate|%|Fraction of rent waived.',
      'reason|Text||Reason for the concession.',
    ],
    links: ['lease>Lease|!|is granted on|Lease.'],
  },
  {
    concept: 'TenantAllowance',
    module: 'lease',
    table: 'tenant_allowances',
    description: 'Contribution by the landlord towards the tenant fit-out.',
    attrs: ['amount|MoneyAmount|!+|Allowance amount.', 'purpose|Text||Purpose.'],
    links: ['lease>Lease|!|is granted under|Lease.'],
  },
  {
    concept: 'FitOutProject',
    module: 'lease',
    table: 'fit_out_projects',
    description:
      'Construction of the store by the tenant between handover and opening, subject to the landlord design approval.',
    attrs: [
      'handover_date|CalendarDate||Unit handover date.',
      'planned_opening_date|CalendarDate||Planned opening.',
      'actual_opening_date|CalendarDate||Actual opening.',
      'design_approved|Flag||Whether the store design is approved.',
      'status|Code||Project status.',
    ],
    links: ['lease>Lease|!|prepares the store of|Lease.', 'unit>LeasableUnit|!|fits out|Unit.'],
  },
  {
    concept: 'LeaseTermination',
    module: 'lease',
    table: 'lease_terminations',
    description: 'End of a lease before or at expiry.',
    attrs: [
      'termination_date|CalendarDate|!|Termination date.',
      'reason|Code|!|Expiry, mutual agreement, early termination option, eviction or default.',
      'penalty_amount|MoneyAmount|+|Penalty charged.',
    ],
    links: ['lease>Lease|!|terminates|Lease.'],
  },
  // Legal.
  {
    concept: 'LegalEntity',
    module: 'legal',
    table: 'legal_entities',
    description:
      'Role of an organization in the group that signs contracts, keeps books and employs staff: property-owning special-purpose company, fund, administrator or condominium.',
    attrs: [
      'registration_number|Code|!|Company registration number.',
      'entity_type|Code|!|Special-purpose company, fund, administrator, holding or condominium.',
      'incorporation_date|CalendarDate||Incorporation date.',
      'fiscal_regime|Code||Tax regime, for example actual profit or presumed profit.',
    ],
    links: [
      'organization>Organization|!|is a role of|Organization registered as the legal entity.',
    ],
  },
  {
    concept: 'ContractType',
    module: 'legal',
    table: 'contract_types',
    description:
      'Kind of contract in the register: lease, service, supply framework, employment, loan, construction, insurance, brokerage, confidentiality or other.',
    attrs: [
      'code|Code|!|Type code.',
      'name|Name|!|Type name.',
      'requires_legal_review|Flag||Whether legal review is mandatory before signature.',
    ],
  },
  {
    concept: 'Contract',
    module: 'legal',
    table: 'contracts',
    description:
      'Entry of the contract register. Every lease, service contract, supply agreement, employment contract, loan or construction contract is registered here with its number, term, value, parties, documents, obligations and approvals.',
    attrs: [
      'contract_number|Code|!|Contract number.',
      'title|Text|!|Contract title.',
      'signing_date|CalendarDate||Signing date.',
      'start_date|CalendarDate|!|Start of the term.',
      'end_date|CalendarDate||End of the term; empty when indefinite.',
      'status|Code||Draft, under review, signed, active, expired or terminated.',
      'total_value|MoneyAmount|+|Total contract value.',
      'auto_renewal|Flag||Whether the contract renews automatically.',
      'notice_period_days|Count|+|Notice required to terminate or not renew.',
      'governing_law|Text||Governing law and jurisdiction.',
    ],
    links: [
      'contract_type>ContractType|!|is of type|Contract type.',
      'contracting_entity>LegalEntity|!|is entered into by|Group legal entity bound by the contract.',
      'currency>Currency||is denominated in|Contract currency.',
    ],
  },
  {
    concept: 'ContractParty',
    module: 'legal',
    table: 'contract_parties',
    description:
      'Party to a contract other than the contracting entity: counterparty, guarantor, intervening party or witness.',
    attrs: ['party_role|Code|!|Counterparty, guarantor, intervening party or witness.'],
    links: [
      'contract>Contract|!|is a party to|Contract.',
      'organization>Organization||is the organization of|Organization acting as party.',
      'person>Person||is the person of|Person acting as party.',
    ],
  },
  {
    concept: 'ContractDocument',
    module: 'legal',
    table: 'contract_documents',
    description: 'Signed instrument or annex of a contract.',
    attrs: [
      'document_type|Code|!|Original, amendment, annex, notice or termination.',
      'reference|Text||Document repository reference.',
      'signed_date|CalendarDate||Signature date.',
      'signature_method|Code||Handwritten, electronic or qualified digital certificate.',
    ],
    links: ['contract>Contract|!|documents|Contract.'],
  },
  {
    concept: 'ContractAmendment',
    module: 'legal',
    table: 'contract_amendments',
    description:
      'Signed change to a contract: price revision, extension, scope change, assignment or party change.',
    attrs: [
      'amendment_number|Code|!|Amendment number.',
      'effective_date|CalendarDate|!|Effective date.',
      'amendment_type|Code||Kind of change.',
      'summary|Text||Summary of the change.',
      'value_change|MoneyAmount||Change in total contract value.',
    ],
    links: ['contract>Contract|!|amends|Contract amended.'],
  },
  {
    concept: 'ContractObligation',
    module: 'legal',
    table: 'contract_obligations',
    description:
      'Obligation to monitor under a contract, such as payments, sales reporting, insurance certificates, opening hours, maintenance or renewal notices.',
    attrs: [
      'summary|Text|!|Obligation.',
      'obligation_type|Code||Payment, reporting, insurance, operation, maintenance or notice.',
      'due_date|CalendarDate||Next due date.',
      'frequency|Code||One-off, monthly, quarterly or annual.',
      'status|Code||Pending, fulfilled, overdue or waived.',
    ],
    links: [
      'contract>Contract|!|is imposed by|Contract.',
      'responsible>Employee||is monitored by|Employee responsible.',
    ],
  },
  {
    concept: 'ContractApproval',
    module: 'legal',
    table: 'contract_approvals',
    description: 'Approval step of a contract under the delegation-of-authority matrix.',
    attrs: [
      'approval_level|Code|!|Approval level, for example manager, director, legal or board.',
      'decision|Code||Approved, rejected or returned.',
      'decision_date|CalendarDate||Decision date.',
    ],
    links: [
      'contract>Contract|!|is approved through|Contract.',
      'approver>Employee|!|is decided by|Approver.',
    ],
  },
  {
    concept: 'PowerOfAttorney',
    module: 'legal',
    table: 'powers_of_attorney',
    description: 'Authority granted by a legal entity to a person to sign or act on its behalf.',
    attrs: [
      'scope|Text|!|Powers granted.',
      'granted_date|CalendarDate|!|Grant date.',
      'valid_until|CalendarDate||Expiry date.',
    ],
    links: [
      'grantor>LegalEntity|!|is granted by|Granting legal entity.',
      'attorney>Person|!|is granted to|Attorney-in-fact.',
    ],
  },
  {
    concept: 'GovernanceMeeting',
    module: 'legal',
    table: 'governance_meetings',
    description:
      'Meeting of shareholders, board, investors, condominium assembly or tenants association.',
    attrs: [
      'meeting_type|Code|!|Shareholders, board, investors, condominium assembly or tenants association.',
      'meeting_date|CalendarDate|!|Meeting date.',
      'quorum|Rate|%|Fraction of votes present.',
    ],
    links: ['legal_entity>LegalEntity|!|is held by|Entity whose body meets.'],
  },
  {
    concept: 'Resolution',
    module: 'legal',
    table: 'resolutions',
    description:
      'Decision taken at a governance meeting, for example approving a budget, a capital project or a distribution.',
    attrs: [
      'summary|Text|!|Decision.',
      'outcome|Code||Approved, rejected or deferred.',
      'votes_in_favour|Rate|%|Fraction of votes in favour.',
    ],
    links: ['meeting>GovernanceMeeting|!|is passed at|Meeting.'],
  },
  {
    concept: 'LegalProceeding',
    module: 'legal',
    table: 'legal_proceedings',
    description:
      'Lawsuit or administrative proceeding: eviction, lease renewal, rent review, collection, labour, tax or civil liability.',
    attrs: [
      'case_number|Code|!|Case number.',
      'proceeding_type|Code|!|Eviction, renewal, rent review, collection, labour, tax or civil liability.',
      'court|Name||Court or authority.',
      'filing_date|CalendarDate||Filing date.',
      'status|Code||Status.',
      'amount_claimed|MoneyAmount|+|Amount claimed.',
      'is_plaintiff|Flag||Whether the group is the plaintiff.',
    ],
    links: [
      'legal_entity>LegalEntity|!|is a party to|Group legal entity involved.',
      'contract>Contract||concerns|Contract in dispute.',
      'property>Property||concerns|Property concerned.',
      'opposing_party>Organization||is brought against|Opposing organization.',
      'opposing_person>Person||is brought against|Opposing person, for example in a labour claim.',
      'law_firm>Organization||is handled by|Law firm.',
    ],
  },
  {
    concept: 'LitigationProvision',
    module: 'legal',
    table: 'litigation_provisions',
    description:
      'Assessment of the loss probability of a proceeding and the amount provisioned in the accounts.',
    attrs: [
      'assessment_date|CalendarDate|!|Assessment date.',
      'loss_probability|Code|!|Probable, possible or remote.',
      'estimated_loss|MoneyAmount|+|Estimated loss.',
      'provision_amount|MoneyAmount|+|Amount provisioned.',
    ],
    links: ['proceeding>LegalProceeding|!|assesses|Proceeding.'],
  },
  {
    concept: 'ComplianceRequirement',
    module: 'legal',
    table: 'compliance_requirements',
    description:
      'Recurring legal or regulatory requirement: fire safety, accessibility, environmental, sanitary, data protection or labour safety.',
    attrs: [
      'name|Name|!|Requirement.',
      'regulation|Text||Regulation or standard.',
      'frequency|Code||Check frequency.',
    ],
    links: [],
  },
  {
    concept: 'ComplianceCheck',
    module: 'legal',
    table: 'compliance_checks',
    description: 'Verification of a requirement at a property.',
    attrs: [
      'check_date|CalendarDate|!|Check date.',
      'result|Code|!|Compliant, non-compliant or partially compliant.',
      'findings|Text||Findings.',
      'remediation_due|CalendarDate||Deadline for remediation.',
    ],
    links: [
      'requirement>ComplianceRequirement|!|verifies|Requirement.',
      'property>Property|!|is performed at|Property.',
      'inspector>Employee||is performed by|Employee responsible.',
    ],
  },
  {
    concept: 'DataSubjectRequest',
    module: 'legal',
    table: 'data_subject_requests',
    description:
      'Request by a person to access, correct, delete or port their personal data under data-protection law.',
    attrs: [
      'request_date|CalendarDate|!|Request date.',
      'request_type|Code|!|Access, correction, deletion, portability or objection.',
      'due_date|CalendarDate||Legal response deadline.',
      'completed_date|CalendarDate||Completion date.',
      'status|Code||Open, completed or rejected.',
    ],
    links: [
      'data_subject>Person|!|is made by|Person exercising the right.',
      'controller>LegalEntity|!|is addressed to|Controller.',
    ],
  },
  // Human resources.
  {
    concept: 'Department',
    module: 'hr',
    table: 'departments',
    description:
      'Organizational unit such as property operations, leasing, marketing, finance, legal or human resources.',
    attrs: ['code|Code|!|Department code.', 'name|Name|!|Department name.'],
    links: [
      'parent_department>Department||reports to|Parent department.',
      'legal_entity>LegalEntity|!|belongs to|Employing legal entity.',
      'cost_center>CostCenter||is charged to|Default cost center.',
    ],
  },
  {
    concept: 'Position',
    module: 'hr',
    table: 'positions',
    description:
      'Job position, such as general manager, leasing manager, maintenance technician or accounts payable analyst.',
    attrs: [
      'code|Code|!|Position code.',
      'title|Text|!|Job title.',
      'grade|Code||Salary grade.',
      'occupation_code|Code||Official occupation classification code.',
    ],
    links: ['department>Department|!|belongs to|Department.'],
  },
  {
    concept: 'Employee',
    module: 'hr',
    table: 'employees',
    description: 'Role of a person employed by a group legal entity.',
    attrs: [
      'employee_number|Code|!|Employee number.',
      'hire_date|CalendarDate|!|Hire date.',
      'termination_date|CalendarDate||Termination date.',
      'employment_type|Code||Employee, intern, apprentice or temporary.',
      'work_schedule|Code||Working-time arrangement.',
    ],
    links: [
      'person>Person|!|is a role of|Employed person.',
      'position>Position|!|holds|Position.',
      'employer>LegalEntity|!|is employed by|Employing legal entity.',
      'manager>Employee||reports to|Line manager.',
      'work_site>Property||works at|Property where the employee works.',
    ],
  },
  {
    concept: 'EmploymentContract',
    module: 'hr',
    table: 'employment_contracts',
    description: 'Employment terms of an employee, registered as a contract.',
    attrs: [
      'base_salary|MoneyAmount|!+|Monthly base salary.',
      'weekly_hours|Quantity|+|Contracted weekly hours.',
      'probation_end_date|CalendarDate||End of probation.',
    ],
    links: [
      'employee>Employee|!|employs|Employee.',
      'contract>Contract|!|is registered as|Contract register entry.',
    ],
  },
  {
    concept: 'CompensationChange',
    module: 'hr',
    table: 'compensation_changes',
    description: 'Change of base salary by promotion, merit, collective agreement or correction.',
    attrs: [
      'effective_date|CalendarDate|!|Effective date.',
      'new_base_salary|MoneyAmount|!+|New monthly base salary.',
      'reason|Code||Promotion, merit, collective agreement or correction.',
    ],
    links: ['employee>Employee|!|changes pay of|Employee.'],
  },
  {
    concept: 'PayrollRun',
    module: 'hr',
    table: 'payroll_runs',
    description: 'Monthly payroll of a legal entity, including the thirteenth salary when due.',
    attrs: [
      'payment_date|CalendarDate||Payment date.',
      'status|Code||Calculated, approved or paid.',
    ],
    links: [
      'legal_entity>LegalEntity|!|pays|Employer.',
      'month>CalendarMonth|!|pays work of|Payroll month.',
    ],
  },
  {
    concept: 'PayrollLine',
    module: 'hr',
    table: 'payroll_lines',
    description:
      'Amount of one pay component for an employee in a payroll run. employer_cost is true for amounts borne by the employer (salary, overtime, benefits, employer social charges) and false for deductions withheld from the employee.',
    attrs: [
      'component|Code|!|Base salary, overtime, night premium, vacation, thirteenth salary, benefit, employer social charge, employee social security or income tax withholding.',
      'amount|MoneyAmount|!|Amount.',
      'employer_cost|Flag|!|Whether the amount is a cost to the employer.',
    ],
    links: [
      'payroll_run>PayrollRun|!|is part of|Payroll run.',
      'employee>Employee|!|pays|Employee.',
      'cost_center>CostCenter||is charged to|Cost center charged.',
    ],
  },
  {
    concept: 'TimeEntry',
    module: 'hr',
    table: 'time_entries',
    description: 'Hours recorded by an employee on a working day.',
    attrs: [
      'work_date|CalendarDate|!|Working day.',
      'hours_worked|Quantity|!+|Hours worked.',
      'overtime_hours|Quantity|+|Overtime hours.',
      'night_hours|Quantity|+|Night-shift hours.',
    ],
    links: ['employee>Employee|!|is recorded by|Employee.'],
  },
  {
    concept: 'LeaveRequest',
    module: 'hr',
    table: 'leave_requests',
    description: 'Vacation, sick leave, parental leave or other absence.',
    attrs: [
      'leave_type|Code|!|Vacation, sick, parental, bereavement or unpaid.',
      'start_date|CalendarDate|!|First day.',
      'end_date|CalendarDate|!|Last day.',
      'status|Code||Requested, approved or rejected.',
    ],
    links: [
      'employee>Employee|!|is requested by|Employee.',
      'approver>Employee||is approved by|Approver.',
    ],
  },
  {
    concept: 'Benefit',
    module: 'hr',
    table: 'benefits',
    description:
      'Employee benefit such as health plan, dental plan, meal voucher, transport voucher or life insurance.',
    attrs: [
      'name|Name|!|Benefit name.',
      'benefit_type|Code|!|Benefit type.',
      'monthly_cost|MoneyAmount|+|Employer cost per enrolled employee.',
    ],
    links: ['provider>Supplier||is provided by|Benefit supplier.'],
  },
  {
    concept: 'BenefitEnrollment',
    module: 'hr',
    table: 'benefit_enrollments',
    description: 'Enrollment of an employee in a benefit.',
    attrs: [
      'start_date|CalendarDate|!|Start.',
      'end_date|CalendarDate||End.',
      'employee_contribution|MoneyAmount|+|Monthly employee contribution.',
    ],
    links: [
      'employee>Employee|!|is enrolled by|Employee.',
      'benefit>Benefit|!|enrolls in|Benefit.',
    ],
  },
  {
    concept: 'TrainingCourse',
    module: 'hr',
    table: 'training_courses',
    description:
      'Training course, including mandatory safety training such as work at height, fire brigade or electrical safety.',
    attrs: [
      'name|Name|!|Course name.',
      'is_mandatory|Flag||Whether the course is legally mandatory for some positions.',
      'validity_months|Count|+|Months before recertification.',
    ],
  },
  {
    concept: 'TrainingRecord',
    module: 'hr',
    table: 'training_records',
    description: 'Completion of a course by an employee.',
    attrs: [
      'completion_date|CalendarDate|!|Completion date.',
      'expiry_date|CalendarDate||Certification expiry.',
      'passed|Flag||Whether the employee passed.',
    ],
    links: [
      'employee>Employee|!|is completed by|Employee.',
      'course>TrainingCourse|!|completes|Course.',
    ],
  },
  {
    concept: 'PerformanceReview',
    module: 'hr',
    table: 'performance_reviews',
    description: 'Periodic performance evaluation.',
    attrs: [
      'review_date|CalendarDate|!|Review date.',
      'rating|Code||Rating.',
      'summary|Text||Summary.',
    ],
    links: [
      'employee>Employee|!|evaluates|Employee reviewed.',
      'reviewer>Employee||is conducted by|Reviewer.',
    ],
  },
  {
    concept: 'JobOpening',
    module: 'hr',
    table: 'job_openings',
    description: 'Vacancy being recruited for a position.',
    attrs: [
      'opened_date|CalendarDate|!|Opened.',
      'closed_date|CalendarDate||Closed.',
      'status|Code||Open, filled or cancelled.',
    ],
    links: [
      'position>Position|!|recruits for|Position.',
      'hiring_manager>Employee||is managed by|Hiring manager.',
    ],
  },
  {
    concept: 'JobApplication',
    module: 'hr',
    table: 'job_applications',
    description: 'Application of a candidate to an opening.',
    attrs: [
      'applied_date|CalendarDate|!|Application date.',
      'stage|Code||Screening, interview, offer, hired or rejected.',
    ],
    links: [
      'job_opening>JobOpening|!|applies to|Opening.',
      'candidate>Person|!|is submitted by|Candidate.',
    ],
  },
  // Procurement.
  {
    concept: 'Supplier',
    module: 'proc',
    table: 'suppliers',
    description:
      'Role of an organization that supplies goods or services: cleaning, security, maintenance, utilities, marketing, construction or professional services.',
    attrs: [
      'supplier_category|Code||Main category supplied.',
      'payment_terms_days|Count|+|Standard payment term in days.',
      'is_approved|Flag||Whether the supplier is approved for purchasing.',
    ],
    links: ['organization>Organization|!|is a role of|Supplying organization.'],
  },
  {
    concept: 'SupplierQualification',
    module: 'proc',
    table: 'supplier_qualifications',
    description:
      'Onboarding check of a supplier: tax and labour certificates, insurance, references and compliance declarations.',
    attrs: [
      'qualification_date|CalendarDate|!|Qualification date.',
      'status|Code|!|Approved, conditional or rejected.',
      'valid_until|CalendarDate||Expiry of the qualification.',
    ],
    links: [
      'supplier>Supplier|!|qualifies|Supplier.',
      'reviewer>Employee||is reviewed by|Reviewer.',
    ],
  },
  {
    concept: 'SupplierEvaluation',
    module: 'proc',
    table: 'supplier_evaluations',
    description: 'Periodic evaluation of supplier quality, timeliness and compliance.',
    attrs: [
      'evaluation_date|CalendarDate|!|Evaluation date.',
      'score|Rate|!%|Score as a fraction of the maximum.',
      'comments|Text||Comments.',
    ],
    links: [
      'supplier>Supplier|!|evaluates|Supplier.',
      'evaluator>Employee||is performed by|Evaluator.',
    ],
  },
  {
    concept: 'SupplierAgreement',
    module: 'proc',
    table: 'supplier_agreements',
    description:
      'Framework supply agreement with agreed prices and conditions, registered as a contract.',
    attrs: [
      'price_adjustment_month|Count||Month of the year in which prices are adjusted.',
      'spend_cap|MoneyAmount|+|Maximum spend under the agreement.',
    ],
    links: [
      'contract>Contract|!|is registered as|Contract register entry.',
      'supplier>Supplier|!|is agreed with|Supplier.',
      'price_index>PriceIndex||is adjusted by|Price index applied.',
    ],
  },
  {
    concept: 'PurchaseRequisition',
    module: 'proc',
    table: 'purchase_requisitions',
    description: 'Internal request to buy goods or services.',
    attrs: [
      'requisition_number|Code|!|Requisition number.',
      'request_date|CalendarDate|!|Request date.',
      'justification|Text||Business justification.',
      'estimated_amount|MoneyAmount|+|Estimated amount.',
      'status|Code||Draft, approved, rejected or ordered.',
    ],
    links: [
      'requester>Employee|!|is requested by|Requesting employee.',
      'property>Property||is requested for|Property concerned.',
    ],
  },
  {
    concept: 'RequestForQuotation',
    module: 'proc',
    table: 'requests_for_quotation',
    description: 'Invitation to suppliers to quote for a requisition.',
    attrs: [
      'rfq_number|Code|!|Request number.',
      'issue_date|CalendarDate|!|Issue date.',
      'closing_date|CalendarDate||Deadline for quotes.',
    ],
    links: ['requisition>PurchaseRequisition|!|sources|Requisition.'],
  },
  {
    concept: 'SupplierQuote',
    module: 'proc',
    table: 'supplier_quotes',
    description: 'Quote submitted by a supplier.',
    attrs: [
      'quote_date|CalendarDate|!|Quote date.',
      'amount|MoneyAmount|!+|Quoted amount.',
      'delivery_days|Count|+|Delivery or mobilisation time in days.',
      'is_selected|Flag||Whether the quote was selected.',
    ],
    links: [
      'rfq>RequestForQuotation|!|answers|Request for quotation.',
      'supplier>Supplier|!|is submitted by|Supplier.',
    ],
  },
  {
    concept: 'PurchaseOrder',
    module: 'proc',
    table: 'purchase_orders',
    description: 'Order placed with a supplier.',
    attrs: [
      'po_number|Code|!|Order number.',
      'order_date|CalendarDate|!|Order date.',
      'status|Code||Open, received, invoiced, closed or cancelled.',
    ],
    links: [
      'supplier>Supplier|!|is placed with|Supplier.',
      'property>Property||is delivered to|Delivery property.',
      'requisition>PurchaseRequisition||fulfils|Requisition.',
      'agreement>SupplierAgreement||is called off under|Framework agreement.',
      'buyer>Employee||is issued by|Buyer.',
    ],
  },
  {
    concept: 'PurchaseOrderLine',
    module: 'proc',
    table: 'purchase_order_lines',
    description: 'Item or service ordered.',
    attrs: [
      'summary|Text|!|Item or service.',
      'quantity|Quantity|!+|Quantity ordered.',
      'unit_price|MoneyAmount|!+|Unit price.',
    ],
    links: [
      'purchase_order>PurchaseOrder|!|is a line of|Purchase order.',
      'category>ExpenseCategory|!|is classified as|Expense category.',
    ],
  },
  {
    concept: 'GoodsReceipt',
    module: 'proc',
    table: 'goods_receipts',
    description: 'Receipt of goods or acceptance of services delivered under an order.',
    attrs: [
      'receipt_date|CalendarDate|!|Receipt date.',
      'is_accepted|Flag||Whether the delivery was accepted.',
      'notes|Text||Notes.',
    ],
    links: [
      'purchase_order>PurchaseOrder|!|receives|Purchase order.',
      'received_by>Employee||is accepted by|Receiving employee.',
    ],
  },
  {
    concept: 'SupplierInvoice',
    module: 'proc',
    table: 'supplier_invoices',
    description:
      'Supplier invoice payable, in Brazil an electronic fiscal document (NF-e or NFS-e). paid_amount holds payments at the reporting date.',
    attrs: [
      'invoice_number|Code|!|Invoice number.',
      'fiscal_document_key|Code||Electronic fiscal document access key.',
      'issue_date|CalendarDate|!|Issue date.',
      'due_date|CalendarDate|!|Due date.',
      'gross_amount|MoneyAmount|!+|Invoice total.',
      'withheld_taxes|MoneyAmount|+|Taxes withheld at payment.',
      'paid_amount|MoneyAmount|+|Paid at the reporting date.',
      'status|Code||Received, approved, paid or disputed.',
    ],
    links: [
      'supplier>Supplier|!|is issued by|Supplier.',
      'payer>LegalEntity|!|is payable by|Paying legal entity.',
      'purchase_order>PurchaseOrder||invoices|Purchase order.',
      'month>CalendarMonth|!|is accrued in|Competence month.',
    ],
  },
  {
    concept: 'SupplierPayment',
    module: 'proc',
    table: 'supplier_payments',
    description: 'Payment of a supplier invoice.',
    attrs: [
      'payment_date|CalendarDate|!|Payment date.',
      'amount|MoneyAmount|!+|Amount paid.',
      'payment_method|Code||Transfer, bank slip or instant payment.',
    ],
    links: [
      'supplier_invoice>SupplierInvoice|!|pays|Supplier invoice.',
      'bank_account>BankAccount||is paid from|Paying account.',
    ],
  },
  // Operations.
  {
    concept: 'ExpenseCategory',
    module: 'ops',
    table: 'expense_categories',
    description:
      'Category of operating cost, such as cleaning, security, maintenance, utilities, insurance or administration fees.',
    attrs: [
      'code|Code|!|Category code.',
      'name|Name|!|Category name.',
      'recoverable|Flag||Whether the cost is recoverable from tenants through service charges.',
    ],
    links: ['parent_category>ExpenseCategory||is a subcategory of|Broader category.'],
  },
  {
    concept: 'ServiceChargeBudget',
    module: 'ops',
    table: 'service_charge_budgets',
    description:
      'Annual budget of shared operating costs recovered from tenants (in Brazil, the condominium budget).',
    attrs: [
      'year|Year|!|Budget year.',
      'approved_date|CalendarDate||Approval date.',
      'total_amount|MoneyAmount|+|Budget total.',
    ],
    links: ['property>Property|!|budgets costs of|Property.'],
  },
  {
    concept: 'ServiceChargeBudgetLine',
    module: 'ops',
    table: 'service_charge_budget_lines',
    description: 'Budgeted amount for one expense category.',
    attrs: ['amount|MoneyAmount|!+|Budgeted amount.'],
    links: [
      'budget>ServiceChargeBudget|!|is a line of|Budget.',
      'category>ExpenseCategory|!|budgets|Expense category.',
    ],
  },
  {
    concept: 'AllocationKey',
    module: 'ops',
    table: 'allocation_keys',
    description:
      'Rule to apportion recoverable costs among units, by area, ideal fraction, metered consumption or fixed share.',
    attrs: [
      'code|Code|!|Key code.',
      'name|Name|!|Key name.',
      'basis|Code|!|Area, ideal fraction, metered or fixed.',
    ],
    links: ['property>Property|!|apportions costs of|Property.'],
  },
  {
    concept: 'AllocationShare',
    module: 'ops',
    table: 'allocation_shares',
    description: 'Share of a unit under an allocation key.',
    attrs: ['share|Rate|!%|Fraction allocated to the unit.'],
    links: [
      'allocation_key>AllocationKey|!|is a share under|Allocation key.',
      'unit>LeasableUnit|!|is allocated to|Unit.',
    ],
  },
  {
    concept: 'ServiceContract',
    module: 'ops',
    table: 'service_contracts',
    description:
      'Recurring service contract at a property, such as cleaning, security, maintenance, parking operation or landscaping, registered as a contract.',
    attrs: [
      'scope|Text||Scope of services.',
      'monthly_amount|MoneyAmount|+|Monthly fee.',
      'service_level|Text||Agreed service levels.',
    ],
    links: [
      'contract>Contract|!|is registered as|Contract register entry.',
      'supplier>Supplier|!|is supplied by|Supplier.',
      'property>Property|!|serves|Property served.',
      'category>ExpenseCategory|!|is classified as|Expense category.',
    ],
  },
  {
    concept: 'OperatingExpense',
    module: 'ops',
    table: 'operating_expenses',
    description: 'Actual operating cost incurred by a property in a month.',
    attrs: [
      'summary|Text||Expense description.',
      'amount|MoneyAmount|!+|Amount incurred.',
      'recoverable|Flag||Whether the expense is recoverable from tenants.',
    ],
    links: [
      'property>Property|!|is incurred by|Property.',
      'category>ExpenseCategory|!|is classified as|Expense category.',
      'month>CalendarMonth|!|is incurred in|Month.',
      'supplier>Supplier||is invoiced by|Supplier.',
    ],
  },
  {
    concept: 'WorkOrder',
    module: 'ops',
    table: 'work_orders',
    description: 'Maintenance request or task: corrective, preventive or requested by a tenant.',
    attrs: [
      'work_order_number|Code|!|Work order number.',
      'opened_date|CalendarDate|!|Opened.',
      'closed_date|CalendarDate||Closed.',
      'priority|Code||Priority.',
      'work_type|Code||Corrective, preventive or tenant request.',
      'cost|MoneyAmount|+|Cost.',
    ],
    links: [
      'property>Property|!|is raised at|Property.',
      'equipment>Equipment||repairs|Equipment concerned.',
      'unit>LeasableUnit||is carried out in|Unit concerned.',
      'supplier>Supplier||is assigned to|Supplier assigned.',
      'requested_by>Employee||is requested by|Employee who opened the work order.',
    ],
  },
  {
    concept: 'UtilityType',
    module: 'ops',
    table: 'utility_types',
    description: 'Metered utility: electricity, water, gas or chilled water.',
    attrs: [
      'code|Code|!|Utility code.',
      'name|Name|!|Utility name.',
      'unit_of_measure|Code||Unit of measure.',
    ],
  },
  {
    concept: 'UtilityMeter',
    module: 'ops',
    table: 'utility_meters',
    description: 'Meter measuring consumption of a utility by a unit or common installation.',
    attrs: ['code|Code|!|Meter code.'],
    links: [
      'utility_type>UtilityType|!|measures|Utility measured.',
      'property>Property|!|is installed at|Property.',
      'unit>LeasableUnit||measures consumption of|Unit metered; empty for common installations.',
    ],
  },
  {
    concept: 'MeterReading',
    module: 'ops',
    table: 'meter_readings',
    description: 'Reading of a meter, the basis for recharging consumption to tenants.',
    attrs: [
      'reading_date|CalendarDate|!|Reading date.',
      'reading_value|Quantity|!+|Cumulative reading.',
      'consumption|Quantity|+|Consumption since the previous reading.',
    ],
    links: [
      'meter>UtilityMeter|!|is read from|Meter.',
      'month>CalendarMonth|!|is billed in|Billing month.',
    ],
  },
  {
    concept: 'InsurancePolicy',
    module: 'ops',
    table: 'insurance_policies',
    description:
      'Insurance covering the property, such as property damage, loss of rent or civil liability.',
    attrs: [
      'policy_number|Code|!|Policy number.',
      'coverage_type|Code||Coverage.',
      'insured_amount|MoneyAmount|+|Insured amount.',
      'premium|MoneyAmount|+|Premium.',
      'start_date|CalendarDate|!|Start.',
      'end_date|CalendarDate||End.',
    ],
    links: [
      'property>Property|!|insures|Property.',
      'insurer>Organization|!|is underwritten by|Insurer.',
      'contract>Contract||is registered as|Contract register entry.',
    ],
  },
  {
    concept: 'Incident',
    module: 'ops',
    table: 'incidents',
    description: 'Safety, security or operational incident at a property.',
    attrs: [
      'occurred_on|CalendarDate|!|Date of the incident.',
      'incident_type|Code||Incident type.',
      'severity|Code||Severity.',
      'summary|Text||Summary.',
    ],
    links: ['property>Property|!|occurred at|Property.'],
  },
  {
    concept: 'MarketingFund',
    module: 'ops',
    table: 'marketing_funds',
    description:
      'Annual promotion and advertising fund financed by tenant contributions, usually a fraction of minimum rent.',
    attrs: [
      'year|Year|!|Fund year.',
      'contribution_rate|Rate|%|Contribution as a fraction of minimum rent.',
      'budget_amount|MoneyAmount|+|Budget.',
    ],
    links: ['property>Property|!|promotes|Property.'],
  },
  {
    concept: 'MarketingCampaign',
    module: 'ops',
    table: 'marketing_campaigns',
    description: 'Campaign financed by the marketing fund.',
    attrs: [
      'name|Name|!|Campaign name.',
      'start_date|CalendarDate|!|Start.',
      'end_date|CalendarDate||End.',
      'budget|MoneyAmount|+|Budget.',
    ],
    links: ['fund>MarketingFund|!|is financed by|Marketing fund.'],
  },
  {
    concept: 'MallEvent',
    module: 'ops',
    table: 'mall_events',
    description: 'Event held at a property to attract visitors.',
    attrs: [
      'name|Name|!|Event name.',
      'event_date|CalendarDate|!|Event date.',
      'expected_visitors|Count|+|Expected visitors.',
    ],
    links: [
      'property>Property|!|is held at|Property.',
      'campaign>MarketingCampaign||is part of|Campaign.',
    ],
  },
  // Finance.
  {
    concept: 'ChargeType',
    module: 'fin',
    table: 'charge_types',
    description:
      'Kind of billed item: minimum rent, percentage (overage) rent, thirteenth rent, service charge, marketing fund, utility recharge, key-money instalment or late fee.',
    attrs: [
      'code|Code|!|Charge code.',
      'name|Name|!|Charge name.',
      'revenue_class|Code|!|Rent, recoveries, marketing or other.',
    ],
  },
  {
    concept: 'Invoice',
    module: 'fin',
    table: 'invoices',
    description:
      'Billing document issued by a property to a tenant, payable by bank slip, transfer or instant payment.',
    attrs: [
      'invoice_number|Code|!|Invoice number.',
      'issue_date|CalendarDate|!|Issue date.',
      'due_date|CalendarDate|!|Due date.',
      'status|Code||Open, paid, partially paid or cancelled.',
    ],
    links: [
      'property>Property|!|is issued by|Issuing property.',
      'billed_tenant>Tenant|!|is billed to|Tenant billed.',
    ],
  },
  {
    concept: 'Charge',
    module: 'fin',
    table: 'charges',
    description:
      'Billed amount of one charge type for a lease and competence month. paid_amount holds the allocated payments at the reporting date.',
    attrs: [
      'summary|Text||Charge description.',
      'amount|MoneyAmount|!|Billed amount; negative for credits.',
      'paid_amount|MoneyAmount|+|Payments allocated at the reporting date.',
      'due_date|CalendarDate||Due date.',
    ],
    links: [
      'invoice>Invoice|!|is billed on|Invoice.',
      'lease>Lease|!|is due under|Lease.',
      'charge_type>ChargeType|!|is of type|Charge type.',
      'month>CalendarMonth|!|is the competence of|Competence month.',
    ],
  },
  {
    concept: 'BankAccount',
    module: 'fin',
    table: 'bank_accounts',
    description: 'Bank account used for collections, supplier payments, payroll and distributions.',
    attrs: [
      'bank_name|Name|!|Bank.',
      'branch_code|Code||Branch.',
      'account_number|Code|!|Account number.',
    ],
    links: [
      'holder>LegalEntity|!|is held by|Account holder.',
      'bank>Organization||is kept at|Bank.',
    ],
  },
  {
    concept: 'Payment',
    module: 'fin',
    table: 'payments',
    description: 'Payment received from a tenant.',
    attrs: [
      'payment_date|CalendarDate|!|Payment date.',
      'amount|MoneyAmount|!+|Amount received.',
      'payment_method|Code||Bank slip, transfer or instant payment.',
    ],
    links: [
      'payer>Tenant|!|is paid by|Paying tenant.',
      'bank_account>BankAccount||is received into|Receiving account.',
    ],
  },
  {
    concept: 'PaymentAllocation',
    module: 'fin',
    table: 'payment_allocations',
    description: 'Part of a payment applied to a charge.',
    attrs: ['amount|MoneyAmount|!+|Amount applied.'],
    links: ['payment>Payment|!|applies|Payment.', 'charge>Charge|!|settles|Charge.'],
  },
  {
    concept: 'ArrearsCase',
    module: 'fin',
    table: 'arrears_cases',
    description: 'Delinquency case opened when a lease has overdue charges.',
    attrs: [
      'opened_date|CalendarDate|!|Opened.',
      'closed_date|CalendarDate||Closed.',
      'status|Code||Open, in agreement, in litigation or closed.',
      'amount_overdue|MoneyAmount|+|Overdue amount when opened.',
    ],
    links: ['lease>Lease|!|concerns|Lease in arrears.'],
  },
  {
    concept: 'CollectionAction',
    module: 'fin',
    table: 'collection_actions',
    description:
      'Step taken to collect overdue amounts: reminder, formal notice, protest, agreement or lawsuit.',
    attrs: [
      'action_date|CalendarDate|!|Action date.',
      'action_type|Code|!|Action type.',
      'outcome|Text||Outcome.',
    ],
    links: ['arrears_case>ArrearsCase|!|is taken in|Arrears case.'],
  },
  {
    concept: 'PaymentAgreement',
    module: 'fin',
    table: 'payment_agreements',
    description: 'Agreement to settle overdue amounts in instalments.',
    attrs: [
      'agreement_date|CalendarDate|!|Agreement date.',
      'total_amount|MoneyAmount|!+|Amount agreed.',
      'installments|Count|+|Number of instalments.',
    ],
    links: ['arrears_case>ArrearsCase|!|settles|Arrears case.'],
  },
  {
    concept: 'LedgerAccount',
    module: 'fin',
    table: 'ledger_accounts',
    description: 'Account of the property chart of accounts.',
    attrs: [
      'code|Code|!|Account code.',
      'name|Name|!|Account name.',
      'account_class|Code|!|Revenue, operating expense, non-operating, asset, liability or equity.',
    ],
    links: ['parent_account>LedgerAccount||rolls up to|Parent account.'],
  },
  {
    concept: 'JournalEntry',
    module: 'fin',
    table: 'journal_entries',
    description: 'Accounting entry of a legal entity for a month.',
    attrs: [
      'entry_date|CalendarDate|!|Posting date.',
      'summary|Text||Entry description.',
      'source_system|Code||Originating process: billing, payables, payroll, depreciation or manual.',
    ],
    links: [
      'legal_entity>LegalEntity|!|is posted by|Legal entity keeping the books.',
      'month>CalendarMonth|!|is posted in|Accounting month.',
    ],
  },
  {
    concept: 'JournalLine',
    module: 'fin',
    table: 'journal_lines',
    description:
      'Signed amount posted to a ledger account and cost center: income is positive and expense negative. noi_class is fixed at posting from the account: revenue, opex or excluded.',
    attrs: [
      'amount|MoneyAmount|!|Signed amount.',
      'noi_class|Code|!|Contribution to net operating income: revenue, opex or excluded.',
      'memo|Text||Line memo.',
    ],
    links: [
      'entry>JournalEntry|!|is a line of|Journal entry.',
      'account>LedgerAccount|!|is posted to|Ledger account.',
      'cost_center>CostCenter|!|is charged to|Cost center; property cost centers attribute results to a property.',
    ],
  },
  {
    concept: 'OwnerDistribution',
    module: 'fin',
    table: 'owner_distributions',
    description: 'Cash distributed to an investor for its ownership stake.',
    attrs: [
      'distribution_date|CalendarDate|!|Distribution date.',
      'amount|MoneyAmount|!+|Amount distributed.',
    ],
    links: [
      'stake>OwnershipStake|!|is paid on|Ownership stake.',
      'month>CalendarMonth|!|distributes results of|Result month.',
    ],
  },
  {
    concept: 'CapitalProject',
    module: 'fin',
    table: 'capital_projects',
    description:
      'Capital expenditure on a property: expansion, renovation, retrofit or sustainability works.',
    attrs: [
      'name|Name|!|Project name.',
      'project_type|Code||Project type.',
      'budget|MoneyAmount|+|Approved budget.',
      'start_date|CalendarDate||Start.',
      'completion_date|CalendarDate||Completion.',
      'added_gla_m2|AreaM2|+|Gross leasable area added.',
    ],
    links: [
      'property>Property|!|invests in|Property.',
      'construction_contract>Contract||is executed under|Construction contract.',
    ],
  },
  {
    concept: 'CostCenter',
    module: 'fin',
    table: 'cost_centers',
    description:
      'Unit of cost and result responsibility: a property, a department or a corporate function.',
    attrs: ['code|Code|!|Cost center code.', 'name|Name|!|Cost center name.'],
    links: [
      'property>Property||accounts for|Property whose results the cost center carries.',
      'parent_cost_center>CostCenter||rolls up to|Parent cost center.',
    ],
  },
  {
    concept: 'OperatingBudget',
    module: 'fin',
    table: 'operating_budgets',
    description: 'Approved annual budget of a legal entity, by version.',
    attrs: [
      'year|Year|!|Budget year.',
      'version|Code|!|Original, reforecast or final.',
      'approved_date|CalendarDate||Approval date.',
    ],
    links: [
      'legal_entity>LegalEntity|!|budgets|Legal entity.',
      'approval>Resolution||is approved by|Resolution approving the budget.',
    ],
  },
  {
    concept: 'BudgetLine',
    module: 'fin',
    table: 'budget_lines',
    description: 'Budgeted amount for an account, cost center and month.',
    attrs: ['amount|MoneyAmount|!|Signed budgeted amount.'],
    links: [
      'budget>OperatingBudget|!|is a line of|Budget.',
      'account>LedgerAccount|!|budgets|Ledger account.',
      'cost_center>CostCenter|!|is planned for|Cost center.',
      'month>CalendarMonth|!|is planned in|Month.',
    ],
  },
  {
    concept: 'TaxType',
    module: 'fin',
    table: 'tax_types',
    description:
      'Tax or levy, such as property tax (IPTU), services tax (ISS), PIS, COFINS, income taxes or social security.',
    attrs: [
      'code|Code|!|Tax code.',
      'name|Name|!|Tax name.',
      'jurisdiction_level|Code||Federal, state or municipal.',
    ],
  },
  {
    concept: 'TaxObligation',
    module: 'fin',
    table: 'tax_obligations',
    description:
      'Tax assessed or declared for a period, such as annual property tax instalments or monthly taxes on revenue.',
    attrs: [
      'amount|MoneyAmount|!+|Amount due.',
      'due_date|CalendarDate|!|Due date.',
      'paid_date|CalendarDate||Payment date.',
      'is_recoverable|Flag||Whether it is recharged to tenants through service charges.',
    ],
    links: [
      'tax_type>TaxType|!|is assessed as|Tax.',
      'legal_entity>LegalEntity|!|is owed by|Taxpayer.',
      'property>Property||is assessed on|Property taxed.',
      'month>CalendarMonth|!|is due for|Period.',
    ],
  },
  {
    concept: 'TaxWithholding',
    module: 'fin',
    table: 'tax_withholdings',
    description:
      'Tax withheld from a supplier invoice and paid to the authority on the supplier behalf.',
    attrs: ['rate|Rate|!%|Withholding rate.', 'amount|MoneyAmount|!+|Amount withheld.'],
    links: [
      'supplier_invoice>SupplierInvoice|!|is withheld from|Supplier invoice.',
      'tax_type>TaxType|!|withholds|Tax.',
    ],
  },
  {
    concept: 'FixedAsset',
    module: 'fin',
    table: 'fixed_assets',
    description: 'Capitalised asset: building, improvement, equipment or furniture.',
    attrs: [
      'asset_number|Code|!|Asset number.',
      'summary|Text||Asset description.',
      'acquisition_date|CalendarDate|!|Acquisition or completion date.',
      'acquisition_cost|MoneyAmount|!+|Cost capitalised.',
      'useful_life_months|Count|+|Useful life.',
    ],
    links: [
      'property>Property|!|is located at|Property.',
      'ledger_account>LedgerAccount||is recorded in|Asset account.',
      'capital_project>CapitalProject||results from|Capital project.',
    ],
  },
  {
    concept: 'DepreciationEntry',
    module: 'fin',
    table: 'depreciation_entries',
    description: 'Monthly depreciation of a fixed asset.',
    attrs: ['amount|MoneyAmount|!+|Depreciation for the month.'],
    links: [
      'fixed_asset>FixedAsset|!|depreciates|Asset.',
      'month>CalendarMonth|!|is recorded in|Month.',
    ],
  },
  {
    concept: 'LoanAgreement',
    module: 'fin',
    table: 'loan_agreements',
    description:
      'Debt financing, such as a bank loan or real-estate receivables securitisation, registered as a contract.',
    attrs: [
      'principal|MoneyAmount|!+|Principal.',
      'interest_rate|Rate|%|Annual interest rate or spread.',
      'maturity_date|CalendarDate||Maturity.',
    ],
    links: [
      'contract>Contract|!|is registered as|Contract register entry.',
      'lender>Organization|!|is lent by|Lender.',
      'borrower>LegalEntity|!|is borrowed by|Borrowing legal entity.',
      'collateral>Property||is secured by|Property given as collateral.',
      'rate_index>PriceIndex||is indexed to|Index applied to the debt.',
    ],
  },
  {
    concept: 'DebtServicePayment',
    module: 'fin',
    table: 'debt_service_payments',
    description: 'Scheduled or paid instalment of principal and interest.',
    attrs: [
      'payment_date|CalendarDate|!|Payment date.',
      'principal_amount|MoneyAmount|+|Principal repaid.',
      'interest_amount|MoneyAmount|+|Interest paid.',
    ],
    links: ['loan>LoanAgreement|!|services|Loan.'],
  },
  {
    concept: 'BankTransaction',
    module: 'fin',
    table: 'bank_transactions',
    description: 'Statement line of a bank account, reconciled against receipts and payments.',
    attrs: [
      'transaction_date|CalendarDate|!|Value date.',
      'amount|MoneyAmount|!|Signed amount.',
      'summary|Text||Statement description.',
      'is_reconciled|Flag||Whether the line is reconciled.',
    ],
    links: ['bank_account>BankAccount|!|appears on|Bank account.'],
  },
  {
    concept: 'InsuranceClaim',
    module: 'fin',
    table: 'insurance_claims',
    description: 'Claim under an insurance policy.',
    attrs: [
      'claim_date|CalendarDate|!|Claim date.',
      'amount_claimed|MoneyAmount|+|Amount claimed.',
      'amount_paid|MoneyAmount|+|Amount paid by the insurer.',
      'status|Code||Open, accepted, rejected or paid.',
    ],
    links: [
      'policy>InsurancePolicy|!|is made under|Policy.',
      'incident>Incident||results from|Incident.',
    ],
  },
  // Performance.
  {
    concept: 'OccupancySnapshot',
    module: 'perf',
    table: 'occupancy_snapshots',
    description:
      'State of a unit at month end: its gross leasable area, the area occupied under a lease and the contracted minimum rent. One row per unit and month.',
    attrs: [
      'gla_m2|AreaM2|!+|Gross leasable area of the unit.',
      'occupied_gla_m2|AreaM2|!+|Area under an active lease at month end.',
      'contracted_minimum_rent|MoneyAmount|+|Monthly minimum rent in force at month end.',
    ],
    links: [
      'unit>LeasableUnit|!|describes|Unit.',
      'month>CalendarMonth|!|is taken at the end of|Month.',
      'lease>Lease||is occupied under|Lease in force; empty when vacant.',
    ],
  },
  {
    concept: 'SalesReport',
    module: 'perf',
    table: 'sales_reports',
    description:
      'Monthly gross sales declared by a tenant, the basis for percentage rent. occupancy_cost is the rent, service charge and marketing fund billed for the same month.',
    attrs: [
      'gross_sales|MoneyAmount|!+|Declared gross sales.',
      'reported_gla_m2|AreaM2|!+|Area of the leased units.',
      'occupancy_cost|MoneyAmount|+|Occupancy cost billed for the month.',
      'submitted_date|CalendarDate||Submission date.',
      'is_audited|Flag||Whether the report was audited.',
    ],
    links: [
      'lease>Lease|!|is declared under|Lease.',
      'property>Property|!|is reported at|Property.',
      'month>CalendarMonth|!|reports sales of|Sales month.',
    ],
  },
  {
    concept: 'SalesAudit',
    module: 'perf',
    table: 'sales_audits',
    description: 'Audit of declared sales against tenant records.',
    attrs: [
      'audit_date|CalendarDate|!|Audit date.',
      'audited_sales|MoneyAmount|+|Sales established by the audit.',
      'variance_amount|MoneyAmount||Audited minus declared sales.',
    ],
    links: [
      'sales_report>SalesReport|!|audits|Sales report.',
      'auditor>Organization||is performed by|Auditor.',
    ],
  },
  {
    concept: 'FootfallCount',
    module: 'perf',
    table: 'footfall_counts',
    description: 'Visitors counted at an entrance over a counting period.',
    attrs: [
      'period_start|CalendarDate|!|First day counted.',
      'period_end|CalendarDate|!|Last day counted.',
      'visitors|Count|!+|Visitors counted.',
    ],
    links: [
      'entrance>Entrance|!|is counted at|Entrance.',
      'month>CalendarMonth|!|is reported in|Reporting month.',
    ],
  },
  {
    concept: 'ParkingActivity',
    module: 'perf',
    table: 'parking_activity',
    description: 'Tickets and revenue of a parking facility in a month.',
    attrs: ['tickets|Count|!+|Tickets issued.', 'revenue|MoneyAmount|!+|Parking revenue.'],
    links: [
      'facility>ParkingFacility|!|is recorded at|Parking facility.',
      'month>CalendarMonth|!|is recorded in|Month.',
    ],
  },
];
const metrics: { name: string; concept: string; description: string; expression: string }[] = [
  {
    name: 'total_gla',
    concept: 'TotalGla',
    description:
      'Gross leasable area of the selected units (m²). Sum over one month only; summing months multiplies area.',
    expression: 'SUM(occupancy_snapshots.gla_m2)',
  },
  {
    name: 'occupied_gla',
    concept: 'OccupiedGla',
    description: 'Gross leasable area under an active lease at month end (m²).',
    expression: 'SUM(occupancy_snapshots.occupied_gla_m2)',
  },
  {
    name: 'vacant_gla',
    concept: 'VacantGla',
    description: 'Gross leasable area without an active lease at month end (m²).',
    expression: 'SUM(occupancy_snapshots.vacant_gla_m2)',
  },
  {
    name: 'occupancy_rate',
    concept: 'OccupancyRate',
    description: 'Occupied over total gross leasable area.',
    expression: 'occupied_gla / NULLIF(total_gla, 0)',
  },
  {
    name: 'contracted_minimum_rent',
    concept: 'ContractedMinimumRent',
    description: 'Monthly minimum rent in force at month end.',
    expression: 'SUM(occupancy_snapshots.contracted_minimum_rent)',
  },
  {
    name: 'minimum_rent_per_m2',
    concept: 'MinimumRentPerM2',
    description: 'Contracted minimum rent per occupied square metre per month.',
    expression: 'contracted_minimum_rent / NULLIF(occupied_gla, 0)',
  },
  {
    name: 'billed_amount',
    concept: 'BilledAmount',
    description: 'Charges billed for the competence month, all charge types.',
    expression: 'SUM(charges.amount)',
  },
  {
    name: 'collected_amount',
    concept: 'CollectedAmount',
    description: 'Payments allocated to the selected charges at the reporting date.',
    expression: 'SUM(charges.paid_amount)',
  },
  {
    name: 'open_amount',
    concept: 'OpenAmount',
    description: 'Billed minus collected at the reporting date.',
    expression: 'SUM(charges.open_amount)',
  },
  {
    name: 'delinquency_rate',
    concept: 'DelinquencyRate',
    description: 'Open over billed amount at the reporting date.',
    expression: 'open_amount / NULLIF(billed_amount, 0)',
  },
  {
    name: 'tenant_sales',
    concept: 'TenantSales',
    description: 'Gross sales declared by tenants.',
    expression: 'SUM(sales_reports.gross_sales)',
  },
  {
    name: 'reporting_area',
    concept: 'ReportingArea',
    description: 'Area of the units whose sales are reported (m²). Sum over one month only.',
    expression: 'SUM(sales_reports.reported_gla_m2)',
  },
  {
    name: 'sales_per_m2',
    concept: 'SalesPerM2',
    description: 'Monthly tenant sales per reporting square metre.',
    expression: 'tenant_sales / NULLIF(reporting_area, 0)',
  },
  {
    name: 'occupancy_cost',
    concept: 'OccupancyCost',
    description: 'Rent, service charge and marketing fund billed to reporting tenants.',
    expression: 'SUM(sales_reports.occupancy_cost)',
  },
  {
    name: 'occupancy_cost_ratio',
    concept: 'OccupancyCostRatio',
    description: 'Occupancy cost over tenant sales; the main affordability indicator for tenants.',
    expression: 'occupancy_cost / NULLIF(tenant_sales, 0)',
  },
  {
    name: 'visitors',
    concept: 'Visitors',
    description: 'Visitors counted at entrances.',
    expression: 'SUM(footfall_counts.visitors)',
  },
  {
    name: 'operating_revenue',
    concept: 'OperatingRevenue',
    description: 'Ledger income classified as operating revenue.',
    expression:
      "SUM(CASE WHEN journal_lines.noi_class = 'revenue' THEN journal_lines.amount ELSE 0 END)",
  },
  {
    name: 'operating_expense_total',
    concept: 'OperatingExpenseTotal',
    description: 'Ledger operating expenses as a positive amount.',
    expression:
      "SUM(CASE WHEN journal_lines.noi_class = 'opex' THEN -journal_lines.amount ELSE 0 END)",
  },
  {
    name: 'net_operating_income',
    concept: 'NetOperatingIncome',
    description:
      'Operating revenue minus operating expenses. Depreciation, financing and other excluded lines do not count.',
    expression: 'operating_revenue - operating_expense_total',
  },
  {
    name: 'noi_margin',
    concept: 'NoiMargin',
    description: 'Net operating income over operating revenue.',
    expression: 'net_operating_income / NULLIF(operating_revenue, 0)',
  },
  {
    name: 'parking_revenue',
    concept: 'ParkingRevenue',
    description: 'Parking revenue.',
    expression: 'SUM(parking_activity.revenue)',
  },
  {
    name: 'payroll_cost',
    concept: 'PayrollCost',
    description:
      'Payroll amounts borne by the employer: salary, overtime, benefits and employer social charges. Employee deductions are excluded.',
    expression:
      'SUM(CASE WHEN payroll_lines.employer_cost = 1 THEN payroll_lines.amount ELSE 0 END)',
  },
  {
    name: 'headcount',
    concept: 'Headcount',
    description:
      'Distinct employees paid. Not additive across months or departments that share employees.',
    expression: 'COUNT(DISTINCT payroll_lines.employee_id)',
  },
  {
    name: 'purchase_spend',
    concept: 'PurchaseSpend',
    description: 'Ordered quantity times unit price on purchase-order lines.',
    expression: 'SUM(purchase_order_lines.line_amount)',
  },
  {
    name: 'payables_outstanding',
    concept: 'PayablesOutstanding',
    description:
      'Supplier invoice amounts not yet paid at the reporting date, net of withheld taxes.',
    expression: 'SUM(supplier_invoices.open_amount)',
  },
];
// KPI attributes stored as SEMANTIC_WORKBENCH extensions: label, type, additivity, unit, owner,
// status, time dimension and the concept each KPI is about (`of`, in the mapping).
const month = {
  dimension: 'calendar_months.first_day',
  min_grain: 'month',
  allowed_grains: ['month', 'quarter', 'year'],
};
const stock = {
  additivity: 'semi_additive',
  non_additive_over: 'time',
  period_aggregation: 'last',
};
const atProperty = ['properties.name', 'calendar_months.year_month'];
const kpis: Record<string, { of: string; ext: any }> = {
  total_gla: {
    of: 'Property',
    ext: {
      label: 'Total GLA',
      type: 'simple',
      ...stock,
      unit: 'm²',
      format: '#,##0',
      owner: 'Leasing',
      status: 'approved',
      time: month,
      dimensions: atProperty,
    },
  },
  occupied_gla: {
    of: 'Property',
    ext: {
      label: 'Occupied GLA',
      type: 'simple',
      ...stock,
      unit: 'm²',
      format: '#,##0',
      owner: 'Leasing',
      status: 'approved',
      time: month,
      dimensions: atProperty,
    },
  },
  vacant_gla: {
    of: 'Property',
    ext: {
      label: 'Vacant GLA',
      type: 'simple',
      ...stock,
      unit: 'm²',
      format: '#,##0',
      owner: 'Leasing',
      status: 'approved',
      time: month,
      dimensions: atProperty,
    },
  },
  occupancy_rate: {
    of: 'Property',
    ext: {
      label: 'Occupancy rate',
      type: 'ratio',
      numerator: 'occupied_gla',
      denominator: 'total_gla',
      additivity: 'non_additive',
      unit: 'ratio',
      format: '0.0%',
      owner: 'Leasing',
      status: 'approved',
      time: month,
      dimensions: atProperty,
      targets: [{ grain: 'month', direction: 'higher_is_better', value: 0.95 }],
    },
  },
  contracted_minimum_rent: {
    of: 'Lease',
    ext: {
      label: 'Contracted minimum rent',
      type: 'simple',
      ...stock,
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Leasing',
      status: 'approved',
      time: month,
      dimensions: atProperty,
    },
  },
  minimum_rent_per_m2: {
    of: 'Property',
    ext: {
      label: 'Minimum rent per m²',
      type: 'ratio',
      numerator: 'contracted_minimum_rent',
      denominator: 'occupied_gla',
      additivity: 'non_additive',
      unit: 'BRL/m²',
      format: '#,##0.00',
      owner: 'Leasing',
      status: 'approved',
      time: month,
      dimensions: atProperty,
    },
  },
  billed_amount: {
    of: 'Lease',
    ext: {
      label: 'Billed amount',
      type: 'simple',
      additivity: 'additive',
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Finance',
      status: 'approved',
      time: month,
      dimensions: ['charge_types.name', 'calendar_months.year_month'],
    },
  },
  collected_amount: {
    of: 'Lease',
    ext: {
      label: 'Collected amount',
      type: 'simple',
      additivity: 'additive',
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Finance',
      status: 'approved',
      time: month,
      dimensions: ['charge_types.name', 'calendar_months.year_month'],
    },
  },
  open_amount: {
    of: 'Lease',
    ext: {
      label: 'Open amount',
      type: 'simple',
      ...stock,
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Finance',
      status: 'approved',
      time: month,
      dimensions: ['charge_types.name', 'calendar_months.year_month'],
    },
  },
  delinquency_rate: {
    of: 'Lease',
    ext: {
      label: 'Delinquency rate',
      type: 'ratio',
      numerator: 'open_amount',
      denominator: 'billed_amount',
      additivity: 'non_additive',
      unit: 'ratio',
      format: '0.0%',
      owner: 'Finance',
      status: 'approved',
      time: month,
      dimensions: ['charge_types.name', 'calendar_months.year_month'],
      targets: [{ grain: 'month', direction: 'lower_is_better', value: 0.05 }],
    },
  },
  tenant_sales: {
    of: 'Tenant',
    ext: {
      label: 'Tenant sales',
      type: 'simple',
      additivity: 'additive',
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Leasing',
      status: 'approved',
      time: month,
      dimensions: ['merchandise_categories.name', 'calendar_months.year_month'],
    },
  },
  reporting_area: {
    of: 'Tenant',
    ext: {
      label: 'Reporting area',
      type: 'simple',
      ...stock,
      unit: 'm²',
      format: '#,##0',
      owner: 'Leasing',
      status: 'approved',
      time: month,
      dimensions: ['merchandise_categories.name', 'calendar_months.year_month'],
    },
  },
  sales_per_m2: {
    of: 'Tenant',
    ext: {
      label: 'Sales per m²',
      type: 'ratio',
      numerator: 'tenant_sales',
      denominator: 'reporting_area',
      additivity: 'non_additive',
      unit: 'BRL/m²',
      format: '#,##0.00',
      owner: 'Leasing',
      status: 'approved',
      time: month,
      dimensions: ['merchandise_categories.name', 'calendar_months.year_month'],
    },
  },
  occupancy_cost: {
    of: 'Tenant',
    ext: {
      label: 'Occupancy cost',
      type: 'simple',
      additivity: 'additive',
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Leasing',
      status: 'approved',
      time: month,
      dimensions: atProperty,
    },
  },
  occupancy_cost_ratio: {
    of: 'Tenant',
    ext: {
      label: 'Occupancy cost ratio',
      type: 'ratio',
      numerator: 'occupancy_cost',
      denominator: 'tenant_sales',
      additivity: 'non_additive',
      unit: 'ratio',
      format: '0.0%',
      owner: 'Leasing',
      status: 'approved',
      time: month,
      dimensions: atProperty,
      targets: [{ direction: 'lower_is_better', value: 0.12 }],
    },
  },
  visitors: {
    of: 'Property',
    ext: {
      label: 'Visitors',
      type: 'simple',
      additivity: 'additive',
      unit: 'visitors',
      format: '#,##0',
      owner: 'Marketing',
      status: 'approved',
      time: month,
      dimensions: atProperty,
    },
  },
  operating_revenue: {
    of: 'Property',
    ext: {
      label: 'Operating revenue',
      type: 'simple',
      additivity: 'additive',
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Finance',
      status: 'approved',
      time: month,
      dimensions: atProperty,
    },
  },
  operating_expense_total: {
    of: 'Property',
    ext: {
      label: 'Operating expenses',
      type: 'simple',
      additivity: 'additive',
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Finance',
      status: 'approved',
      time: month,
      dimensions: atProperty,
    },
  },
  net_operating_income: {
    of: 'Property',
    ext: {
      label: 'Net operating income (NOI)',
      type: 'derived',
      inputs: ['operating_revenue', 'operating_expense_total'],
      additivity: 'additive',
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Finance',
      status: 'approved',
      time: month,
      dimensions: atProperty,
    },
  },
  noi_margin: {
    of: 'Property',
    ext: {
      label: 'NOI margin',
      type: 'ratio',
      numerator: 'net_operating_income',
      denominator: 'operating_revenue',
      additivity: 'non_additive',
      unit: 'ratio',
      format: '0.0%',
      owner: 'Finance',
      status: 'approved',
      time: month,
      dimensions: atProperty,
    },
  },
  parking_revenue: {
    of: 'ParkingFacility',
    ext: {
      label: 'Parking revenue',
      type: 'simple',
      additivity: 'additive',
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Operations',
      status: 'approved',
      time: month,
    },
  },
  payroll_cost: {
    of: 'CostCenter',
    ext: {
      label: 'Payroll cost',
      type: 'simple',
      additivity: 'additive',
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'People',
      status: 'approved',
      time: month,
      dimensions: ['departments.name', 'calendar_months.year_month'],
    },
  },
  headcount: {
    of: 'Employee',
    ext: {
      label: 'Headcount',
      type: 'simple',
      additivity: 'non_additive',
      unit: 'people',
      format: '#,##0',
      owner: 'People',
      status: 'approved',
      time: month,
      dimensions: ['departments.name', 'calendar_months.year_month'],
    },
  },
  purchase_spend: {
    of: 'Supplier',
    ext: {
      label: 'Purchase spend',
      type: 'simple',
      additivity: 'additive',
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Procurement',
      status: 'proposed',
      time: {
        dimension: 'purchase_orders.order_date',
        min_grain: 'day',
        allowed_grains: ['day', 'week', 'month', 'quarter', 'year'],
      },
      dimensions: ['expense_categories.name'],
    },
  },
  payables_outstanding: {
    of: 'Supplier',
    ext: {
      label: 'Payables outstanding',
      type: 'simple',
      ...stock,
      unit: 'BRL',
      format: '#,##0.00',
      owner: 'Procurement',
      status: 'approved',
      time: month,
    },
  },
};
// Metric extensions are pretty-printed JSON; KPI bindings are one binding per line, sorted by
// metric.
const extension = (data: string) => [{ vendor_name: 'SEMANTIC_WORKBENCH', data: data + '\n' }];
const keyPerLine = (data: Record<string, unknown>) =>
  `{\n${Object.entries(data)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(',\n')}\n}`;
const bindingsJson = (schema: string, list: any[]) =>
  `{"schema": ${JSON.stringify(schema)}, "kpi_bindings": [\n${list.map(b => '  ' + JSON.stringify(b)).join(',\n')}\n]}`;
const computed: Record<string, [string, string, string]> = {
  occupancy_snapshots: [
    'vacant_gla_m2',
    'gla_m2 - occupied_gla_m2',
    'Gross leasable area without an active lease.',
  ],
  charges: ['open_amount', 'amount - paid_amount', 'Billed amount not yet collected.'],
  purchase_order_lines: ['line_amount', 'quantity * unit_price', 'Ordered amount.'],
  supplier_invoices: [
    'open_amount',
    'gross_amount - withheld_taxes - paid_amount',
    'Amount still payable to the supplier.',
  ],
};

// Shared definitions keep the generated formats consistent.
type Attr = { name: string; type: string; flags: string; description: string; owner: string };
type Link = {
  name: string;
  target: string;
  flags: string;
  phrase: string;
  description: string;
  owner: string;
};
const byConcept = new Map(defs.map(d => [d.concept, d]));
const attrsOf = (d: Def): Attr[] =>
  (d.attrs ?? []).map(s => {
    const [name, type, flags, description] = s.split('|');
    return { name, type, flags, description, owner: d.concept };
  });
const linksOf = (d: Def): Link[] =>
  (d.links ?? []).map(s => {
    const [head, flags, phrase, description] = s.split('|');
    const [name, target] = head.split('>');
    return { name, target, flags, phrase, description, owner: d.concept };
  });
const ancestors = (d: Def): Def[] =>
  (d.extends ?? []).flatMap(p => {
    const parent = byConcept.get(p)!;
    return [...ancestors(parent), parent];
  });
const allAttrs = (d: Def) => [...ancestors(d), d].flatMap(attrsOf);
const allLinks = (d: Def) => [...ancestors(d), d].flatMap(linksOf);
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1);
const relIri = (owner: string, name: string) =>
  `${byConcept.get(owner)!.module}:${lowerFirst(owner)}${name[0].toUpperCase()}${camel(name).slice(1)}`;
const words = (s: string) => s.replace(/_/g, ' ');
const valueBase = new Map(valueTypes.map(([n, b]) => [n, b]));
const concrete = defs.filter(d => d.table);
for (const d of defs) {
  for (const p of d.extends ?? [])
    if (!byConcept.has(p)) throw Error(`${d.concept} extends unknown ${p}`);
  for (const l of linksOf(d)) {
    const t = byConcept.get(l.target);
    if (!t?.table) throw Error(`${d.concept}.${l.name} targets ${l.target}, which has no table`);
  }
  for (const a of attrsOf(d))
    if (!valueBase.has(a.type)) throw Error(`${d.concept}.${a.name}: unknown value type ${a.type}`);
}

const ontology: any = {
  version: '0.2.0.dev0',
  name: 'Shopping center administration ontology',
  description:
    'Fictional reference model for administering shopping centers and other retail real estate: assets and space, tenants and brands, the leasing pipeline, leases and their clauses, service charges and operations, billing and collections, accounting and investor distributions, and performance facts. Each module has its own namespace.',
  ai_context: {
    instructions:
      'Gross leasable area (GLA, Portuguese ABL) counts only leasable units. Occupancy is measured on area, not unit count, from month-end snapshots; never sum area across months. Minimum rent and percentage rent are separate charges; percentage rent is billed only when rate × gross sales exceeds minimum rent. A thirteenth minimum rent may be billed in December. Service charges recover shared operating costs; the marketing fund is a separate tenant contribution. Key money or right-of-use fees are not rent. A charge has a contracted tenant (through its lease) and a billed tenant (through its invoice); do not treat these roles as interchangeable. Lease permitted use is the tenant-mix category of record. All fixture amounts are in Brazilian reais (BRL).',
    synonyms: [
      'shopping mall',
      'shopping center administration',
      'retail real estate',
      'property management',
      'ABL',
      'condomínio',
      'fundo de promoção',
    ],
  },
  prefixes,
  ontology: [],
};
for (const d of defs) {
  const component: any = {
    concept: d.concept,
    type: 'EntityType',
    iri: `${d.module}:${d.concept}`,
    description: d.description,
  };
  if (d.extends) component.extends = d.extends;
  else component.identify_by = ['id'];
  const relationships: any[] = d.extends
    ? []
    : [
        {
          name: 'id',
          iri: relIri(d.concept, 'id'),
          description: `Identifier of the ${words(d.concept)}.`,
          roles: [{ concept: 'Identifier' }],
          multiplicity: 'OneToOne',
          verbalizes: [`{${d.concept}} is identified by {Identifier}`],
        },
      ];
  for (const a of attrsOf(d))
    relationships.push({
      name: a.name,
      iri: relIri(d.concept, a.name),
      description: a.description,
      roles: [{ concept: a.type }],
      multiplicity: 'ManyToOne',
      verbalizes: [`{${d.concept}} has ${words(a.name)} {${a.type}}`],
    });
  for (const l of linksOf(d))
    relationships.push({
      name: l.name,
      iri: relIri(d.concept, l.name),
      description: l.description,
      roles: [{ concept: l.target }],
      multiplicity: 'ManyToOne',
      verbalizes: [
        l.target === d.concept
          ? `{${d.concept}} ${l.phrase} another {${l.target}}`
          : `{${d.concept}} ${l.phrase} {${l.target}}`,
      ],
    });
  component.relationships = relationships;
  ontology.ontology.push(component);
}
for (const [name, builtin, description] of valueTypes)
  ontology.ontology.push({
    concept: name,
    type: 'ValueType',
    iri: `core:${name}`,
    extends: [builtin],
    description,
  });
for (const m of metrics)
  ontology.ontology.push({
    concept: m.concept,
    type: 'ValueType',
    iri: `kpi:${m.concept}`,
    extends: ['Decimal'],
    description: m.description,
  });

const expr = (expression: string) => ({ dialects: [{ dialect: 'ANSI_SQL', expression }] });
const columnsOf = (d: Def) => [
  'id',
  ...allAttrs(d).map(a => a.name),
  ...allLinks(d).map(l => l.name + '_id'),
];
const semantic: any = {
  version: '0.2.0.dev0',
  name: 'Shopping center administration semantic model',
  description:
    'One dataset per concrete business concept. Facts: occupancy_snapshots (unit-month), charges (lease-charge type-month), sales_reports (lease-month), footfall_counts (entrance-period), journal_lines (ledger line) and parking_activity (facility-month).',
  ai_context: {
    instructions:
      'Use governed metrics by name. Area metrics are month-end stocks: filter or group by month. A charge reaches tenants through its lease (contracted tenant) and through its invoice (billed tenant); choose the role explicitly. Properties are reached from occupancy through unit, zone, floor and building.',
  },
  datasets: [],
  relationships: [],
  metrics: metrics.map(m => ({
    name: m.name,
    description: m.description,
    expression: expr(m.expression),
    custom_extensions: extension(
      keyPerLine({ schema: 'semantic-workbench/metric/v1', ...kpis[m.name].ext }),
    ),
  })),
};
for (const d of concrete) {
  const fields: any[] = columnsOf(d).map(name => ({ name, expression: expr(name) }));
  const extra = computed[d.table!];
  if (extra) fields.push({ name: extra[0], description: extra[2], expression: expr(extra[1]) });
  semantic.datasets.push({
    name: d.table,
    source: `mall.${d.table}`,
    description: d.description,
    primary_key: ['id'],
    fields,
  });
  for (const l of allLinks(d))
    semantic.relationships.push({
      name: `${d.table}_${l.name}`,
      from: d.table,
      to: byConcept.get(l.target)!.table,
      from_columns: [l.name + '_id'],
      to_columns: ['id'],
    });
}

const mapping: any = {
  version: '0.2.0.dev0',
  name: 'Shopping center administration mappings',
  description:
    'Maps every concrete concept, attribute and link to its dataset and every KPI concept to its governed metric.',
  ontology_ref: { name: ontology.name, iri: './mall.ontology.yaml' },
  semantic_model_ref: { name: semantic.name, iri: './mall.semantic.yaml' },
  concept_mappings: [],
};
for (const d of concrete) {
  const t = d.table!;
  const id = { referent_mappings: [{ relationship: 'id', expression: `${t}.id` }] };
  mapping.concept_mappings.push({
    concept: d.concept,
    object_mappings: [id],
    link_mappings: [
      {
        object_mapping: id,
        children: [
          ...allAttrs(d).map(a => ({
            relationship: a.name,
            object_mapping: { concept: a.type, expression: `${t}.${a.name}` },
          })),
          ...allLinks(d).map(l => ({
            relationship: l.name,
            object_mapping: {
              concept: l.target,
              referent_mappings: [{ relationship: 'id', expression: `${t}.${l.name}_id` }],
            },
          })),
        ],
      },
    ],
  });
}
for (const m of metrics)
  mapping.concept_mappings.push({ concept: m.concept, object_mappings: [{ expression: m.name }] });
mapping.custom_extensions = extension(
  bindingsJson(
    'semantic-workbench/mapping/v1',
    [...metrics]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => ({ metric: m.name, measures: `kpi:${m.concept}`, of: kpis[m.name].of })),
  ),
);

const months = [
  {
    id: 1,
    year_month: '2026-08',
    year: 2026,
    month_number: 8,
    quarter: '2026-Q3',
    first_day: '2026-08-01',
  },
  {
    id: 2,
    year_month: '2026-09',
    year: 2026,
    month_number: 9,
    quarter: '2026-Q3',
    first_day: '2026-09-01',
  },
];
const monthEnd: Record<number, string> = { 1: '2026-08-31', 2: '2026-09-30' };
const monthStart: Record<number, string> = { 1: '2026-08-01', 2: '2026-09-01' };
const rows: Record<string, Record<string, any>[]> = {
  countries: [{ id: 1, name: 'Brazil', iso_code: 'BR' }],
  state_provinces: [{ id: 1, name: 'São Paulo', code: 'SP', country_id: 1 }],
  cities: [
    { id: 1, name: 'Campinas', state_id: 1 },
    { id: 2, name: 'Sorocaba', state_id: 1 },
  ],
  addresses: [
    { id: 1, street: 'Avenida das Palmeiras', street_number: '1000', city_id: 1 },
    { id: 2, street: 'Rodovia do Litoral', street_number: 'km 12', city_id: 2 },
  ],
  currencies: [{ id: 1, name: 'Brazilian real', iso_code: 'BRL' }],
  calendar_months: months,
  organizations: [
    { id: 1, name: 'Aurora Asset Management', organization_type: 'asset manager' },
    { id: 2, name: 'Aurora Administradora', organization_type: 'property administrator' },
    { id: 3, name: 'Aurora Shopping SPE', organization_type: 'company', parent_organization_id: 1 },
    { id: 4, name: 'Brisa Outlet SPE', organization_type: 'company', parent_organization_id: 1 },
    { id: 5, name: 'Magazine Norte' },
    { id: 6, name: 'Linha Moda' },
    { id: 7, name: 'Passo Calçados' },
    { id: 8, name: 'Sabor Grill' },
    { id: 9, name: 'Conserta Já' },
    { id: 10, name: 'Ventura Esportes' },
    { id: 11, name: 'Limpa Bem Serviços', organization_type: 'company' },
    { id: 12, name: 'Guarda Forte Segurança', organization_type: 'company' },
  ],
  legal_entities: [
    {
      id: 1,
      registration_number: 'SPE-0001',
      entity_type: 'special-purpose company',
      organization_id: 3,
    },
    {
      id: 2,
      registration_number: 'SPE-0002',
      entity_type: 'special-purpose company',
      organization_id: 4,
    },
    { id: 3, registration_number: 'ADM-0001', entity_type: 'administrator', organization_id: 2 },
  ],
  contract_types: [
    { id: 1, code: 'LEASE', name: 'Lease', requires_legal_review: 1 },
    { id: 2, code: 'SERVICE', name: 'Service', requires_legal_review: 0 },
    { id: 3, code: 'EMPLOY', name: 'Employment', requires_legal_review: 0 },
    { id: 4, code: 'SUPPLY', name: 'Supply framework', requires_legal_review: 1 },
  ],
  cost_centers: [
    { id: 1, code: 'CC-AUR', name: 'Aurora Shopping', property_id: 1 },
    { id: 2, code: 'CC-BRS', name: 'Brisa Outlet', property_id: 2 },
    { id: 3, code: 'CC-CORP', name: 'Corporate' },
  ],
  people: [
    { id: 1, name: 'Ana Prado' },
    { id: 2, name: 'Bruno Lima' },
    { id: 3, name: 'Carla Reis' },
    { id: 4, name: 'Diego Souza' },
  ],
  departments: [
    { id: 1, code: 'OPS', name: 'Property operations', legal_entity_id: 3, cost_center_id: 1 },
    { id: 2, code: 'FIN', name: 'Finance', legal_entity_id: 3, cost_center_id: 3 },
    { id: 3, code: 'LEA', name: 'Leasing', legal_entity_id: 3, cost_center_id: 3 },
  ],
  positions: [
    { id: 1, code: 'GM', title: 'General manager', department_id: 1 },
    { id: 2, code: 'MT', title: 'Maintenance technician', department_id: 1 },
    { id: 3, code: 'AP', title: 'Accounts payable analyst', department_id: 2 },
    { id: 4, code: 'LM', title: 'Leasing manager', department_id: 3 },
  ],
  employees: [
    {
      id: 1,
      employee_number: 'E001',
      hire_date: '2019-02-01',
      person_id: 1,
      position_id: 1,
      employer_id: 3,
      work_site_id: 1,
    },
    {
      id: 2,
      employee_number: 'E002',
      hire_date: '2021-07-12',
      person_id: 2,
      position_id: 2,
      employer_id: 3,
      manager_id: 1,
      work_site_id: 1,
    },
    {
      id: 3,
      employee_number: 'E003',
      hire_date: '2022-03-01',
      person_id: 3,
      position_id: 3,
      employer_id: 3,
    },
    {
      id: 4,
      employee_number: 'E004',
      hire_date: '2026-09-01',
      person_id: 4,
      position_id: 4,
      employer_id: 3,
    },
  ],
  suppliers: [
    {
      id: 1,
      supplier_category: 'cleaning',
      payment_terms_days: 30,
      is_approved: 1,
      organization_id: 11,
    },
    {
      id: 2,
      supplier_category: 'security',
      payment_terms_days: 30,
      is_approved: 1,
      organization_id: 12,
    },
  ],
  expense_categories: [
    { id: 1, code: 'CLN', name: 'Cleaning', recoverable: 1 },
    { id: 2, code: 'SEC', name: 'Security', recoverable: 1 },
    { id: 3, code: 'MNT', name: 'Maintenance', recoverable: 1 },
  ],
  portfolios: [
    {
      id: 1,
      name: 'Aurora Retail Portfolio',
      strategy: 'Core regional malls',
      asset_manager_id: 1,
    },
  ],
  properties: [
    {
      id: 1,
      code: 'AUR',
      name: 'Aurora Shopping',
      property_format: 'regional',
      opening_date: '2012-04-20',
      total_gla_m2: 2542,
      parking_spaces: 900,
      portfolio_id: 1,
      address_id: 1,
      currency_id: 1,
      administrator_id: 2,
    },
    {
      id: 2,
      code: 'BRS',
      name: 'Brisa Outlet',
      property_format: 'outlet',
      opening_date: '2019-11-08',
      total_gla_m2: 550,
      parking_spaces: 300,
      portfolio_id: 1,
      address_id: 2,
      currency_id: 1,
      administrator_id: 2,
    },
  ],
  buildings: [
    { id: 1, code: 'AUR-M', name: 'Aurora mall', property_id: 1 },
    { id: 2, code: 'BRS-M', name: 'Brisa mall', property_id: 2 },
  ],
  floors: [
    { id: 1, code: 'L1', name: 'Ground level', level_number: 1, building_id: 1 },
    { id: 2, code: 'L2', name: 'Upper level', level_number: 2, building_id: 1 },
    { id: 3, code: 'L1', name: 'Outlet level', level_number: 1, building_id: 2 },
  ],
  zones: [
    { id: 1, code: 'L1-A', name: 'Main avenue', floor_id: 1 },
    { id: 2, code: 'L2-A', name: 'Food and leisure', floor_id: 2 },
    { id: 3, code: 'O-A', name: 'Outlet street', floor_id: 3 },
  ],
  unit_types: [
    { id: 1, code: 'ANC', name: 'Anchor', counts_as_gla: 1 },
    { id: 2, code: 'INL', name: 'Inline store', counts_as_gla: 1 },
    { id: 3, code: 'FC', name: 'Food court', counts_as_gla: 1 },
    { id: 4, code: 'KSK', name: 'Kiosk', counts_as_gla: 1 },
  ],
  units: [
    { id: 1, code: 'AUR-101', name: 'Anchor north', area_m2: 2000, zone_id: 1, unit_type_id: 1 },
    { id: 2, code: 'AUR-110', area_m2: 150, zone_id: 1, unit_type_id: 2 },
    { id: 3, code: 'AUR-112', area_m2: 120, zone_id: 1, unit_type_id: 2 },
    { id: 4, code: 'AUR-205', area_m2: 60, zone_id: 2, unit_type_id: 3 },
    { id: 5, code: 'AUR-K01', area_m2: 12, zone_id: 2, unit_type_id: 4 },
    { id: 6, code: 'AUR-220', area_m2: 200, zone_id: 2, unit_type_id: 2 },
    { id: 7, code: 'BRS-01', area_m2: 300, zone_id: 3, unit_type_id: 2 },
    { id: 8, code: 'BRS-02', area_m2: 250, zone_id: 3, unit_type_id: 2 },
  ],
  entrances: [
    { id: 1, code: 'AUR-E1', name: 'Main entrance', entrance_kind: 'pedestrian', property_id: 1 },
    { id: 2, code: 'AUR-E2', name: 'Parking entrance', entrance_kind: 'parking', property_id: 1 },
    { id: 3, code: 'BRS-E1', name: 'Outlet entrance', entrance_kind: 'pedestrian', property_id: 2 },
  ],
  parking_facilities: [
    {
      id: 1,
      code: 'AUR-P',
      name: 'Aurora parking',
      area_m2: 22000,
      capacity: 900,
      is_paid: 1,
      property_id: 1,
    },
    {
      id: 2,
      code: 'BRS-P',
      name: 'Brisa parking',
      area_m2: 7500,
      capacity: 300,
      is_paid: 0,
      property_id: 2,
    },
  ],
  merchandise_categories: [
    { id: 1, code: 'RET', name: 'Retail' },
    { id: 2, code: 'DEP', name: 'Department store', parent_category_id: 1 },
    { id: 3, code: 'APP', name: 'Apparel', parent_category_id: 1 },
    { id: 4, code: 'FTW', name: 'Footwear', parent_category_id: 1 },
    { id: 5, code: 'FOOD', name: 'Food court' },
    { id: 6, code: 'SRV', name: 'Services' },
    { id: 7, code: 'SPT', name: 'Sports', parent_category_id: 1 },
  ],
  tenants: [
    { id: 1, trade_name: 'Norte', organization_id: 5 },
    { id: 2, trade_name: 'Linha', organization_id: 6 },
    { id: 3, trade_name: 'Passo', organization_id: 7 },
    { id: 4, trade_name: 'Sabor Grill', organization_id: 8 },
    { id: 5, trade_name: 'Conserta Já', organization_id: 9 },
    { id: 6, trade_name: 'Ventura', organization_id: 10 },
  ],
  brands: [
    { id: 1, name: 'Norte', owner_id: 1 },
    { id: 2, name: 'Linha', owner_id: 2 },
    { id: 3, name: 'Passo', owner_id: 3 },
    { id: 4, name: 'Sabor Grill', owner_id: 4 },
    { id: 5, name: 'Conserta Já', owner_id: 5 },
    { id: 6, name: 'Linha Outlet', owner_id: 2 },
    { id: 7, name: 'Ventura', owner_id: 6 },
  ],
  lease_statuses: [
    { id: 1, code: 'ACT', name: 'Active' },
    { id: 2, code: 'FIT', name: 'Fit-out' },
  ],
  charge_types: [
    { id: 1, code: 'MIN', name: 'Minimum rent', revenue_class: 'rent' },
    { id: 2, code: 'PCT', name: 'Percentage rent', revenue_class: 'rent' },
    { id: 3, code: 'SVC', name: 'Service charge', revenue_class: 'recoveries' },
    { id: 4, code: 'MKT', name: 'Marketing fund', revenue_class: 'marketing' },
  ],
  ledger_accounts: [
    { id: 1, code: '4.1', name: 'Rental income', account_class: 'revenue' },
    { id: 2, code: '4.2', name: 'Parking income', account_class: 'revenue' },
    {
      id: 3,
      code: '5.1',
      name: 'Non-recoverable operating expenses',
      account_class: 'operating expense',
    },
    { id: 4, code: '6.1', name: 'Depreciation', account_class: 'non-operating' },
  ],
};
// Leases: [id, tenant, brand, unit, category, start, minimum rent, percentage rate].
const leaseSpec: [number, number, number, number, number, string, number, number][] = [
  [1, 1, 1, 1, 2, '2020-01-01', 60000, 0.02],
  [2, 2, 2, 2, 3, '2021-03-01', 18000, 0.07],
  [3, 3, 3, 3, 4, '2022-06-01', 14400, 0.06],
  [4, 4, 4, 4, 5, '2023-02-01', 12000, 0.08],
  [5, 5, 5, 5, 6, '2024-05-01', 4000, 0.1],
  [6, 2, 6, 7, 3, '2022-09-01', 21000, 0.06],
  [7, 6, 7, 8, 7, '2026-09-01', 17500, 0.06],
];
const unitArea = new Map(rows.units.map(u => [u.id, u.area_m2]));
const unitProperty = (unit: number) => (unit <= 6 ? 1 : 2);
rows.contracts = leaseSpec.map(([id, tenant, , unit, , start, rent]) => ({
  id,
  contract_number: `L-${String(id).padStart(4, '0')}`,
  title: `Lease of ${rows.units[unit - 1].code} to ${rows.tenants[tenant - 1].trade_name}`,
  start_date: start,
  end_date: `${Number(start.slice(0, 4)) + 5}${start.slice(4)}`,
  status: 'active',
  total_value: rent * 60,
  contract_type_id: 1,
  contracting_entity_id: unitProperty(unit),
  currency_id: 1,
}));
rows.leases = leaseSpec.map(([id, tenant, brand, , category, , rent]) => ({
  id,
  term_months: 60,
  monthly_minimum_rent: rent,
  has_thirteenth_rent: 1,
  contract_id: id,
  tenant_id: tenant,
  brand_id: brand,
  status_id: 1,
  permitted_use_id: category,
}));
rows.leased_units = leaseSpec.map(([id, , , unit, , start]) => ({
  id,
  start_date: start,
  leased_area_m2: unitArea.get(unit),
  lease_id: id,
  unit_id: unit,
}));
rows.percentage_rent_clauses = leaseSpec.map(([id, , , , , start, , rate]) => ({
  id,
  clause_reference: '5.2',
  effective_from: start,
  rate,
  excludes_thirteenth_rent: 1,
  lease_id: id,
}));
const active = (lease: (typeof leaseSpec)[number], month: number) => lease[5] <= monthEnd[month];
// Declared gross sales per lease and month.
const sales: Record<number, [number, number]> = {
  1: [1600000, 1900000],
  2: [240000, 310000],
  3: [150000, 160000],
  4: [180000, 175000],
  5: [30000, 52000],
  6: [330000, 400000],
  7: [0, 210000],
};
// Paid fraction of each lease's charges at the reporting date: lease 3 has not paid September;
// lease 5 paid half of September.
const paidFraction = (lease: number, month: number) =>
  month === 2 && lease === 3 ? 0 : month === 2 && lease === 5 ? 0.5 : 1;
const serviceChargePerM2 = 30;
const marketingRate = 0.1;
rows.occupancy_snapshots = [];
rows.charges = [];
rows.invoices = [];
rows.sales_reports = [];
for (const m of months)
  for (const u of rows.units) {
    const lease = leaseSpec.find(l => l[3] === u.id && active(l, m.id));
    rows.occupancy_snapshots.push({
      id: rows.occupancy_snapshots.length + 1,
      gla_m2: u.area_m2,
      occupied_gla_m2: lease ? u.area_m2 : 0,
      contracted_minimum_rent: lease ? lease[6] : 0,
      unit_id: u.id,
      month_id: m.id,
      lease_id: lease?.[0] ?? null,
    });
    if (!lease) continue;
    const [leaseId, tenant, , unit, , , rent, rate] = lease;
    const gross = sales[leaseId][m.id - 1];
    const invoice = {
      id: rows.invoices.length + 1,
      invoice_number: `${m.year_month}-${String(leaseId).padStart(4, '0')}`,
      issue_date: monthEnd[m.id],
      due_date: monthEnd[m.id],
      property_id: unitProperty(unit),
      billed_tenant_id: tenant,
    };
    rows.invoices.push(invoice);
    const items: [number, number][] = [
      [1, rent],
      [2, Math.max(0, Math.round(gross * rate * 100) / 100 - rent)],
      [3, unitArea.get(unit) * serviceChargePerM2],
      [4, rent * marketingRate],
    ];
    let occupancy = 0;
    for (const [type, amount] of items) {
      if (!amount) continue;
      occupancy += amount;
      rows.charges.push({
        id: rows.charges.length + 1,
        amount,
        paid_amount: amount * paidFraction(leaseId, m.id),
        due_date: monthEnd[m.id],
        invoice_id: invoice.id,
        lease_id: leaseId,
        charge_type_id: type,
        month_id: m.id,
      });
    }
    rows.sales_reports.push({
      id: rows.sales_reports.length + 1,
      gross_sales: gross,
      reported_gla_m2: unitArea.get(unit),
      occupancy_cost: occupancy,
      submitted_date: monthEnd[m.id],
      is_audited: 0,
      lease_id: leaseId,
      property_id: unitProperty(unit),
      month_id: m.id,
    });
  }
rows.footfall_counts = months.flatMap(m =>
  [
    [1, 1, 410000, 455000],
    [2, 1, 120000, 131000],
    [3, 2, 95000, 118000],
  ].map(([entrance, , aug, sep], i) => ({
    id: (m.id - 1) * 3 + i + 1,
    period_start: monthStart[m.id],
    period_end: monthEnd[m.id],
    visitors: m.id === 1 ? aug : sep,
    entrance_id: entrance,
    month_id: m.id,
  })),
);
rows.parking_activity = months.flatMap(m => [
  {
    id: m.id * 2 - 1,
    tickets: m.id === 1 ? 6100 : 6600,
    revenue: m.id === 1 ? 61000 : 66000,
    facility_id: 1,
    month_id: m.id,
  },
  { id: m.id * 2, tickets: m.id === 1 ? 14000 : 16500, revenue: 0, facility_id: 2, month_id: m.id },
]);
// Ledger: rent income from minimum and percentage rent charges, parking income, non-recoverable
// expenses and depreciation.
const opex: Record<number, [number, number]> = { 1: [30000, 32000], 2: [9000, 9500] };
const depreciation: Record<number, number> = { 1: 45000, 2: 12000 };
rows.journal_entries = [];
rows.journal_lines = [];
for (const m of months)
  for (const property of [1, 2]) {
    const entry = {
      id: rows.journal_entries.length + 1,
      entry_date: monthEnd[m.id],
      summary: `Month-end close ${m.year_month}`,
      legal_entity_id: property,
      month_id: m.id,
    };
    rows.journal_entries.push(entry);
    const rent = rows.charges
      .filter(
        c =>
          c.month_id === m.id &&
          [1, 2].includes(c.charge_type_id) &&
          rows.invoices[c.invoice_id - 1].property_id === property,
      )
      .reduce((s, c) => s + c.amount, 0);
    const parking = rows.parking_activity
      .filter(p => p.month_id === m.id && p.facility_id === property)
      .reduce((s, p) => s + p.revenue, 0);
    for (const [account, amount, noi_class] of [
      [1, rent, 'revenue'],
      [2, parking, 'revenue'],
      [3, -opex[property][m.id - 1], 'opex'],
      [4, -depreciation[property], 'excluded'],
    ] as [number, number, string][])
      rows.journal_lines.push({
        id: rows.journal_lines.length + 1,
        amount,
        noi_class,
        entry_id: entry.id,
        account_id: account,
        cost_center_id: property,
      });
  }
// Payroll of the administrator: base salary, employer social charges (20 %) and employee
// withholdings (not an employer cost).
const salary: Record<number, number> = { 1: 25000, 2: 6000, 3: 7500, 4: 14000 };
rows.payroll_runs = months.map(m => ({
  id: m.id,
  payment_date: `${m.year_month}-${m.id === 1 ? '29' : '30'}`,
  status: 'paid',
  legal_entity_id: 3,
  month_id: m.id,
}));
rows.payroll_lines = [];
for (const m of months)
  for (const e of rows.employees.filter(e => e.hire_date <= monthEnd[m.id])) {
    const items: [string, number, number][] = [
      ['base salary', salary[e.id], 1],
      ['employer social charge', salary[e.id] * 0.2, 1],
      ['employee social security', salary[e.id] * 0.11, 0],
    ];
    if (e.id === 2 && m.id === 2) items.push(['overtime', 900, 1]);
    for (const [component, amount, employer_cost] of items)
      rows.payroll_lines.push({
        id: rows.payroll_lines.length + 1,
        component,
        amount,
        employer_cost,
        payroll_run_id: m.id,
        employee_id: e.id,
      });
  }
// Procurement: purchase orders, their lines and the resulting supplier invoices.
rows.purchase_orders = [
  {
    id: 1,
    po_number: 'PO-1001',
    order_date: '2026-08-02',
    status: 'invoiced',
    supplier_id: 1,
    property_id: 1,
    buyer_id: 3,
  },
  {
    id: 2,
    po_number: 'PO-1002',
    order_date: '2026-09-01',
    status: 'invoiced',
    supplier_id: 2,
    property_id: 1,
    buyer_id: 3,
  },
  {
    id: 3,
    po_number: 'PO-1003',
    order_date: '2026-09-03',
    status: 'invoiced',
    supplier_id: 1,
    property_id: 2,
    buyer_id: 3,
  },
];
rows.purchase_order_lines = [
  {
    id: 1,
    summary: 'Common-area cleaning, August',
    quantity: 1,
    unit_price: 18000,
    purchase_order_id: 1,
    category_id: 1,
  },
  {
    id: 2,
    summary: 'Floor polishing',
    quantity: 4,
    unit_price: 750,
    purchase_order_id: 1,
    category_id: 3,
  },
  {
    id: 3,
    summary: 'Security guards, September',
    quantity: 6,
    unit_price: 4200,
    purchase_order_id: 2,
    category_id: 2,
  },
  {
    id: 4,
    summary: 'Outlet cleaning, September',
    quantity: 1,
    unit_price: 7000,
    purchase_order_id: 3,
    category_id: 1,
  },
];
rows.supplier_invoices = rows.purchase_orders.map(po => {
  const gross = rows.purchase_order_lines
    .filter(l => l.purchase_order_id === po.id)
    .reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const withheld = Math.round(gross * 0.11 * 100) / 100;
  return {
    id: po.id,
    invoice_number: `NF-${5000 + po.id}`,
    issue_date: po.order_date,
    due_date: po.order_date,
    gross_amount: gross,
    withheld_taxes: withheld,
    paid_amount: po.id === 2 ? 0 : gross - withheld,
    status: po.id === 2 ? 'approved' : 'paid',
    supplier_id: po.supplier_id,
    payer_id: po.property_id,
    purchase_order_id: po.id,
    month_id: po.order_date < '2026-09-01' ? 1 : 2,
  };
});

// Expected metric values come directly from rows to provide an independent check of SQL.
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const propertyOfUnit = (unit: number) => unitProperty(unit);
const byMonthProperty = <T>(
  xs: T[],
  month: (x: T) => number,
  property: (x: T) => number,
  f: (xs: T[]) => number,
) =>
  Object.fromEntries(
    months.flatMap(m =>
      [1, 2].map(p => [
        `${m.year_month}|${rows.properties[p - 1].name}`,
        f(xs.filter(x => month(x) === m.id && property(x) === p)),
      ]),
    ),
  );
const snap = rows.occupancy_snapshots;
const chg = rows.charges;
const rep = rows.sales_reports;
const jl = rows.journal_lines;
const entryOf = (l: any) => rows.journal_entries[l.entry_id - 1];
const propertyOfLine = (l: any) => rows.cost_centers[l.cost_center_id - 1].property_id;
const expected = {
  counts: {
    entityTypes: defs.length,
    concreteEntityTypes: concrete.length,
    abstractEntityTypes: defs.length - concrete.length,
    valueTypes: valueTypes.length,
    kpiConcepts: metrics.length,
    datasets: semantic.datasets.length,
    joins: semantic.relationships.length,
    metrics: metrics.length,
    modules: Object.keys(modules).length,
  },
  occupancyRateByMonthProperty: byMonthProperty(
    snap,
    s => s.month_id,
    s => propertyOfUnit(s.unit_id),
    xs => sum(xs, s => s.occupied_gla_m2) / sum(xs, s => s.gla_m2),
  ),
  vacantGlaByMonth: Object.fromEntries(
    months.map(m => [
      m.year_month,
      sum(
        snap.filter(s => s.month_id === m.id),
        s => s.gla_m2 - s.occupied_gla_m2,
      ),
    ]),
  ),
  minimumRentPerM2ByMonth: Object.fromEntries(
    months.map(m => {
      const xs = snap.filter(s => s.month_id === m.id);
      return [
        m.year_month,
        sum(xs, s => s.contracted_minimum_rent) / sum(xs, s => s.occupied_gla_m2),
      ];
    }),
  ),
  billedByChargeType: Object.fromEntries(
    rows.charge_types.map(t => [
      t.name,
      sum(
        chg.filter(c => c.charge_type_id === t.id),
        c => c.amount,
      ),
    ]),
  ),
  delinquencyRateByMonth: Object.fromEntries(
    months.map(m => {
      const xs = chg.filter(c => c.month_id === m.id);
      return [m.year_month, sum(xs, c => c.amount - c.paid_amount) / sum(xs, c => c.amount)];
    }),
  ),
  openAmountByMonth: Object.fromEntries(
    months.map(m => [
      m.year_month,
      sum(
        chg.filter(c => c.month_id === m.id),
        c => c.amount - c.paid_amount,
      ),
    ]),
  ),
  salesPerM2ByMonthCategory: Object.fromEntries(
    months.flatMap(m =>
      rows.merchandise_categories
        .map(c => {
          const xs = rep.filter(
            r => r.month_id === m.id && rows.leases[r.lease_id - 1].permitted_use_id === c.id,
          );
          return xs.length
            ? [
                [
                  `${m.year_month}|${c.name}`,
                  sum(xs, r => r.gross_sales) / sum(xs, r => r.reported_gla_m2),
                ],
              ]
            : [];
        })
        .flat(),
    ),
  ),
  occupancyCostRatioByProperty: Object.fromEntries(
    [1, 2].map(p => {
      const xs = rep.filter(r => r.property_id === p);
      return [
        rows.properties[p - 1].name,
        sum(xs, r => r.occupancy_cost) / sum(xs, r => r.gross_sales),
      ];
    }),
  ),
  visitorsByMonthProperty: byMonthProperty(
    rows.footfall_counts,
    f => f.month_id,
    f => rows.entrances[f.entrance_id - 1].property_id,
    xs => sum(xs, f => f.visitors),
  ),
  netOperatingIncomeByMonthProperty: byMonthProperty(
    jl,
    l => entryOf(l).month_id,
    propertyOfLine,
    xs =>
      sum(
        xs.filter(l => l.noi_class !== 'excluded'),
        l => l.amount,
      ),
  ),
  noiMarginByProperty: Object.fromEntries(
    [1, 2].map(p => {
      const xs = jl.filter(l => propertyOfLine(l) === p);
      const revenue = sum(
        xs.filter(l => l.noi_class === 'revenue'),
        l => l.amount,
      );
      return [
        rows.properties[p - 1].name,
        sum(
          xs.filter(l => l.noi_class !== 'excluded'),
          l => l.amount,
        ) / revenue,
      ];
    }),
  ),
  payrollCostByMonthDepartment: Object.fromEntries(
    months.flatMap(m =>
      rows.departments
        .map(d => {
          const xs = rows.payroll_lines.filter(
            l =>
              l.payroll_run_id === m.id &&
              rows.positions[rows.employees[l.employee_id - 1].position_id - 1].department_id ===
                d.id &&
              l.employer_cost,
          );
          return [`${m.year_month}|${d.name}`, sum(xs, l => l.amount)];
        })
        .filter(([, v]) => v),
    ),
  ),
  headcountByMonth: Object.fromEntries(
    months.map(m => [
      m.year_month,
      new Set(rows.payroll_lines.filter(l => l.payroll_run_id === m.id).map(l => l.employee_id))
        .size,
    ]),
  ),
  purchaseSpendByCategory: Object.fromEntries(
    rows.expense_categories.map(c => [
      c.name,
      sum(
        rows.purchase_order_lines.filter(l => l.category_id === c.id),
        l => l.quantity * l.unit_price,
      ),
    ]),
  ),
  payablesOutstandingByMonth: Object.fromEntries(
    months.map(m => [
      m.year_month,
      sum(
        rows.supplier_invoices.filter(i => i.month_id === m.id),
        i => i.gross_amount - i.withheld_taxes - i.paid_amount,
      ),
    ]),
  ),
};

const xsd: Record<string, string> = {
  Integer: 'xsd:integer',
  Decimal: 'xsd:decimal',
  String: 'xsd:string',
  Date: 'xsd:date',
  Boolean: 'xsd:boolean',
};
const datatype = (type: string) =>
  type === 'YearMonth' ? 'xsd:gYearMonth' : xsd[valueBase.get(type)!];
const q = (s: string) => JSON.stringify(s);
const header = (extra: string[] = []) =>
  [
    ...Object.entries(prefixes).map(([p, iri]) => `@prefix ${p}: <${iri}> .`),
    '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .',
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
    '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
    ...extra,
    '',
  ].join('\n');
const label = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase());
// Close matches to schema.org are alignment hints, not equivalence claims.
const schemaMatches: Record<string, string> = {
  Organization: 'schema:Organization',
  Person: 'schema:Person',
  Address: 'schema:PostalAddress',
  City: 'schema:City',
  Country: 'schema:Country',
  Property: 'schema:ShoppingCenter',
  Brand: 'schema:Brand',
  Invoice: 'schema:Invoice',
  Payment: 'schema:PayAction',
  MallEvent: 'schema:Event',
  Lease: 'schema:RentAction',
};
let owl = header([
  '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .',
  '@prefix schema: <https://schema.org/> .',
]);
owl += `<${base}ontology> a owl:Ontology ; rdfs:label ${q('Shopping center administration OWL ontology')} ; rdfs:comment ${q(ontology.description)} ; owl:versionInfo "1.0.0" .\n\n`;
for (const [m, comment] of Object.entries(modules)) owl += `# ${m}: ${comment}\n`;
owl += '\n';
for (const d of defs) {
  const supers = (d.extends ?? []).map(p => `${byConcept.get(p)!.module}:${p}`);
  const required = linksOf(d)
    .filter(l => l.flags.includes('!'))
    .map(
      l =>
        `[ a owl:Restriction ; owl:onProperty ${relIri(d.concept, l.name)} ; owl:someValuesFrom ${byConcept.get(l.target)!.module}:${l.target} ]`,
    );
  owl += `${d.module}:${d.concept} a owl:Class ; rdfs:label ${q(label(d.concept))} ; rdfs:comment ${q(d.description)}${[...supers, ...required].length ? ` ;\n  rdfs:subClassOf ${[...supers, ...required].join(' ,\n    ')}` : ''}${schemaMatches[d.concept] ? ` ;\n  skos:closeMatch ${schemaMatches[d.concept]}` : ''} .\n`;
}
for (const group of [
  ['Organization', 'Person'],
  ['LeasableUnit', 'CommonArea', 'ParkingFacility'],
  [
    'PercentageRentClause',
    'IndexationClause',
    'ExclusivityClause',
    'RadiusClause',
    'CoTenancyClause',
    'RenewalOption',
    'EarlyTerminationOption',
  ],
])
  owl += `[] a owl:AllDisjointClasses ; owl:members ( ${group.map(c => `${byConcept.get(c)!.module}:${c}`).join(' ')} ) .\n`;
owl += '\n';
for (const d of defs) {
  for (const l of linksOf(d))
    owl += `${relIri(d.concept, l.name)} a owl:ObjectProperty, owl:FunctionalProperty ; rdfs:label ${q(words(l.name))} ; rdfs:comment ${q(l.description)} ; rdfs:domain ${d.module}:${d.concept} ; rdfs:range ${byConcept.get(l.target)!.module}:${l.target} .\n`;
  for (const a of attrsOf(d))
    owl += `${relIri(d.concept, a.name)} a owl:DatatypeProperty, owl:FunctionalProperty ; rdfs:label ${q(words(a.name))} ; rdfs:comment ${q(a.description)} ; rdfs:domain ${d.module}:${d.concept} ; rdfs:range ${datatype(a.type)} .\n`;
}
let shacl = header(['@prefix sh: <http://www.w3.org/ns/shacl#> .']);
const dateOrder: [string, string][] = [
  ['start_date', 'end_date'],
  ['effective_from', 'effective_to'],
  ['opened_date', 'closed_date'],
  ['period_start', 'period_end'],
  ['issue_date', 'due_date'],
  ['issue_date', 'expiry_date'],
];
for (const d of defs) {
  const props: [string, string][] = [];
  for (const a of attrsOf(d)) {
    const c = [
      `sh:path ${relIri(d.concept, a.name)}`,
      `sh:name ${q(words(a.name))}`,
      `sh:datatype ${datatype(a.type)}`,
      'sh:maxCount 1',
    ];
    if (a.flags.includes('!')) c.push('sh:minCount 1');
    if (a.flags.includes('+')) c.push('sh:minInclusive 0');
    if (a.flags.includes('%')) c.push('sh:minInclusive 0', 'sh:maxInclusive 1');
    if (['Name', 'Code'].includes(a.type)) c.push('sh:minLength 1');
    const later = dateOrder.find(([from]) => from === a.name)?.[1];
    if (later && attrsOf(d).some(x => x.name === later))
      c.push(`sh:lessThanOrEquals ${relIri(d.concept, later)}`);
    props.push([a.name, c.join(' ; ')]);
  }
  for (const l of linksOf(d))
    props.push([
      l.name,
      `sh:path ${relIri(d.concept, l.name)} ; sh:name ${q(words(l.name))} ; sh:class ${byConcept.get(l.target)!.module}:${l.target} ; sh:maxCount 1${l.flags.includes('!') ? ' ; sh:minCount 1' : ''}`,
    ]);
  // Named property shapes keep each constraint addressable and readable in graph views.
  const shapeIri = (name: string) => `${d.module}:${d.concept}_${camel(name)}Shape`;
  if (props.length)
    shacl +=
      `${d.module}:${d.concept}Shape a sh:NodeShape ; rdfs:label ${q(label(d.concept) + ' requirements')} ; sh:targetClass ${d.module}:${d.concept} ;\n  sh:property ${props.map(([name]) => shapeIri(name)).join(' ,\n    ')} .\n` +
      props
        .map(
          ([name, body]) =>
            `${shapeIri(name)} a sh:PropertyShape ; rdfs:label ${q(`${label(d.concept)}: ${words(name)}`)} ; ${body} .\n`,
        )
        .join('');
}
const literal = (type: string, value: any) => {
  const dt = datatype(type);
  return dt === 'xsd:boolean'
    ? value
      ? 'true'
      : 'false'
    : dt === 'xsd:string'
      ? q(String(value))
      : `${q(String(value))}^^${dt}`;
};
let data = header(['@prefix data: <https://example.org/mall/data/> .']);
for (const d of concrete)
  for (const row of rows[d.table!] ?? []) {
    const labelAttr = allAttrs(d).find(
      a => ['Name', 'Code'].includes(a.type) && row[a.name] != null,
    );
    const parts = [
      `a ${d.module}:${d.concept}`,
      `rdfs:label ${q(labelAttr ? String(row[labelAttr.name]) : `${label(d.concept)} ${row.id}`)}`,
    ];
    for (const a of allAttrs(d))
      if (row[a.name] != null)
        parts.push(`${relIri(a.owner, a.name)} ${literal(a.type, row[a.name])}`);
    for (const l of allLinks(d))
      if (row[l.name + '_id'] != null)
        parts.push(
          `${relIri(l.owner, l.name)} data:${byConcept.get(l.target)!.table}-${row[l.name + '_id']}`,
        );
    data += `data:${d.table}-${row.id} ${parts.join(' ;\n  ')} .\n`;
  }

const logical: Record<string, string> = {
  Integer: 'integer',
  Decimal: 'number',
  String: 'string',
  Date: 'date',
  Boolean: 'boolean',
};
const fieldType = (d: Def, column: string) =>
  column === 'id' || (column.endsWith('_id') && allLinks(d).some(l => l.name + '_id' === column))
    ? 'Integer'
    : valueBase.get(allAttrs(d).find(a => a.name === column)!.type)!;
const contract: any = {
  apiVersion: 'v3.1.0',
  kind: 'DataContract',
  id: '5f0b8a3e-2c41-4d7a-9b6e-8a1c3e5d7f20',
  name: 'Shopping center administration contract',
  version: '1.0.0',
  status: 'active',
  domain: 'Shopping center administration',
  dataProduct: 'Retail real estate operations',
  description: {
    purpose:
      'Governed tables for leasing, billing, operations and performance reporting of shopping centers.',
    limitations: 'Fictional demonstration data in BRL. No real tenants, people or properties.',
  },
  schema: concrete.map(d => ({
    name: d.table,
    physicalName: `mall.${d.table}`,
    physicalType: 'table',
    logicalType: 'object',
    description: d.description,
    authoritativeDefinitions: [
      { type: 'businessDefinition', url: `${prefixes[d.module]}${d.concept}` },
    ],
    properties: columnsOf(d).map(column => {
      const attr = allAttrs(d).find(a => a.name === column);
      const link = allLinks(d).find(l => l.name + '_id' === column);
      return {
        name: column,
        logicalType: logical[fieldType(d, column)],
        required: column === 'id' || !!(attr ?? link)?.flags.includes('!'),
        ...(column === 'id' ? { primaryKey: true, unique: true } : {}),
        description:
          column === 'id'
            ? `Identifier of the ${words(d.concept)}.`
            : attr
              ? attr.description
              : `Reference to ${words(link!.target)}: ${link!.description}`,
        ...(link
          ? {
              relationships: [
                { type: 'foreignKey', to: `${byConcept.get(link.target)!.table}.id` },
              ],
            }
          : {}),
      };
    }),
  })),
};

// Declared quality rules and service levels: trust indicators shown in KPI lineage. Declarations
// only; the workbench never runs them.
contract.slaProperties = [
  { property: 'latency', value: 1, unit: 'd', element: 'mall.charges.amount' },
  { property: 'frequency', value: 1, unit: 'd' },
  { property: 'retention', value: 10, unit: 'y' },
];
const quality = (table: string, column: string | null, rules: any[]) => {
  const object = contract.schema.find((o: any) => o.name === table);
  (column ? object.properties.find((p: any) => p.name === column) : object).quality = rules;
};
quality('occupancy_snapshots', null, [
  {
    name: 'one_snapshot_per_unit_month',
    type: 'text',
    dimension: 'uniqueness',
    severity: 'error',
    description: 'Exactly one snapshot per unit and month.',
  },
]);
quality('occupancy_snapshots', 'occupied_gla_m2', [
  {
    name: 'occupied_within_gla',
    type: 'text',
    dimension: 'accuracy',
    severity: 'error',
    description: 'Occupied area is between zero and the unit gross leasable area.',
  },
]);
quality('charges', 'amount', [
  {
    name: 'amount_not_null',
    type: 'library',
    metric: 'nullValues',
    mustBe: 0,
    dimension: 'completeness',
    severity: 'error',
    description: 'Every charge has an amount.',
  },
]);
quality('sales_reports', 'gross_sales', [
  {
    name: 'sales_reported_by_day_10',
    type: 'text',
    dimension: 'timeliness',
    severity: 'warning',
    description: 'Tenants report monthly gross sales by the tenth day of the following month.',
  },
]);

const sqlLiteral = (value: any) =>
  value == null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : "'" + String(value).replaceAll("'", "''") + "'";
const sqlType = (t: string) =>
  t === 'Integer' || t === 'Boolean' ? 'INTEGER' : t === 'Decimal' ? 'REAL' : 'TEXT';
let sql =
  "-- Synthetic BRL fixture for isolated tests. Not a warehouse migration.\nATTACH ':memory:' AS mall;\n";
for (const d of concrete) {
  const columns = columnsOf(d);
  sql += `CREATE TABLE mall.${d.table} (${columns.map(c => c + ' ' + (c === 'id' ? 'INTEGER PRIMARY KEY' : sqlType(fieldType(d, c)))).join(', ')});\n`;
  for (const row of rows[d.table!] ?? [])
    sql += `INSERT INTO mall.${d.table} (${columns.join(', ')}) VALUES (${columns.map(c => sqlLiteral(row[c])).join(', ')});\n`;
}
for (const table of Object.keys(rows))
  if (!concrete.some(d => d.table === table))
    throw Error(`Fixture rows for unknown table ${table}`);
for (const d of concrete)
  for (const row of rows[d.table!] ?? [])
    for (const key of Object.keys(row))
      if (!columnsOf(d).includes(key)) throw Error(`${d.table}.${key} is not a column`);

const dir = 'public/examples/mall';
await mkdir(dir, { recursive: true });
const outputs: [string, string][] = [
  ['mall.ontology.yaml', stringify(ontology, { lineWidth: 0 })],
  ['mall.semantic.yaml', stringify(semantic, { lineWidth: 0 })],
  ['mall.mapping.yaml', stringify(mapping, { lineWidth: 0 })],
  ['mall.odcs.yaml', stringify(contract, { lineWidth: 0 })],
  ['mall.owl.ttl', owl],
  ['mall.shacl.ttl', shacl],
  ['mall-data.ttl', data],
];
for (const [filename, source] of outputs) {
  const model = inspect(source, filename);
  const errors = (model.issues ?? []).filter(i => i.severity === 'error');
  if (errors.length) throw Error(`${filename}: ${JSON.stringify(errors)}`);
  await Bun.write(`${dir}/${filename}`, source);
}
await Bun.write(`${dir}/fixture.sql`, sql);
const docs = ['mall.mapping.yaml', 'mall.ontology.yaml', 'mall.semantic.yaml'].map(
  (filename, i) => ({
    id: 'mall-' + i,
    filename,
    revision: 1,
    source: outputs.find(o => o[0] === filename)![1],
  }),
);
const context = buildContext(docs, 'mall-0');
if (context.findings.some(f => f.severity === 'error'))
  throw Error(JSON.stringify(context.findings.slice(0, 5)));
await Bun.write(
  `${dir}/expected.json`,
  JSON.stringify(
    { ...expected, counts: { ...expected.counts, bindings: context.bindings.length } },
    null,
    2,
  ) + '\n',
);
console.log(
  `Generated ${defs.length} entity types (${concrete.length} concrete) in ${Object.keys(modules).length} modules, ${valueTypes.length} value types, ${metrics.length} KPIs, ${semantic.relationships.length} joins and ${context.bindings.length} resolved bindings.`,
);
