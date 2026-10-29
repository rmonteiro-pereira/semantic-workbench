// Generates UBL model examples, declared foreign keys and analytical fixtures.
import { stringify } from 'yaml';
import { exampleMappingText, linkMapping, ossieMetric } from './helpers/example-metrics';
import { governedMetrics } from './ubl-metrics';
const mapping = await Bun.file('public/examples/ubl/model-map.json').json();
const dir = 'public/examples/ubl/';
const iri = 'https://example.org/ubl-workbench#';
const ontologyName = 'UBL 2.3 procurement-to-payment · 45 business entities';
const semanticModelName = 'UBL procurement-to-payment analytical model';
const snake = (s: string) => (s === 'Order' ? 'purchase_order' : s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase());
const desc = (e: any) => `UBL 2.3 ${e.name} component, projected from its published XSD. Roles retain source min/max occurrence counts.`;
const prefixes = `@prefix u: <${iri}> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n@prefix sh: <http://www.w3.org/ns/shacl#> .\n`;
const quote = (v: string) => JSON.stringify(v);
let owl =
  prefixes +
  '\n<https://example.org/ubl-workbench> a owl:Ontology ; rdfs:label "UBL procurement-to-payment · 45 business entities" ; rdfs:comment "Application-specific projection of OASIS UBL 2.3. This is not an official OASIS OWL ontology." .\n';
let shacl = prefixes;
const tables: any[] = [];
const joins: any[] = [];
for (const e of mapping.entities) {
  owl += `\nu:${e.name} a owl:Class ; rdfs:label ${quote(e.name)} ; rdfs:comment ${quote(desc(e))} ; rdfs:isDefinedBy <${e.source}> .\n`;
  const props: any[] = [
    {
      name: 'record_id',
      logicalType: 'string',
      required: true,
      primaryKey: true,
      unique: true,
      description: 'Application-generated surrogate ID for the analytical projection; not a UBL XML field.',
    },
  ];
  for (const f of e.fields) {
    const name = snake(f.name);
    if (props.some(p => p.name === name)) continue;
    const logicalType = /Amount|Quantity|Percent|Rate|Numeric$/.test(f.name) ? 'number' : f.name.endsWith('Indicator') ? 'boolean' : f.name.endsWith('Date') ? 'date' : 'string';
    props.push({
      name,
      logicalType,
      required: f.min > 0,
      description: `Source cbc:${f.name}; occurrences ${f.min}..${f.max}. Repeating basic fields are represented as arrays in this projection.`,
      ...(f.max !== '1' ? { logicalType: 'array', items: { logicalType } } : {}),
    });
  }
  const constraints: string[] = [];
  for (const r of e.relationships) {
    const property = `${e.name}_${r.name}`;
    owl += `u:${property} a owl:ObjectProperty ; rdfs:label ${quote(r.name)} ; rdfs:domain u:${e.name} ; rdfs:range u:${r.target} ; rdfs:comment ${quote(`UBL cac:${r.name}; ${r.min}..${r.max} occurrences.`)} ; rdfs:isDefinedBy <${e.source}> .\n`;
    constraints.push(`[ sh:path u:${property} ; sh:class u:${r.target} ; sh:minCount ${r.min}${r.max === 'unbounded' ? '' : ` ; sh:maxCount ${r.max}`} ]`);
    if (r.max === '1') {
      const col = snake(r.name) + '_id';
      props.push({
        name: col,
        logicalType: 'string',
        required: r.min > 0,
        description: `Analytical foreign key for UBL cac:${r.name}, targeting ${r.target}.`,
      });
      joins.push({
        name: property,
        from: snake(e.name),
        to: snake(r.target),
        from_columns: [col],
        to_columns: ['record_id'],
      });
    } else {
      const name = snake(e.name) + '__' + snake(r.name);
      tables.push({
        name,
        logicalType: 'object',
        physicalType: 'table',
        physicalName: 'analytics.ubl.' + name,
        description: `Bridge for repeatable UBL ${e.name}.${r.name} → ${r.target}; source occurrences ${r.min}..${r.max}.`,
        properties: [
          {
            name: 'record_id',
            logicalType: 'string',
            required: true,
            primaryKey: true,
            unique: true,
          },
          { name: 'source_id', logicalType: 'string', required: true },
          { name: 'target_id', logicalType: 'string', required: true },
        ],
      });
      joins.push(
        {
          name: property + '_source',
          from: name,
          to: snake(e.name),
          from_columns: ['source_id'],
          to_columns: ['record_id'],
        },
        {
          name: property + '_target',
          from: name,
          to: snake(r.target),
          from_columns: ['target_id'],
          to_columns: ['record_id'],
        },
      );
    }
  }
  shacl += `\nu:${e.name}Shape a sh:NodeShape ; rdfs:label ${quote(e.name + ' aggregate roles')} ; sh:targetClass u:${e.name}${constraints.length ? ' ;\n sh:property ' + constraints.join(' ,\n ') : ''} .\n`;
  tables.push({
    name: snake(e.name),
    logicalType: 'object',
    physicalType: 'table',
    physicalName: 'analytics.ubl.' + snake(e.name),
    description: desc(e),
    authoritativeDefinitions: [
      { type: 'businessDefinition', url: e.source },
      { type: 'businessDefinition', url: iri + e.name },
    ],
    properties: props,
  });
}
// Every analytical join is also declared as an ODCS foreign key on its source column.
for (const j of joins) tables.find(t => t.name === j.from)!.properties.find((p: any) => p.name === j.from_columns[0])!.relationships = [{ type: 'foreignKey', to: `${j.to}.${j.to_columns[0]}` }];
await Bun.write(dir + 'ubl.owl.ttl', owl);
await Bun.write(dir + 'ubl.shacl.ttl', shacl);
await Bun.write(
  dir + 'ubl.ontology.yaml',
  stringify({
    version: '0.2.0.dev0',
    name: ontologyName,
    description: 'A schema-derived, focused business model spanning procurement, fulfillment, invoicing, tax and settlement. Application projection, not an official OASIS ontology.',
    ontology: mapping.entities.map((e: any) => ({
      concept: e.name,
      type: 'EntityType',
      iri: iri + e.name,
      description: desc(e),
      relationships: e.relationships.map((r: any) => ({
        name: r.name,
        description: `UBL role cac:${r.name}; source occurrences ${r.min}..${r.max}.`,
        roles: [{ concept: r.target, ...(r.target === e.name ? { name: 'related' } : {}) }],
        ...(r.max === '1' ? { multiplicity: 'ManyToOne' } : {}),
        verbalizes: [`{${e.name}} has ${r.name} {${r.target}${r.target === e.name ? ':related' : ''}}`],
      })),
    })),
  }),
);
await Bun.write(
  dir + 'ubl.odcs.yaml',
  stringify({
    apiVersion: 'v3.1.0',
    kind: 'DataContract',
    id: '47a8a25a-c671-4ade-92fe-247da9af2240',
    name: 'UBL procurement-to-payment analytical contract',
    version: '1.0.0',
    status: 'draft',
    domain: 'Procurement and logistics',
    description: {
      purpose: 'Analytical projection of a 45-component UBL 2.3 subset, with surrogate keys and bridge tables for repeating aggregate roles.',
      limitations: 'Not the UBL XML schema. Surrogate IDs, normalization and type mappings are application choices. Components outside the selected subset are omitted.',
    },
    schema: tables,
    team: [{ username: 'procurement-data', role: 'owner' }],
  }),
);
const expression = (expression: string) => ({ dialects: [{ dialect: 'ANSI_SQL', expression }] });

/**
 * Maps each UBL component to the dataset that holds it, keyed by record_id. A role that occurs at
 * most once is linked through its foreign key column; a repeatable role through its bridge table.
 */
function conceptMapping(entity: any) {
  const dataset = snake(entity.name);
  const links = entity.relationships.map((r: any) => {
    if (r.max === '1') {
      const foreignKey = `${dataset}.${snake(r.name)}_id`;
      return linkMapping(`${dataset}.record_id`, r.name, r.target, foreignKey);
    }
    const bridge = `${dataset}__${snake(r.name)}`;
    return linkMapping(`${bridge}.source_id`, r.name, r.target, `${bridge}.target_id`);
  });
  return {
    concept: entity.name,
    object_mappings: [{ expression: `${dataset}.record_id` }],
    ...(links.length ? { link_mappings: links } : {}),
  };
}
await Bun.write(
  dir + 'ubl.semantic.yaml',
  stringify({
    version: '0.2.0.dev0',
    name: semanticModelName,
    description: `${tables.length} normalized datasets, including bridge tables for repeatable roles. Physical sources match the ODCS contract.`,
    datasets: tables.map(t => ({
      name: t.name,
      source: t.physicalName,
      primary_key: ['record_id'],
      description: t.description,
      fields: t.properties.map((p: any) => ({
        name: p.name,
        description: p.description,
        expression: expression(p.name),
        datatype: (
          {
            string: 'String',
            number: 'Decimal',
            boolean: 'Boolean',
            date: 'Date',
            array: 'Opaque',
          } as any
        )[p.logicalType],
      })),
    })),
    relationships: joins,
    metrics: governedMetrics.map(ossieMetric),
  }),
);
await Bun.write(
  dir + 'ubl.semantic-mapping.yaml',
  exampleMappingText({
    name: 'UBL concept mappings and metric bindings',
    ontology: { name: ontologyName, iri: './ubl.ontology.yaml' },
    semanticModel: { name: semanticModelName, iri: './ubl.semantic.yaml' },
    metrics: governedMetrics,
    conceptMappings: mapping.entities.map(conceptMapping),
    comment: [
      'maps every UBL component to its dataset and every role to its key or bridge table,',
      'and binds the governed metrics of ubl.semantic.yaml to UBL concepts.',
      'It is not part of the UBL standard or of any upstream example.',
    ],
  }),
);
const summary = {
  businessEntities: mapping.entities.length,
  businessRelationships: mapping.entities.reduce((n: number, e: any) => n + e.relationships.length, 0),
  analyticalDatasets: tables.length,
  analyticalJoins: joins.length,
  source: mapping.source,
};
await Bun.write(dir + 'summary.json', JSON.stringify(summary, null, 2));
const readmeLines = [
  `# UBL 2.3 procurement-to-payment`,
  ``,
  [
    `${summary.businessEntities} business entities,`,
    `${summary.businessRelationships} named aggregate relationships,`,
    `derived from OASIS UBL 2.3 XSDs.`,
    `The selected business documents are Order, Invoice, DespatchAdvice, ReceiptAdvice and CreditNote; shared aggregates include Party, Item, Shipment, Consignment, TaxTotal, PaymentMeans and FinancialAccount.`,
  ].join(' '),
  ``,
  `Source: https://docs.oasis-open.org/ubl/UBL-2.3.html`,
  `Schemas: ${mapping.source}`,
  ``,
  `## Artifacts`,
  ``,
  `- ubl.ontology.yaml: Ossie ontology; source role names and occurrence counts retained.`,
  `- ubl.owl.ttl: 45 OWL classes and 277 domain/range object properties, with schema provenance.`,
  `- ubl.shacl.ttl: projected aggregate-role cardinality and target-class constraints.`,
  `- ubl.odcs.yaml: ${tables.length} normalized tables, basic fields, surrogate IDs and repeatable-role bridge tables.`,
  `- ubl.semantic.yaml: matching datasets, ${joins.length} joins and ${governedMetrics.length} governed metrics.`,
  `- ubl.semantic-mapping.yaml: maps each component and role to its dataset, key or bridge table, and binds the governed metrics.`,
  `- model-map.json: extracted references and cardinalities for auditing and regeneration.`,
  ``,
  [
    `This is an application-specific projection of an established business model, not an official OASIS OWL/SHACL or relational standard.`,
    `UBL components outside the selected subset are not expanded.`,
    `SHACL covers selected aggregate roles, not complete XML conformance.`,
    `Analytical keys, normalization and primitive-type mappings are explicit application choices.`,
    `Repeating XML basic fields become arrays.`,
  ].join(' '),
  ``,
  `Regenerate from the project root: python3 scripts/extract-ubl.py then bun scripts/ubl-example.ts.`,
  ``,
];
await Bun.write(dir + 'README.md', readmeLines.join('\n'));
console.log(summary);
