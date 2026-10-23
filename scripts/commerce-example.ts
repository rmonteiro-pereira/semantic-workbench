// Generates commerce model examples, RDF instances and analytical fixtures.
import { stringify } from 'yaml';
import { governedMetrics } from './commerce-metrics';
import { bindingEntries, metricExtensionEntries } from './helpers/example-metrics';
import { graph, parse, serialize } from 'rdflib';
const dir = 'public/examples/commerce/';
const tables = [
  {
    name: 'customers',
    concept: 'Customer',
    description: 'Registered customers. One row per customer.',
    cols: [
      ['customer_id', 'integer'],
      ['name', 'string'],
      ['email', 'string'],
    ],
  },
  {
    name: 'orders',
    concept: 'Order',
    description: 'Placed orders. Cancelled orders are retained; totals are in USD.',
    cols: [
      ['order_id', 'integer'],
      ['customer_id', 'integer'],
      ['order_date', 'date'],
      ['amount', 'number'],
      ['status', 'string'],
    ],
  },
  {
    name: 'order_lines',
    concept: 'OrderLine',
    description: 'One row per product line in an order.',
    cols: [
      ['line_id', 'integer'],
      ['order_id', 'integer'],
      ['product_id', 'integer'],
      ['quantity', 'integer'],
      ['line_amount', 'number'],
    ],
  },
  {
    name: 'products',
    concept: 'Product',
    description: 'Sellable product catalog.',
    cols: [
      ['product_id', 'integer'],
      ['name', 'string'],
      ['unit_price', 'number'],
    ],
  },
];
const ns = 'https://example.org/commerce#';
const foreignKeys: Record<string, string> = {
  'orders.customer_id': 'customers.customer_id',
  'order_lines.order_id': 'orders.order_id',
  'order_lines.product_id': 'products.product_id',
};
await Bun.write(
  dir + 'commerce.odcs.yaml',
  stringify({
    apiVersion: 'v3.1.0',
    kind: 'DataContract',
    id: '9d1b6ac0-73cf-4c1a-8435-70c90322d542',
    name: 'Commerce warehouse contract',
    version: '1.0.0',
    status: 'active',
    domain: 'Commerce',
    dataProduct: 'Sales analytics',
    description: {
      purpose: 'Governed customer and order data for daily revenue reporting.',
      limitations: 'Synthetic demonstration data. USD only. No real personal information.',
    },
    schema: tables.map(t => ({
      name: t.name,
      physicalName: `analytics.commerce.${t.name}`,
      physicalType: 'table',
      logicalType: 'object',
      description: t.description,
      authoritativeDefinitions: [{ type: 'businessDefinition', url: ns + t.concept }],
      properties: t.cols.map(([name, type], i) => ({
        name,
        logicalType: type,
        required: true,
        ...(i === 0 ? { primaryKey: true, unique: true } : {}),
        description: `${t.concept} ${name.replaceAll('_', ' ')}.`,
        ...(i > 0 && foreignKeys[`${t.name}.${name}`]
          ? { relationships: [{ type: 'foreignKey', to: foreignKeys[`${t.name}.${name}`] }] }
          : {}),
      })),
    })),
    team: [{ username: 'commerce-data', role: 'owner' }],
  }),
);
const semanticModelName = 'Commerce sales';
const ontologyName = 'Commerce business ontology';
const expr = (expression: string) => ({ dialects: [{ dialect: 'ANSI_SQL', expression }] });
await Bun.write(
  dir + 'sales.ossie.yaml',
  stringify({
    version: '0.2.0.dev0',
    name: semanticModelName,
    description: 'Revenue and order metrics over contracted warehouse tables.',
    datasets: tables.map(t => ({
      name: t.name,
      source: `analytics.commerce.${t.name}`,
      description: t.description,
      primary_key: [t.cols[0][0]],
      fields: t.cols.map(([name, type]) => ({
        name,
        expression: expr(name),
        datatype: (
          { integer: 'Integer', number: 'Decimal', date: 'Date', string: 'String' } as any
        )[type],
        ...(type === 'date' ? { dimension: { is_time: true } } : {}),
      })),
    })),
    relationships: [
      {
        name: 'orders_customer',
        from: 'orders',
        to: 'customers',
        from_columns: ['customer_id'],
        to_columns: ['customer_id'],
      },
      {
        name: 'lines_order',
        from: 'order_lines',
        to: 'orders',
        from_columns: ['order_id'],
        to_columns: ['order_id'],
      },
      {
        name: 'lines_product',
        from: 'order_lines',
        to: 'products',
        from_columns: ['product_id'],
        to_columns: ['product_id'],
      },
    ],
    metrics: governedMetrics.map(metric => ({
      name: metric.name,
      ...(metric.description ? { description: metric.description } : {}),
      datatype: metric.datatype,
      expression: expr(metric.expression),
      custom_extensions: metricExtensionEntries(metric.extension),
    })),
  }),
);
// The mapping only carries the metric bindings; it maps no concept to a dataset.
await Bun.write(
  dir + 'sales.mapping.yaml',
  '# Workbench addition: binds the governed metrics of sales.ossie.yaml to business concepts.\n' +
    '# It is not part of any upstream standard example.\n' +
    stringify({
      version: '0.2.0.dev0',
      name: 'Commerce sales mappings',
      ontology_ref: { name: ontologyName, iri: './commerce-business.ossie.yaml' },
      semantic_model_ref: { name: semanticModelName, iri: './sales.ossie.yaml' },
      concept_mappings: [],
      custom_extensions: bindingEntries(governedMetrics),
    }),
);
const rels = [
  ['Customer', 'places', 'Order'],
  ['Order', 'contains', 'OrderLine'],
  ['OrderLine', 'product', 'Product'],
  ['Order', 'shipment', 'Shipment'],
  ['Order', 'invoice', 'Invoice'],
  ['Invoice', 'payment', 'Payment'],
  ['Shipment', 'warehouse', 'Warehouse'],
];
const classes = [
  'Customer',
  'Order',
  'OrderLine',
  'Product',
  'Shipment',
  'Invoice',
  'Payment',
  'Warehouse',
];
await Bun.write(
  dir + 'commerce-business.ossie.yaml',
  stringify({
    name: ontologyName,
    description: 'Business concepts independent of storage. OWL counterpart uses the same IRIs.',
    ontology: classes.map(concept => ({
      concept,
      type: 'EntityType',
      iri: ns + concept,
      description: `${concept} in the order-to-cash process.`,
      relationships: rels
        .filter(r => r[0] === concept)
        .map(([from, name, to]) => ({
          name,
          roles: [{ concept: to }],
          verbalizes: [`{${from}} ${name} {${to}}`],
        })),
    })),
  }),
);
const prefixes = `@prefix c: <${ns}> .\n@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n@prefix sh: <http://www.w3.org/ns/shacl#> .\n`;
const owl =
  prefixes +
  `\n<https://example.org/commerce> a owl:Ontology ; rdfs:label "Commerce OWL ontology" ; owl:versionInfo "1.0.0" .\n` +
  classes
    .map(
      c =>
        `c:${c} a owl:Class ; rdfs:label "${c}" ; rdfs:comment "${c} in the order-to-cash process." .`,
    )
    .join('\n') +
  '\n' +
  rels
    .map(
      ([from, p, to]) =>
        `c:${p} a owl:ObjectProperty ; rdfs:label "${p}" ; rdfs:domain c:${from} ; rdfs:range c:${to} .`,
    )
    .join('\n') +
  `\nc:email a owl:DatatypeProperty ; rdfs:domain c:Customer ; rdfs:range xsd:string .\nc:amount a owl:DatatypeProperty ; rdfs:domain c:Order ; rdfs:range xsd:decimal .\nc:placedBy a owl:ObjectProperty ; owl:inverseOf c:places ; rdfs:domain c:Order ; rdfs:range c:Customer .\nc:PaidOrder a owl:Class ; rdfs:subClassOf c:Order, [ a owl:Restriction ; owl:onProperty c:invoice ; owl:someValuesFrom c:Invoice ] .\n`;
await Bun.write(dir + 'commerce.owl.ttl', owl);
const store = graph();
parse(owl, store, 'https://example.org/commerce', 'text/turtle');
await Bun.write(
  dir + 'commerce.owl',
  serialize(null, store, 'https://example.org/commerce', 'application/rdf+xml')!
    .replace('<rdf:RDF', '<rdf:RDF xml:base="https://example.org/commerce"')
    .replace(' rdf:parseType="Resource"', ''),
);
await Bun.write(
  dir + 'commerce.shacl.ttl',
  prefixes +
    `\nc:CustomerShape a sh:NodeShape ; rdfs:label "Customer requirements" ; sh:targetClass c:Customer ;\n sh:property [ sh:path c:email ; sh:name "Email" ; sh:datatype xsd:string ; sh:minCount 1 ; sh:maxCount 1 ; sh:pattern "^[^@]+@[^@]+[.][^@]+$" ] .\nc:OrderShape a sh:NodeShape ; rdfs:label "Order requirements" ; sh:targetClass c:Order ;\n sh:property [ sh:path c:amount ; sh:name "Order amount" ; sh:datatype xsd:decimal ; sh:minInclusive 0 ; sh:minCount 1 ; sh:maxCount 1 ] ;\n sh:property [ sh:path c:contains ; sh:name "Order lines" ; sh:class c:OrderLine ; sh:minCount 1 ] .\n`,
);
await Bun.write(
  dir + 'commerce-data.ttl',
  prefixes +
    `\nc:customer_alex a c:Customer ; rdfs:label "Alex Morgan" ; c:email "alex@example.org" ; c:places c:order_1042 .\nc:order_1042 a c:Order ; rdfs:label "Order 1042" ; c:amount "79.00"^^xsd:decimal ; c:contains c:line_1042_1 ; c:shipment c:shipment_1042 ; c:invoice c:invoice_1042 .\nc:line_1042_1 a c:OrderLine ; rdfs:label "Order 1042 · desk lamp" ; c:product c:desk_lamp .\nc:desk_lamp a c:Product ; rdfs:label "Adjustable desk lamp" .\nc:shipment_1042 a c:Shipment ; rdfs:label "Shipment 1042" ; c:warehouse c:warehouse_east .\nc:warehouse_east a c:Warehouse ; rdfs:label "East fulfillment center" .\nc:invoice_1042 a c:Invoice ; rdfs:label "Invoice 1042" ; c:payment c:payment_1042 .\nc:payment_1042 a c:Payment ; rdfs:label "Card payment · USD 79" .\n`,
);
// Instances, not 1,000 invented ontology classes. Five explicit business links per resource.
const groups = [
  ['customer', 100, 'Customer'],
  ['order', 200, 'Order'],
  ['line', 200, 'OrderLine'],
  ['product', 100, 'Product'],
  ['shipment', 100, 'Shipment'],
  ['invoice', 100, 'Invoice'],
  ['payment', 100, 'Payment'],
  ['warehouse', 100, 'Warehouse'],
] as const;
const links: Record<string, [string, string][]> = {
  customer: [
    ['places', 'order'],
    ['preferredProduct', 'product'],
    ['lastInvoice', 'invoice'],
    ['lastPayment', 'payment'],
    ['lastShipment', 'shipment'],
  ],
  order: [
    ['placedBy', 'customer'],
    ['contains', 'line'],
    ['invoice', 'invoice'],
    ['shipment', 'shipment'],
    ['fulfilledFrom', 'warehouse'],
  ],
  line: [
    ['partOfOrder', 'order'],
    ['product', 'product'],
    ['soldTo', 'customer'],
    ['billedOn', 'invoice'],
    ['fulfilledFrom', 'warehouse'],
  ],
  product: [
    ['stockedAt', 'warehouse'],
    ['appearsOn', 'line'],
    ['orderedOn', 'order'],
    ['shippedIn', 'shipment'],
    ['purchasedBy', 'customer'],
  ],
  shipment: [
    ['forOrder', 'order'],
    ['recipient', 'customer'],
    ['warehouse', 'warehouse'],
    ['includesProduct', 'product'],
    ['billedOn', 'invoice'],
  ],
  invoice: [
    ['forOrder', 'order'],
    ['billedTo', 'customer'],
    ['payment', 'payment'],
    ['includesLine', 'line'],
    ['relatedShipment', 'shipment'],
  ],
  payment: [
    ['settlesInvoice', 'invoice'],
    ['paidBy', 'customer'],
    ['forOrder', 'order'],
    ['coversLine', 'line'],
    ['relatedShipment', 'shipment'],
  ],
  warehouse: [
    ['stocks', 'product'],
    ['dispatches', 'shipment'],
    ['fulfills', 'order'],
    ['picks', 'line'],
    ['serves', 'customer'],
  ],
};
const sizes = Object.fromEntries(groups.map(([g, size]) => [g, size]));
let data =
  prefixes +
  '\n# Synthetic commerce records, not real customer data. Exactly 1,000 resources / 5,000 business links.\n';
for (const [group, size, type] of groups)
  for (let i = 0; i < size; i++) {
    const id = `${group}_${i}`;
    const label =
      group === 'product'
        ? `${['Desk lamp', 'Office chair', 'Standing desk', 'Monitor arm', 'Keyboard'][i % 5]} · SKU ${10000 + i}`
        : group === 'warehouse'
          ? `Fulfillment center ${i + 1}`
          : `${type} ${10000 + i}`;
    data +=
      `c:${id} a c:${type} ; rdfs:label "${label}" ;\n` +
      links[group].map(([p, t], j) => ` c:${p} c:${t}_${(i + j * 13) % sizes[t]}`).join(' ;\n') +
      ' .\n';
  }
await Bun.write(dir + 'commerce-scale.ttl', data);
await Bun.write(
  dir + 'README.md',
  `# Commerce example workspace\n\nFictional order-to-cash domain. These are illustrative models, not production or external reference data.\n\n- commerce.odcs.yaml: contract for four warehouse tables, types, keys, ownership and business-definition IRIs.\n- sales.ossie.yaml: four datasets, three joins, three metrics; sources exactly match contract physical names.\n- commerce-business.ossie.yaml: eight business concepts using the same IRIs as OWL.\n- commerce.owl.ttl / commerce.owl: same OWL ontology in Turtle / RDF/XML, with classes, properties, inverse property and an existential restriction.\n- commerce.shacl.ttl: required email, nonnegative order amount, required order lines.\n- commerce-data.ttl: readable eight-resource order lifecycle.\n- commerce-scale.ttl: 1,000 synthetic business resources, 5,000 explicit business links, plus type and label triples. It is a navigation benchmark, not a claim of validated business rules.\n\nContract-to-semantic links are physical source names. Ontology links are shared IRIs. The app preserves these definitions; it does not automatically infer cross-document equivalence or execute OWL reasoning / SHACL validation.\n\n## Explicit mapping and agent example\n\n**Load mapped commerce** imports three additional, independent documents: \`commerce.mapped-ontology.yaml\`, \`commerce.mapped-semantic.yaml\`, and \`commerce.mapping.yaml\`. The mapping references the other two by logical name and local filename. Nested object/referent/link mappings connect Customer and Order to fields; Revenue and OrderCount point to existing governed metrics. Metric formulas occur only in the semantic model. Ontology business meaning and ontology-level AI instructions remain in the ontology.\n\nIn Mappings, choose all concepts, open **Compose a query…**, select \`gross_revenue\` and \`customers.region\`, and preview a newly composed revenue-by-region query. This is not a predefined query; the runtime follows mappings and uses the declared many-to-one join and primary key. See [agent runtime](../../../docs/agent-runtime.md) for HTTP tools, provenance, supported query composition and limits.\n`,
);
console.log('Generated commerce example workspace');
