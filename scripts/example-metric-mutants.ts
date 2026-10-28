// Defines faults in the example registry: each one drops a file that carries a metric, its
// concept binding or its data contract, and the example metric checks must notice.

/** Example mutants use the same category, module, before and after tuple as the suite. */
export const exampleMetricMutants: [string, string, string, string][] = [
  ['example-registry', 'src/shared/projects/examples.ts', "      'sales.mapping.yaml',\n", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "      'sales.ossie.yaml',\n", ''],
  [
    'example-registry',
    'src/shared/projects/examples.ts',
    "      'ubl.semantic-mapping.yaml',\n",
    '',
  ],
  ['example-registry', 'src/shared/projects/examples.ts', "      'ubl.odcs.yaml',\n", ''],
  [
    'example-registry',
    'src/shared/projects/examples.ts',
    "      'commerce.mapped-semantic.yaml',\n      'commerce.odcs.yaml',\n",
    "      'commerce.mapped-semantic.yaml',\n",
  ],
  [
    'example-registry',
    'src/shared/projects/examples.ts',
    "      'flights.metrics.semantic.yaml',\n",
    '',
  ],
  [
    'example-registry',
    'src/shared/projects/examples.ts',
    "      'flights.metrics.mapping.yaml',\n",
    '',
  ],
  ['example-registry', 'src/shared/projects/examples.ts', "      'flights.odcs.yaml',\n", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "      'billing.odcs.yaml',\n", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "      'billing.mapping.yaml',\n", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "      'mall.mapping.yaml',\n", ''],
  ['example-registry', 'src/shared/projects/examples.ts', "      'mall.odcs.yaml',\n", ''],
];
