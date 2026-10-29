/** Browser scripts shared by the local gate and image checks. */
export const gateSuites: string[] = [
  'test:auth',
  'test:two-editors',
  'test:admin',
  'test:ui',
  'test:responsive',
  'test:edges',
  'test:grouping-validation',
  'test:overview-areas',
  'test:examples:ui',
  'test:projects',
  'test:trash',
  'test:sidebar',
  'test:metrics',
  'test:graph',
  'test:editor',
  'test:item-edit',
  'test:rdf-edit',
  'test:scm',
  'test:odcs',
  'test:lineage',
  'test:autosave',
  'test:sql',
  'test:git-setup',
  'test:monorepo',
  'test:dialogs',
  'test:telemetry',
  'test:terminology',
  'test:mappings-layout',
  'test:mapping-graph',
  'test:back-history',
  'test:theme',
  'test:brand',
];

/** Suites that serve their own built frontend and require server container coverage. */
export const selfServedSuites = ['test:auth', 'test:two-editors', 'test:admin', 'test:brand'];

/** Explicit reasons why other test scripts are not browser gate suites. */
export const exclusions = [
  { script: 'test:mutation', reason: 'Runs in the mutation step' },
  { script: 'test:container', reason: 'Runs in the container step' },
  { script: 'test:examples', reason: 'Unit-level example check covered by bun test' },
  { script: 'test:auth:keycloak', reason: "Compatibility suite on the owner's machine" },
];
