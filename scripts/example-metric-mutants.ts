// Defines faults in the example registry: each one drops a file that carries a metric, its
// concept binding or its data contract, and the example metric checks must notice.

/** Example mutants use the same category, module, before and after tuple as the suite. */
export const exampleMetricMutants: [string, string, string, string][] = [
  ['example-registry', 'src/shared/projects/examples.ts', "'sales.mapping.yaml', ", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "'sales.ossie.yaml', ", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "'ubl.semantic-mapping.yaml', ", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "'ubl.odcs.yaml', ", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "'commerce.mapped-semantic.yaml', 'commerce.odcs.yaml'", "'commerce.mapped-semantic.yaml'"],
  ['example-registry', 'src/shared/projects/examples.ts', "'flights.metrics.semantic.yaml', ", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "'flights.metrics.mapping.yaml', ", ''],
  ['example-registry', 'src/shared/projects/examples.ts', ", 'flights.odcs.yaml'", ''],
  ['example-registry', 'src/shared/projects/examples.ts', ", 'billing.odcs.yaml'", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "'billing.mapping.yaml', ", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "'mall.mapping.yaml', ", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "'mall.odcs.yaml', ", ''],
];
