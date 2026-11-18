// Tests that counts follow a project into the trash and back, are removed with a purged entry, stay
// out of exports, and that removing the whole store harms nothing else.
import { expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { createUsageStore } from '../../src/server/usage/usage-store';
import { addCount, emptyDayFile } from '../../src/server/usage/usage-counts';
import { testWorkspace } from '../helpers/temp-data-dir';
import { readZip } from '../helpers/zip-reader';

const address = (project: string) => `sw1:${project}/a.yaml#ontology:O/concept:A`;

async function projectWithCounts() {
  const workspace = await testWorkspace();
  const project = await workspace.seed([{ path: 'a.yaml', source: 'name: O\nontology: [{concept: A}]' }], 'Counted');
  const store = createUsageStore(workspace.ws.layout);
  const file = emptyDayFile(project.slug, '2026-11-16');
  addCount(file.counts, { address: address(project.slug), measure: 'workbench-requests', operation: 'agent.context.read', origin: 'http' }, 4);
  store.writeDay(file);
  return { workspace, slug: project.slug, store, file };
}

test('counts move into the trash entry with the project and back when it is restored', async () => {
  const { workspace, slug, store, file } = await projectWithCounts();
  try {
    const removed = await workspace.ws.trash.deleteProject(slug);
    expect(existsSync(join(workspace.ws.layout.usage, slug))).toBe(false);
    expect(existsSync(join(workspace.ws.layout.trash, removed.entryId, 'usage', slug, '2026-11-16.json'))).toBe(true);
    await workspace.ws.trash.restore(removed.entryId, {}, LOCAL_READER);
    expect(store.readDay(slug, '2026-11-16')).toEqual({ status: 'ok', file });
  } finally {
    workspace.dispose();
  }
});

test('a project restored under another name starts without counts and the archived ones are purged with the entry', async () => {
  const { workspace, slug, store } = await projectWithCounts();
  try {
    const removed = await workspace.ws.trash.deleteProject(slug);
    await workspace.ws.trash.restore(removed.entryId, { toProject: 'renamed' }, LOCAL_READER);
    expect(store.listDays('renamed')).toEqual([]);
    const again = await workspace.ws.trash.deleteProject('renamed');
    workspace.ws.trash.purge(again.entryId);
    expect(existsSync(join(workspace.ws.layout.trash, again.entryId))).toBe(false);
    expect(existsSync(join(workspace.ws.layout.usage, 'renamed'))).toBe(false);
  } finally {
    workspace.dispose();
  }
});

test('a purged project loses its counts', async () => {
  const { workspace, slug } = await projectWithCounts();
  try {
    const removed = await workspace.ws.trash.deleteProject(slug);
    workspace.ws.trash.purge(removed.entryId);
    expect(existsSync(join(workspace.ws.layout.trash, removed.entryId, 'usage'))).toBe(false);
    expect(existsSync(join(workspace.ws.layout.usage, slug))).toBe(false);
  } finally {
    workspace.dispose();
  }
});

test('a workbench export holds no counts', async () => {
  const { workspace, slug } = await projectWithCounts();
  try {
    const response = await workspace.handler(new Request(`http://127.0.0.1:4310/api/projects/${slug}/export?history=1`));
    const entries = readZip(new Uint8Array(await response.arrayBuffer()));
    expect([...entries.keys()].filter(name => name !== 'git-history.bundle')).toEqual(['a.yaml']);
    for (const bytes of entries.values()) expect(new TextDecoder().decode(bytes)).not.toContain('workbench-requests');
  } finally {
    workspace.dispose();
  }
});

test('deleting the whole usage folder leaves every other feature working', async () => {
  const { workspace, slug } = await projectWithCounts();
  try {
    rmSync(workspace.ws.layout.usage, { recursive: true, force: true });
    const handler = createHandler(workspace.ws, { usageSettings: { enabled: true, retentionDays: 30 } });
    expect((await handler(new Request(`http://localhost/api/projects/${slug}/files/a.yaml`))).status).toBe(200);
    expect((await handler(new Request('http://localhost/api/projects'))).status).toBe(200);
    handler.usage.close();
  } finally {
    workspace.dispose();
  }
});
