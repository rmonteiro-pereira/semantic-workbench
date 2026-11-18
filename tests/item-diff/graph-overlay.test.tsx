import { expect, test } from 'bun:test';
import { graphChanges } from '../../src/app/item-diff/graph-changes';
import { parseSide } from '../../src/shared/item-diff/sides';
import { inspect } from '../../src/shared/core/model';
import { compareProjectItems } from '../../src/server/projects/item-diff';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';

test('card overlay preserves working actions and restores removed nodes at their published relationships', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const project = 'finance';
  const path = 'finance.ontology.yaml';
  const before = (await fixture.ws.itemDiffSides.published(project, LOCAL_READER)).documents.find(document => document.path === path)!;
  const file = fixture.ws.readFile(project, path, LOCAL_READER);
  const source = `name: Finance
ontology:
  - concept: Customer
    description: A different buyer.
  - concept: Invoice
`;
  await fixture.ws.saveFile(project, path, { baseHash: file.hash, source }, LOCAL_READER);
  const diff = await compareProjectItems(fixture.ws.itemDiffSides, project, parseSide('published'), parseSide('working'), LOCAL_READER);
  const saved = inspect(source, path);
  const published = inspect(before.source, path);
  expect(graphChanges(saved, [], { project, path }, published)).toBe(saved);
  const graph = graphChanges(saved, diff.changes, { project, path }, published);
  expect(graph.entities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Customer', change: 'changed' }),
      expect.objectContaining({ name: 'Invoice', change: 'added' }),
      expect.objectContaining({ change: 'removed', readOnlyForm: true }),
    ]),
  );
  expect(graph.entities.find(entity => entity.name === 'Customer')?.readOnlyForm).toBeUndefined();
  expect(graph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ id: expect.stringMatching(/^removed:/) })]));
});
