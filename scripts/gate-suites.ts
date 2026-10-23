/** Browser scripts shared by the local gate and image checks. */
export const gateSuites: string[] = [
  'test:auth',
  'test:two-editors',
  'test:ui',
  'test:responsive',
  'test:edges',
  'test:grouping-validation',
  'test:examples:ui',
  'test:projects',
  'test:trash',
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
  'test:terminology',
  'test:mappings-layout',
  'test:mapping-graph',
];

/** Suites that serve their own built frontend and require server container coverage. */
export const selfServedSuites = ['test:auth', 'test:two-editors'];

/** Explicit reasons why other test scripts are not browser gate suites. */
export const exclusions = [
  { script: 'test:mutation', reason: 'Runs in the mutation step' },
  { script: 'test:container', reason: 'Runs in the container step' },
  { script: 'test:examples', reason: 'Unit-level example check covered by bun test' },
  { script: 'test:admin', reason: 'added with its phase' },
  { script: 'test:auth:keycloak', reason: "Compatibility suite on the owner's machine" },
];
