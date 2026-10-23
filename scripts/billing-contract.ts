// Builds the ODCS data contract for the billing tables that the governed metrics read, so a
// metric's lineage ends in a contract object with its columns, quality rules and service levels.

// Tables the governed metrics read or break down by; the contract does not cover the other
// billing tables.
const CONTRACT_TABLES = [
  'invoice_lines',
  'invoices',
  'subscription_items',
  'plans',
  'products',
  'product_families',
  'currencies',
];
const NUMERIC_COLUMNS = new Set(['quantity', 'unit_price', 'discount_amount', 'tax_amount']);
const TEXT_COLUMNS = new Set(['name', 'tier', 'code']);

type SemanticDataset = { name: string; source: string; fields: { name: string }[] };
type SemanticJoin = { from: string; to: string; from_columns: string[]; to_columns: string[] };
type SemanticModel = { datasets: SemanticDataset[]; relationships: SemanticJoin[] };

const columnDescriptions: Record<string, string> = {
  quantity: 'Billed quantity of the line.',
  unit_price: 'Price per unit in USD before discount.',
  discount_amount: 'Discount granted on the line in USD.',
  tax_amount: 'Tax charged on the line in USD.',
  is_recurring: 'One for recurring lines, zero for usage-only lines.',
  invoice_date: 'Date the invoice was issued.',
  tier: 'Commercial tier of the plan.',
  code: 'ISO 4217 currency code.',
};

function logicalType(column: string) {
  if (NUMERIC_COLUMNS.has(column)) return 'number';
  if (TEXT_COLUMNS.has(column)) return 'string';
  if (column === 'invoice_date') return 'date';
  return 'integer';
}

function propertyOf(dataset: SemanticDataset, column: string, joins: SemanticJoin[]) {
  const join = joins.find(j => j.from === dataset.name && j.from_columns[0] === column);
  const property: Record<string, unknown> = {
    name: column,
    logicalType: logicalType(column),
    required: true,
    description: columnDescriptions[column] ?? `${dataset.name} ${column.replaceAll('_', ' ')}.`,
  };
  if (column === 'id') Object.assign(property, { primaryKey: true, unique: true });
  if (join)
    property.relationships = [{ type: 'foreignKey', to: `${join.to}.${join.to_columns[0]}` }];
  return property;
}

function objectOf(dataset: SemanticDataset, joins: SemanticJoin[]) {
  // The computed net_amount field exists only in the semantic model, not in the warehouse table.
  const columns = dataset.fields.map(f => f.name).filter(name => name !== 'net_amount');
  return {
    name: dataset.name,
    physicalName: dataset.source,
    physicalType: 'table',
    logicalType: 'object',
    description: `Billing table ${dataset.name}.`,
    properties: columns.map(column => propertyOf(dataset, column, joins)),
  };
}

function withInvoiceLineRules(contractObject: ReturnType<typeof objectOf>) {
  const rules: Record<string, unknown[]> = {
    unit_price: [
      {
        name: 'unit_price_not_negative',
        type: 'text',
        dimension: 'accuracy',
        severity: 'error',
        description: 'A unit price is never negative.',
      },
    ],
    discount_amount: [
      {
        name: 'discount_within_line',
        type: 'text',
        dimension: 'accuracy',
        severity: 'warning',
        description: 'A discount does not exceed quantity × unit price.',
      },
    ],
  };
  for (const property of contractObject.properties)
    if (rules[property.name as string]) property.quality = rules[property.name as string];
  return {
    ...contractObject,
    quality: [
      {
        name: 'one_row_per_invoice_line',
        type: 'text',
        dimension: 'uniqueness',
        severity: 'error',
        description: 'Each invoice line appears exactly once.',
      },
    ],
  };
}

/** Builds the contract for the billing tables the governed metrics read. */
export function billingContract(semantic: SemanticModel) {
  const datasets = CONTRACT_TABLES.map(name => semantic.datasets.find(d => d.name === name)!);
  // A foreign key must point at an object of the same contract.
  const joins = semantic.relationships.filter(
    j => CONTRACT_TABLES.includes(j.from) && CONTRACT_TABLES.includes(j.to),
  );
  const schema = datasets.map(dataset => {
    const contractObject = objectOf(dataset, joins);
    return dataset.name === 'invoice_lines' ? withInvoiceLineRules(contractObject) : contractObject;
  });
  return {
    apiVersion: 'v3.1.0',
    kind: 'DataContract',
    id: '6f0d2c1e-8a47-4f0b-9a52-3b7e5d9c4a10',
    name: 'Subscription billing contract',
    version: '1.0.0',
    status: 'active',
    domain: 'Billing',
    dataProduct: 'Revenue analytics',
    description: {
      purpose: 'Invoice, plan and currency tables that the governed billing metrics read.',
      limitations:
        'Synthetic demonstration data. USD only. Covers the tables behind the metrics, not the whole billing model.',
    },
    schema,
    slaProperties: [
      { property: 'latency', value: 1, unit: 'd', element: 'billing.invoice_lines' },
      { property: 'frequency', value: 1, unit: 'd' },
    ],
    team: [{ username: 'billing-data', role: 'owner' }],
  };
}
