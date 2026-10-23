// Keeps unsaved edits from filling the disk: a draft is bounded in size, in number, and to files
// the person has.
import { expect, test } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertRoomForDraft,
  MAX_DRAFTS_PER_OWNER,
  MAX_DRAFTS_PER_PROJECT,
} from '../server/routes/drafts';
import { testWorkspace } from './helpers/temp-data-dir';
import { ontologyText } from './helpers/git-fixtures';

const ORIGIN = 'http://127.0.0.1:4310';
const draftRequest = (path: string, text: string) =>
  new Request(`${ORIGIN}/api/drafts/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-SW-Request': '1', Origin: ORIGIN },
    body: JSON.stringify({ baseHash: null, text, patches: [] }),
  });
const draftFiles = (root: string) => {
  const folder = join(root, 'state', 'drafts');
  return existsSync(folder) ? readdirSync(folder, { recursive: true }) : [];
};

test('a draft for a file the project does not have is refused and writes nothing', async () => {
  using fixture = await testWorkspace();
  const project = await fixture.seed([
    { path: 'a.ontology.yaml', source: ontologyText('A', ['X']) },
  ]);
  const reply = await fixture.handler(draftRequest(`${project.slug}/nothing/here.yaml`, 'x: 1\n'));
  expect(reply.status).toBe(404);
  expect(draftFiles(fixture.root)).toEqual([]);
  const kept = await fixture.handler(draftRequest(`${project.slug}/a.ontology.yaml`, 'x: 1\n'));
  expect(kept.status).toBe(200);
});

test('a draft far larger than a saved file is refused', async () => {
  using fixture = await testWorkspace();
  const project = await fixture.seed([
    { path: 'a.ontology.yaml', source: ontologyText('A', ['X']) },
  ]);
  const path = `${project.slug}/a.ontology.yaml`;
  expect((await fixture.handler(draftRequest(path, 'a'.repeat(3_000_000)))).status).toBe(200);
  expect((await fixture.handler(draftRequest(path, 'a'.repeat(5_000_000)))).status).toBe(400);
});

test('the draft count per project is capped, and replacing a draft is not a new one', async () => {
  using fixture = await testWorkspace();
  const files = Array.from({ length: MAX_DRAFTS_PER_PROJECT + 1 }, (_, index) => ({
    path: `f${index}.ontology.yaml`,
    source: ontologyText(`F${index}`, ['X']),
  }));
  const project = await fixture.seed(files);
  for (const file of files.slice(0, MAX_DRAFTS_PER_PROJECT)) {
    const reply = await fixture.handler(draftRequest(`${project.slug}/${file.path}`, 'x: 1\n'));
    expect(reply.status).toBe(200);
  }
  const last = files[MAX_DRAFTS_PER_PROJECT];
  expect(
    (await fixture.handler(draftRequest(`${project.slug}/${last.path}`, 'x: 1\n'))).status,
  ).toBe(400);
  const again = files[0];
  expect(
    (await fixture.handler(draftRequest(`${project.slug}/${again.path}`, 'x: 2\n'))).status,
  ).toBe(200);
}, 60_000);

test('the draft count per person is capped across projects', () => {
  const held = Array.from({ length: MAX_DRAFTS_PER_OWNER }, (_, index) => ({
    project: `p${index % 10}`,
    path: `f${index}.yaml`,
  }));
  expect(() => assertRoomForDraft(held, 'fresh', 'a.yaml')).toThrow('Too many unsaved edits.');
  expect(() => assertRoomForDraft(held, 'p0', 'f0.yaml')).not.toThrow();
});
