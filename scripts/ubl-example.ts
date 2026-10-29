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
for (const entity of mapping.entities) {
  owl += `\nu:${entity.name} a owl:Class ; rdfs:label ${quote(entity.name)} ; rdfs:comment ${quote(desc(entity))} ; rdfs:isDefinedBy <${entity.source}> .\n`;
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
  for (const field of entity.fields) {
    const name = snake(field.name);
    if (props.some(p => p.name === name)) continue;
    let logicalType: 'number' | 'boolean' | 'date' | 'string';
    if (/Amount|Quantity|Percent|Rate|Numeric$/.test(field.name)) {
      logicalType = 'number';
    } else if (field.name.endsWith('Indicator')) {
      logicalType = 'boolean';
    } else if (field.name.endsWith('Date')) {
      logicalType = 'date';
    } else {
      logicalType = 'string';
    }
    props.push({
      name,
      logicalType,
      required: field.min > 0,
      description: `Source cbc:${field.name}; occurrences ${field.min}..${field.max}. Repeating basic fields are represented as arrays in this projection.`,
      ...(field.max !== '1' ? { logicalType: 'array', items: { logicalType } } : {}),
    });
  }
  const constraints: string[] = [];
  for (const relationship of entity.relationships) {
    const property = `${entity.name}_${relationship.name}`;
    const occurrences = `UBL cac:${relationship.name}; ${relationship.min}..${relationship.max} occurrences.`;
    const clauses = [
      `u:${property} a owl:ObjectProperty`,
      `rdfs:label ${quote(relationship.name)}`,
      `rdfs:domain u:${entity.name}`,
      `rdfs:range u:${relationship.target}`,
      `rdfs:comment ${quote(occurrences)}`,
      `rdfs:isDefinedBy <${entity.source}>`,
    ];
    owl += clauses.join(' ; ') + ' .\n';
    constraints.push(`[ sh:path u:${property} ; sh:class u:${relationship.target} ; sh:minCount ${relationship.min}${relationship.max === 'unbounded' ? '' : ` ; sh:maxCount ${relationship.max}`} ]`);
    if (relationship.max === '1') {
      const col = snake(relationship.name) + '_id';
      props.push({
        name: col,
        logicalType: 'string',
        required: relationship.min > 0,
        description: `Analytical foreign key for UBL cac:${relationship.name}, targeting ${relationship.target}.`,
      });
      joins.push({
        name: property,
        from: snake(entity.name),
        to: snake(relationship.target),
        from_columns: [col],
        to_columns: ['record_id'],
      });
    } else {
      const name = snake(entity.name) + '__' + snake(relationship.name);
      tables.push({
        name,
        logicalType: 'object',
        physicalType: 'table',
        physicalName: 'analytics.ubl.' + name,
        description: `Bridge for repeatable UBL ${entity.name}.${relationship.name} → ${relationship.target}; source occurrences ${relationship.min}..${relationship.max}.`,
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
          to: snake(entity.name),
          from_columns: ['source_id'],
          to_columns: ['record_id'],
        },
        {
          name: property + '_target',
          from: name,
          to: snake(relationship.target),
          from_columns: ['target_id'],
          to_columns: ['record_id'],
        },
      );
    }
  }
  const properties = constraints.length ? ' ;\n sh:property ' + constraints.join(' ,\n ') : '';
  shacl += `\nu:${entity.name}Shape a sh:NodeShape ; rdfs:label ${quote(entity.name + ' aggregate roles')} ; sh:targetClass u:${entity.name}${properties} .\n`;
  tables.push({
    name: snake(entity.name),
    logicalType: 'object',
    physicalType: 'table',
    physicalName: 'analytics.ubl.' + snake(entity.name),
    description: desc(entity),
    authoritativeDefinitions: [
      { type: 'businessDefinition', url: entity.source },
      { type: 'businessDefinition', url: iri + entity.name },
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
    ontology: mapping.entities.map((entity: any) => ({
      concept: entity.name,
      type: 'EntityType',
      iri: iri + entity.name,
      description: desc(entity),
      relationships: entity.relationships.map((relationship: any) => ({
        name: relationship.name,
        description: `UBL role cac:${relationship.name}; source occurrences ${relationship.min}..${relationship.max}.`,
        roles: [
          {
            concept: relationship.target,
            ...(relationship.target === entity.name ? { name: 'related' } : {}),
          },
        ],
        ...(relationship.max === '1' ? { multiplicity: 'ManyToOne' } : {}),
        verbalizes: [`{${entity.name}} has ${relationship.name} {${relationship.target}${relationship.target === entity.name ? ':related' : ''}}`],
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
  const links = entity.relationships.map((relationship: any) => {
    if (relationship.max === '1') {
      const foreignKey = `${dataset}.${snake(relationship.name)}_id`;
      return linkMapping(`${dataset}.record_id`, relationship.name, relationship.target, foreignKey);
    }
    const bridge = `${dataset}__${snake(relationship.name)}`;
    return linkMapping(`${bridge}.source_id`, relationship.name, relationship.target, `${bridge}.target_id`);
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
    datasets: tables.map(table => ({
      name: table.name,
      source: table.physicalName,
      primary_key: ['record_id'],
      description: table.description,
      fields: table.properties.map((property: any) => ({
        name: property.name,
        description: property.description,
        expression: expression(property.name),
        datatype: (
          {
            string: 'String',
            number: 'Decimal',
            boolean: 'Boolean',
            date: 'Date',
            array: 'Opaque',
          } as any
        )[property.logicalType],
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
