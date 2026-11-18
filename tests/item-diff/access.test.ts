import { expect, test } from 'bun:test';
import { readDiffSide } from '../../src/server/auth/item-diff-access';
import { errorResponse } from '../../src/server/routes/http';
import { boundaryReader } from '../auth/access-fixture';
import { itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';

const project = 'finance';
const hidden = 'finance.ontology.yaml';
const reader = boundaryReader({ readableProjects: new Set([project]), canRead: (_project, path) => path !== hidden, roles: () => [] }, 'reader');

test('missing, private, and denied sides have the same refusal bytes', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const responses = await Promise.all(
    [
      () => readDiffSide(reader, project, () => fixture.ws.itemDiffSides.revision(project, 'branch', 'work/comparison', reader)),
      () => readDiffSide(reader, project, () => fixture.ws.itemDiffSides.revision(project, 'branch', 'missing', reader)),
      () => readDiffSide(reader, 'private', () => Promise.reject(new Error('looked up private data'))),
    ].map(async read => {
      try {
        await read();
        throw new Error('comparison side should be unavailable');
      } catch (error) {
        const response = errorResponse(error, undefined, { serverMode: true });
        return { status: response.status, body: await response.text() };
      }
    }),
  );
  expect(responses).toEqual(Array.from({ length: 3 }, () => ({ status: 404, body: '{"error":"Not found."}' })));
});

test('file restrictions omit definitions on both sides without an unreadable entry', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const published = await readDiffSide(reader, project, () => fixture.ws.itemDiffSides.published(project, reader));
  const working = await readDiffSide(reader, project, () => fixture.ws.itemDiffSides.working(project, reader));
  for (const side of [published, working]) {
    expect(side.documents.map(document => document.path)).not.toContain(hidden);
    expect(side.unreadable).toEqual([]);
  }
});
