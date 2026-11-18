import { expect, test } from 'bun:test';
import { itemDiffAgentAnswers, itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';

test('an active browser comparison leaves consumer responses byte-for-byte equivalent to production', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const markedBrowser = new Request('http://localhost:5173/api/projects/finance/item-diff?from=published&to=working', { headers: { 'Sec-Fetch-Site': 'same-origin' } });
  const response = await fixture.handler(markedBrowser);
  expect(response.status).toBe(200);
  expect((await response.json()).counts.changed).toBeGreaterThan(0);
  const expected = await Bun.file('tests/fixtures/item-diff/baseline.json').json();
  expect(await itemDiffAgentAnswers(fixture)).toEqual(expected.agent);
});
