// Tests the check that keeps the product name and logo out of code.
import { expect, test } from 'bun:test';
import { brandViolations, brandViolationsIn } from '../../scripts/check-brand';

test('the product name, the wordmark and the logo path are found', () => {
  const text = [
    "const title = 'Semantic Workbench';",
    '<span>semantic<span className="brand-sub">WORKBENCH</span></span>',
    '<path d="M12.83 2.18a2 2 0 0 0-1.66 0"/>',
  ].join('\n');
  const found = brandViolationsIn('src/app/Example.tsx', text);
  expect(found.map(item => [item.line, item.rule])).toEqual([
    [1, 'product-name'],
    [2, 'wordmark'],
    [3, 'logo-path'],
  ]);
});

test('schema identifiers and the extension vendor name are not a brand', () => {
  const text = "'semantic-workbench/metric/v1' SEMANTIC_WORKBENCH .semantic-workbench.json";
  expect(brandViolationsIn('src/metrics/extension.ts', text)).toEqual([]);
});

test('an allow-listed technical identity passes only in its own file', () => {
  const text = "const committer = 'Semantic Workbench';";
  expect(brandViolationsIn('server/projects/git.ts', text)).toEqual([]);
  expect(brandViolationsIn('server/routes/auth.ts', text)).toHaveLength(1);
});

test('the repository has no hard-coded brand', () => {
  expect(brandViolations()).toEqual([]);
});
