// Runs validation and metric checks for the generated examples.
import { checkExamples } from './example-checks';
import { checkExampleMetrics } from './example-metric-checks';
const result = { ...(await checkExamples()), exampleMetrics: await checkExampleMetrics() };
await Bun.write('docs/example-verification.json', JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      officialExamples: result.imports.length,
      generated: result.generated,
      sqlExecutions: result.sqlExecutions.length,
      metricsPerExample: Object.fromEntries(result.exampleMetrics.map(s => [s.set, s.metrics])),
      blockedCases: result.blockedCases,
    },
    null,
    2,
  ),
);
