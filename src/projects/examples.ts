/** Defines shipped example projects and their filenames for import and migration grouping. */
// Each example set loads as one project. Migration recognizes the filenames to keep related
// documents together.
/** Describes one shipped example project and its source files. */
export type ExampleSet = {
  id: string;
  name: string;
  folder: string;
  files: string[];
  tab: 'graph' | 'fullgraph' | 'mappings';
  message: string;
};
export const EXAMPLE_SETS: ExampleSet[] = [
  {
    id: 'ubl',
    name: 'UBL business model',
    folder: 'ubl',
    files: [
      'ubl.ontology.yaml',
      'ubl.owl.ttl',
      'ubl.odcs.yaml',
      'ubl.semantic.yaml',
      'ubl.shacl.ttl',
    ],
    tab: 'graph',
    message:
      'Loaded UBL: 45 business entities, 277 roles; OWL, SHACL, ODCS, and semantic datasets.',
  },
  {
    id: 'commerce',
    name: 'Commerce workspace',
    folder: 'commerce',
    files: [
      'commerce.odcs.yaml',
      'sales.ossie.yaml',
      'sales.mapping.yaml',
      'commerce-business.ossie.yaml',
      'commerce.owl.ttl',
      'commerce.owl',
      'commerce.shacl.ttl',
      'commerce-data.ttl',
    ],
    tab: 'graph',
    message:
      'Loaded commerce contracts, semantic model with 6 governed metrics, ontology, OWL, SHACL, and RDF data. Select a document in the sidebar.',
  },
  {
    id: 'commerce-scale',
    name: 'Commerce scale data',
    folder: 'commerce',
    files: ['commerce-scale.ttl'],
    tab: 'graph',
    message:
      'Loaded 1,000 business resources and 5,000 links. Showing a neighborhood; search to explore.',
  },
  {
    id: 'mapped-commerce',
    name: 'Mapped commerce',
    folder: 'commerce',
    files: [
      'commerce.mapping.yaml',
      'commerce.mapped-ontology.yaml',
      'commerce.mapped-semantic.yaml',
      'commerce.odcs.yaml',
    ],
    tab: 'mappings',
    message:
      'Loaded mapped commerce: ontology, semantic model, 4 governed metrics, explicit mappings and the data contract.',
  },
  {
    id: 'flights',
    name: 'Ossie Flights',
    folder: 'ossie',
    files: [
      'flights.ontology.yaml',
      'flights.semantic_model.yaml',
      'flights.mapping.yaml',
      'flights.yaml',
    ],
    tab: 'fullgraph',
    message:
      'Loaded official Apache Ossie Flights: ontology, semantic model, standalone and embedded mappings.',
  },
  {
    id: 'billing',
    name: 'Subscription billing',
    folder: 'billing',
    files: [
      'billing.mapping.yaml',
      'billing.ontology.yaml',
      'billing.semantic.yaml',
      'billing.odcs.yaml',
    ],
    tab: 'mappings',
    message:
      'Loaded subscription billing: 36 business entities, 46 joins, 119 bindings, 8 governed metrics, and a data contract for the tables they read.',
  },
  {
    id: 'mall',
    name: 'Shopping center administration',
    folder: 'mall',
    files: [
      'mall.ontology.yaml',
      'mall.semantic.yaml',
      'mall.mapping.yaml',
      'mall.odcs.yaml',
      'mall.owl.ttl',
      'mall.shacl.ttl',
      'mall-data.ttl',
    ],
    tab: 'graph',
    message:
      'Loaded shopping center administration: 145 entity types in 11 namespaces, 259 joins, 1,057 bindings and 25 metrics with attributes, with OWL, SHACL, ODCS and RDF data.',
  },
];
/** Looks up a shipped example project by identifier. */
export const exampleSet = (id: string) => EXAMPLE_SETS.find(e => e.id === id);
/** Finds the example project containing a shipped filename. */
export const exampleForFilename = (filename: string) =>
  EXAMPLE_SETS.find(e => e.files.includes(filename));
