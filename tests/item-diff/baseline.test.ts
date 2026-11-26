// Keeps production consumers tied to the published baseline while working definitions differ.
import { expect, test } from 'bun:test';
import { itemDiffAgentAnswers, itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';

test('published consumer answers equal the recorded responses with unpublished saved edits', async () => {
  const baseline = await Bun.file('tests/fixtures/item-diff/baseline.json').json();
  using fixture = await itemDiffBaselineWorkspace();
  expect(await itemDiffAgentAnswers(fixture)).toEqual(baseline.agent);
  expect(Object.keys(baseline.dom).sort()).toEqual(['catalog', 'entityDetails', 'fullGraph', 'fullGraphToolbar', 'neighborhoodGraph', 'neighborhoodToolbar', 'publish', 'relationshipDetails']);
  for (const answer of Object.values(baseline.agent)) expect(answer).not.toContain('+ 987');
});
