// Bundled faces and fallbacks must work without an external font service.
import { expect, test } from 'bun:test';
import { fontProblems } from '../scripts/font-mutation-cases';

test('font URLs, family licences and CSS fallback stacks are complete', () => {
  expect(fontProblems(process.cwd())).toEqual([]);
});
