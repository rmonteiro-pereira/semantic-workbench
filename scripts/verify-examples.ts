// Runs validation and metric checks for the generated examples.
import { checkExamples } from './example-checks';
const result = await checkExamples();
await Bun.write('docs/example-verification.json', JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      officialExamples: result.imports.length,
      generated: result.generated,
      sqlExecutions: result.sqlExecutions.length,
      blockedCases: result.blockedCases,
    },
    null,
    2,
  ),
);
