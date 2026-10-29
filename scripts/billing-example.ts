// Generates a fictional SaaS billing model with explicit business relationships and analytic
// grains.
import { mkdir } from 'node:fs/promises';
import { stringify } from 'yaml';
import { inspect } from '../src/shared/core/model';
import { buildContext } from '../src/server/agent/runtime';
import { billingContract } from './billing-contract';
import { governedMetrics } from './billing-metrics';
import { bindingEntries, ossieMetric } from './helpers/example-metrics';
// Fictional B2B SaaS billing model. Business relationships and analytic grain are explicit; names
// are not multiplied to create a synthetic graph benchmark.
const definitions: [string, string, [string, string, string][]][] = [
  [
    'Account',
    'accounts',
    [
      ['industry', 'Industry', 'industry_id'],
      ['segment', 'CustomerSegment', 'segment_id'],
      ['territory', 'SalesTerritory', 'territory_id'],
      ['success_manager', 'CustomerSuccessManager', 'success_manager_id'],
    ],
  ],
  ['AccountContact', 'account_contacts', [['account', 'Account', 'account_id']]],
  ['AccountAddress', 'account_addresses', [['account', 'Account', 'account_id']]],
  ['LegalEntity', 'legal_entities', []],
  ['Industry', 'industries', []],
  ['SalesTerritory', 'sales_territories', []],
  ['CustomerSegment', 'customer_segments', []],
  ['CustomerSuccessManager', 'success_managers', []],
  [
    'Contract',
    'contracts',
    [
      ['account', 'Account', 'account_id'],
      ['legal_entity', 'LegalEntity', 'legal_entity_id'],
    ],
  ],
  ['ContractAmendment', 'contract_amendments', [['contract', 'Contract', 'contract_id']]],
  [
    'Subscription',
    'subscriptions',
    [
      ['account', 'Account', 'account_id'],
      ['contract', 'Contract', 'contract_id'],
      ['billing_cycle', 'BillingCycle', 'billing_cycle_id'],
    ],
  ],
  [
    'SubscriptionItem',
    'subscription_items',
    [
      ['subscription', 'Subscription', 'subscription_id'],
      ['plan', 'Plan', 'plan_id'],
    ],
  ],
  ['Plan', 'plans', [['product', 'Product', 'product_id']]],
  ['Product', 'products', [['family', 'ProductFamily', 'family_id']]],
  ['ProductFamily', 'product_families', []],
  ['Feature', 'features', [['product', 'Product', 'product_id']]],
  [
    'Entitlement',
    'entitlements',
    [
      ['subscription', 'Subscription', 'subscription_id'],
      ['feature', 'Feature', 'feature_id'],
    ],
  ],
  [
    'UsageEvent',
    'usage_events',
    [
      ['subscription_item', 'SubscriptionItem', 'subscription_item_id'],
      ['meter', 'UsageMeter', 'meter_id'],
    ],
  ],
  ['UsageMeter', 'usage_meters', [['product', 'Product', 'product_id']]],
  ['PricingTier', 'pricing_tiers', [['plan', 'Plan', 'plan_id']]],
  [
    'Invoice',
    'invoices',
    [
      ['account', 'Account', 'account_id'],
      ['billing_cycle', 'BillingCycle', 'billing_cycle_id'],
      ['currency', 'Currency', 'currency_id'],
      ['issuer', 'LegalEntity', 'legal_entity_id'],
    ],
  ],
  [
    'InvoiceLine',
    'invoice_lines',
    [
      ['invoice', 'Invoice', 'invoice_id'],
      ['subscription_item', 'SubscriptionItem', 'subscription_item_id'],
      ['tax_rate', 'TaxRate', 'tax_rate_id'],
    ],
  ],
  ['TaxRate', 'tax_rates', []],
  ['CreditNote', 'credit_notes', [['invoice', 'Invoice', 'invoice_id']]],
  [
    'CreditNoteLine',
    'credit_note_lines',
    [
      ['credit_note', 'CreditNote', 'credit_note_id'],
      ['invoice_line', 'InvoiceLine', 'invoice_line_id'],
    ],
  ],
  [
    'Payment',
    'payments',
    [
      ['account', 'Account', 'account_id'],
      ['method', 'PaymentMethod', 'method_id'],
      ['currency', 'Currency', 'currency_id'],
    ],
  ],
  [
    'PaymentAllocation',
    'payment_allocations',
    [
      ['payment', 'Payment', 'payment_id'],
      ['invoice', 'Invoice', 'invoice_id'],
    ],
  ],
  [
    'Refund',
    'refunds',
    [
      ['payment', 'Payment', 'payment_id'],
      ['credit_note', 'CreditNote', 'credit_note_id'],
    ],
  ],
  ['DunningCase', 'dunning_cases', [['invoice', 'Invoice', 'invoice_id']]],
  ['CollectionAction', 'collection_actions', [['case', 'DunningCase', 'case_id']]],
  ['BillingCycle', 'billing_cycles', []],
  ['Currency', 'currencies', []],
  ['PaymentMethod', 'payment_methods', []],
  ['RevenueRecognitionSchedule', 'recognition_schedules', [['invoice_line', 'InvoiceLine', 'invoice_line_id']]],
  ['JournalEntry', 'journal_entries', [['legal_entity', 'LegalEntity', 'legal_entity_id']]],
  [
    'JournalLine',
    'journal_lines',
    [
      ['entry', 'JournalEntry', 'entry_id'],
      ['recognition_schedule', 'RevenueRecognitionSchedule', 'recognition_schedule_id'],
    ],
  ],
];
const expr = (expression: string) => ({ dialects: [{ dialect: 'ANSI_SQL', expression }] });
const extras: Record<string, string[]> = {
  InvoiceLine: ['quantity', 'unit_price', 'discount_amount', 'tax_amount', 'is_recurring'],
  Plan: ['tier'],
  Currency: ['code'],
  Invoice: ['invoice_date'],
};
const byConcept = new Map(definitions.map(d => [d[0], d]));
const ontology: any = {
  version: '0.2.0.dev0',
  name: 'Subscription billing ontology',
  description: 'Fictional subscription-to-cash model: account governance, contracts, entitlements, usage, invoicing, collections and revenue recognition.',
  ai_context: {
    instructions:
      'InvoiceLine is the revenue grain. NetRevenue excludes tax and credits. RecurringRevenue excludes usage-only lines. This fixture is USD-only; do not combine currencies in production without governed conversion. Account can mean billed or subscribed account; do not infer that those roles are equivalent.',
  },
  ontology: [],
};
for (const [concept, , relations] of definitions)
  ontology.ontology.push({
    concept,
    type: 'EntityType',
    identify_by: ['id'],
    description: `${concept} in the subscription-to-cash lifecycle.`,
    relationships: [
      {
        name: 'id',
        roles: [{ concept: 'Identifier' }],
        multiplicity: 'ManyToOne',
        verbalizes: [`{${concept}} has identifier {Identifier}`],
      },
      ...relations.map(([name, target]) => ({
        name,
        roles: [{ concept: target }],
        multiplicity: 'ManyToOne',
        verbalizes: [`{${concept}} has ${name} {${target}}`],
      })),
    ],
  });
for (const [name, type] of [
  ['Identifier', 'Integer'],
  ['Text', 'String'],
  ['NetRevenue', 'Decimal'],
  ['RecurringRevenue', 'Decimal'],
  ['InvoiceCount', 'Integer'],
  ['RevenuePerInvoice', 'Decimal'],
])
  ontology.ontology.push({ concept: name, type: 'ValueType', extends: [type] });
const semantic: any = {
  version: '0.2.0.dev0',
  name: 'Subscription billing semantic model',
  description: 'One row per business entity; invoice_lines is the monetary fact grain.',
  ai_context: {
    instructions:
      'Primary keys describe unique dimension rows. Multiple account and billing-cycle roles are distinct. Credits, taxes and refunds have separate grains and are excluded from net_revenue.',
  },
  datasets: [],
  relationships: [],
  metrics: governedMetrics.map(ossieMetric),
};
for (const [concept, table, relations] of definitions) {
  const fieldNames = ['id', 'name', ...relations.map(r => r[2]), ...(extras[concept] ?? [])];
  const fields = fieldNames.map(name => ({ name, expression: expr(name) }));
  if (concept === 'InvoiceLine')
    fields.push({
      name: 'net_amount',
      expression: expr('quantity * unit_price - discount_amount'),
    });
  semantic.datasets.push({ name: table, source: `billing.${table}`, primary_key: ['id'], fields });
  for (const [name, target, column] of relations)
    semantic.relationships.push({
      name: `${table}_${name}`,
      from: table,
      to: byConcept.get(target)![1],
      from_columns: [column],
      to_columns: ['id'],
    });
}
const mapping: any = {
  version: '0.2.0.dev0',
  name: 'Subscription billing mappings',
  ontology_ref: { name: ontology.name, iri: './billing.ontology.yaml' },
  semantic_model_ref: { name: semantic.name, iri: './billing.semantic.yaml' },
  concept_mappings: [],
  custom_extensions: bindingEntries(governedMetrics),
};
for (const [concept, table, relations] of definitions) {
  const component: any = {
    concept,
    object_mappings: [{ referent_mappings: [{ relationship: 'id', expression: `${table}.id` }] }],
  };
  if (relations.length)
    component.link_mappings = [
      {
        object_mapping: { referent_mappings: [{ relationship: 'id', expression: `${table}.id` }] },
        children: relations.map(([relationship, target, column]) => ({
          relationship,
          object_mapping: {
            concept: target,
            referent_mappings: [{ relationship: 'id', expression: `${table}.${column}` }],
          },
        })),
      },
    ];
  mapping.concept_mappings.push(component);
}
// Fields that answer analytic questions are mapped explicitly, not inferred from names.
for (const [concept, table, field] of [
  ['Plan', 'plans', 'tier'],
  ['ProductFamily', 'product_families', 'name'],
  ['Currency', 'currencies', 'code'],
  ['BillingCycle', 'billing_cycles', 'name'],
]) {
  const component = ontology.ontology.find((c: any) => c.concept === concept);
  component.relationships.push({
    name: 'reporting_value',
    roles: [{ concept: 'Text' }],
    multiplicity: 'ManyToOne',
    verbalizes: [`{${concept}} has reporting value {Text}`],
  });
  const cm = mapping.concept_mappings.find((m: any) => m.concept === concept);
  cm.link_mappings ??= [
    {
      object_mapping: { referent_mappings: [{ relationship: 'id', expression: `${table}.id` }] },
      children: [],
    },
  ];
  cm.link_mappings[0].children.push({
    relationship: 'reporting_value',
    object_mapping: { concept: 'Text', expression: `${table}.${field}` },
  });
}
for (const [concept, metric] of [
  ['NetRevenue', 'net_revenue'],
  ['RecurringRevenue', 'recurring_revenue'],
  ['InvoiceCount', 'invoice_count'],
  ['RevenuePerInvoice', 'revenue_per_invoice'],
])
  mapping.concept_mappings.push({ concept, object_mappings: [{ expression: metric }] });
const lines = [
  [1, 1, 1, 2, 100, 10, 19, 1],
  [2, 1, 2, 1, 50, 0, 5, 0],
  [3, 2, 1, 3, 100, 30, 27, 1],
  [4, 3, 3, 1, 500, 50, 45, 1],
  [5, 3, 4, 2, 25, 0, 5, 0],
  [6, 4, 1, 1, 100, 0, 10, 1],
  [7, 5, 3, 2, 500, 100, 90, 1],
  [8, 6, 999, 1, 80, 0, 8, 1],
];
const rows: Record<string, Record<string, any>[]> = {
  product_families: [
    { id: 1, name: 'Platform' },
    { id: 2, name: 'Usage' },
  ],
  products: [
    { id: 1, name: 'Platform seats', family_id: 1 },
    { id: 2, name: 'Usage add-on', family_id: 2 },
  ],
  plans: [
    { id: 1, name: 'Growth', tier: 'Growth', product_id: 1 },
    { id: 2, name: 'Enterprise', tier: 'Enterprise', product_id: 1 },
    { id: 3, name: 'Metered', tier: 'Usage', product_id: 2 },
  ],
  accounts: [
    { id: 1, name: 'Acme' },
    { id: 2, name: 'Beacon' },
  ],
  subscriptions: [
    { id: 1, name: 'Acme subscription', account_id: 1, billing_cycle_id: 1 },
    { id: 2, name: 'Beacon subscription', account_id: 2, billing_cycle_id: 2 },
  ],
  subscription_items: [
    { id: 1, name: 'Growth seats', subscription_id: 1, plan_id: 1 },
    { id: 2, name: 'Growth usage', subscription_id: 1, plan_id: 3 },
    { id: 3, name: 'Enterprise seats', subscription_id: 2, plan_id: 2 },
    { id: 4, name: 'Enterprise usage', subscription_id: 2, plan_id: 3 },
  ],
  billing_cycles: [
    { id: 1, name: '2026-03' },
    { id: 2, name: '2026-04' },
  ],
  currencies: [{ id: 1, name: 'US dollar', code: 'USD' }],
  invoices: Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    name: `INV-${i + 1}`,
    account_id: i < 2 ? 1 : 2,
    billing_cycle_id: i < 3 ? 1 : 2,
    currency_id: 1,
    invoice_date: i < 3 ? '2026-03-31' : '2026-04-30',
  })),
  invoice_lines: lines.map(([id, invoice_id, subscription_item_id, quantity, unit_price, discount_amount, tax_amount, is_recurring]) => ({
    id,
    name: `Line ${id}`,
    invoice_id,
    subscription_item_id,
    quantity,
    unit_price,
    discount_amount,
    tax_amount,
    is_recurring,
  })),
};
const literal = (value: any) => {
  if (value == null) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return "'" + String(value).replaceAll("'", "''") + "'";
};
let sql = "-- Synthetic USD-only fixture, for isolated tests. Not a warehouse migration.\nATTACH ':memory:' AS billing;\n";
function sqlType(column: string): string {
  if (column === 'id') return 'INTEGER PRIMARY KEY';
  if (['name', 'tier', 'code', 'invoice_date'].includes(column)) return 'TEXT';
  return 'REAL';
}
for (const dataset of semantic.datasets) {
  const columns = dataset.fields.filter((f: any) => f.name !== 'net_amount').map((f: any) => f.name);
  const columnDefinitions = columns.map((column: string) => `${column} ${sqlType(column)}`);
  sql += `CREATE TABLE billing.${dataset.name} (${columnDefinitions.join(', ')});\n`;
  for (const row of rows[dataset.name] ?? []) {
    const values = columns.map((column: string) => literal(row[column]));
    sql += `INSERT INTO billing.${dataset.name} (${columns.join(', ')}) `;
    sql += `VALUES (${values.join(', ')});\n`;
  }
}
const dir = 'public/examples/billing';
const CONTRACT_FILE = 'billing.odcs.yaml';
const CONTRACT_LABEL = '# Workbench addition: the data contract that the governed metrics of this example bind to.\n# It is not part of any upstream standard example.\n';
await mkdir(dir, { recursive: true });
for (const [filename, data] of [
  ['billing.ontology.yaml', ontology],
  ['billing.semantic.yaml', semantic],
  ['billing.mapping.yaml', mapping],
  [CONTRACT_FILE, billingContract(semantic)],
] as const) {
  const source = (filename === CONTRACT_FILE ? CONTRACT_LABEL : '') + stringify(data);
  inspect(source, filename);
  await Bun.write(`${dir}/${filename}`, source);
}
await Bun.write(`${dir}/fixture.sql`, sql);
const docs = await Promise.all(
  ['billing.mapping.yaml', 'billing.ontology.yaml', 'billing.semantic.yaml'].map(async (filename, i) => ({
    id: 'billing-' + i,
    filename,
    revision: 1,
    source: await Bun.file(`${dir}/${filename}`).text(),
  })),
);
const context = buildContext(docs, 'billing-0');
if (context.findings.some(f => f.severity === 'error')) throw Error(JSON.stringify(context.findings));
await Bun.write(
  `${dir}/expected.json`,
  JSON.stringify(
    {
      resolvedBindings: context.bindings.length,
      businessEntities: definitions.length,
      datasets: semantic.datasets.length,
      joins: semantic.relationships.length,
      netRevenue: 2090,
      recurringRevenue: 1990,
      invoiceCount: 6,
      byPlan: { Growth: 560, Enterprise: 1350, Usage: 100, unmatched: 80 },
      byFamily: { Platform: 1910, Usage: 100, unmatched: 80 },
    },
    null,
    2,
  ) + '\n',
);
console.log(
  [
    `Generated ${definitions.length} business entities`,
    `${semantic.relationships.length} declared joins`,
    `${context.bindings.length} resolved bindings`,
    `${governedMetrics.length} governed metrics`,
    '8 billing rows.',
  ].join(', '),
);
