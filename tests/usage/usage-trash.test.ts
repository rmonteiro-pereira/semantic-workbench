// Tests that counts follow a project into the trash and back, are removed with a purged entry, stay
// out of exports, and that removing the whole store harms nothing else.
import { expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { createUsageStore } from '../../src/server/usage/usage-store';
import { addCount, emptyDayFile } from '../../src/server/usage/usage-counts';
import { utcDay } from '../../src/server/usage/usage-retention';
import { testWorkspace } from '../helpers/temp-data-dir';
import { publishFixture } from '../helpers/published-workspace';
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

test('trash drains pending usage and discards an old recording after slug reuse', async () => {
  const { workspace, slug, store } = await projectWithCounts();
  await publishFixture(workspace);
  const documentsAt = workspace.ws.published.documentsAt;
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let lookups = 0;
  workspace.ws.published.documentsAt = async (commit, project) => {
    const documents = await documentsAt(commit, project);
    lookups += 1;
    if (lookups === 2) {
      started.resolve();
      await release.promise;
    }
    return documents;
  };
  const firstCommit = workspace.ws.published.pin().commits.get(slug)!.commit;
  const today = utcDay(new Date());
  const handler = createHandler(workspace.ws, { usageSettings: { enabled: true, retentionDays: 365 } });
  const record = (commit: string) =>
    handler.usage.record({
      operationId: 'agent.context.read',
      origin: 'http',
      surface: 'agent',
      outcome: 'ok',
      target: {},
      response: Response.json({ mappingId: slug + '/mapping.yaml', documents: [{ documentId: slug + '/a.yaml', path: ['ontology', 0] }] }, { headers: { 'X-Workbench-Snapshot': commit } }),
    });
  try {
    record(firstCommit);
    await handler.usage.settled();
    const secondCommit = await publishNote(workspace, slug);
    record(secondCommit);
    await started.promise;
    const removed = await workspace.ws.trash.deleteProject(slug);
    await workspace.seed([{ path: 'a.yaml', source: 'name: O\nontology: [{concept: A}]' }], 'Counted');
    release.resolve();
    await handler.usage.settled();
    handler.usage.flush();
    expect(store.readDay(slug, today)).toEqual({ status: 'missing' });
    const replacement = await workspace.ws.trash.deleteProject(slug);
    workspace.ws.trash.purge(replacement.entryId);
    await workspace.ws.trash.restore(removed.entryId, {}, LOCAL_READER);
    const restored = store.readDay(slug, today);
    expect(restored.status === 'ok' && restored.file.counts[address(slug)]['workbench-requests']['agent.context.read'].http).toBe(1);
  } finally {
    release.resolve();
    await handler.usage.close();
    workspace.dispose();
  }
});

async function publishNote(workspace: Awaited<ReturnType<typeof testWorkspace>>, slug: string) {
  const directory = join(workspace.ws.layout.projects, slug);
  const previous = readFileSync(join(directory, 'a.yaml'), 'utf8');
  writeFileSync(join(directory, 'a.yaml'), previous + '\n# Published note\n');
  await (await workspace.ws.scmFor(slug, LOCAL_READER)).commit(slug, 'Add a comment', { paths: ['a.yaml'] });
  const result = await workspace.ws.publish(slug, LOCAL_READER);
  return result.commit;
}

test('trashing one project preserves an undecoded count belonging to another project', async () => {
  const { workspace, slug, store } = await projectWithCounts();
  const target = await workspace.seed([{ path: 'a.yaml', source: 'name: O\nontology: [{concept: A}]\n# Other project' }], 'Other');
  await publishFixture(workspace);
  expect(target.slug).not.toBe(slug);
  const commit = workspace.ws.published.pin().commits.get(target.slug)!.commit;
  const handler = createHandler(workspace.ws, { usageSettings: { enabled: true, retentionDays: 30 } });
  const body = Promise.withResolvers<string>();
  try {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode(await body.promise));
        controller.close();
      },
    });
    handler.usage.record({
      operationId: 'agent.context.read',
      origin: 'http',
      surface: 'agent',
      outcome: 'ok',
      target: {},
      response: new Response(stream, { headers: { 'X-Workbench-Snapshot': commit } }),
    });
    await workspace.ws.trash.deleteProject(slug);
    body.resolve(JSON.stringify({ mappingId: target.slug + '/mapping.yaml', documents: [{ documentId: target.slug + '/a.yaml', path: ['ontology', 0] }] }));
    await handler.usage.settled();
    handler.usage.flush();
    const day = store.readDay(target.slug, utcDay(new Date()));
    expect(day.status === 'ok' && day.file.counts[address(target.slug)]['workbench-requests']['agent.context.read'].http).toBe(1);
  } finally {
    body.resolve('{}');
    await handler.usage.close();
    workspace.dispose();
  }
});

test('fresh counts survive shutdown and trash alongside an unverified day', async () => {
  const { workspace, slug, store, file } = await projectWithCounts();
  const settings = { enabled: true, retentionDays: 30 };
  await publishFixture(workspace);
  const handler = createHandler(workspace.ws, { usageSettings: settings });
  try {
    const day = utcDay(new Date());
    const legacy = { ...file, day, migratedThrough: 'unverified' };
    store.writeDay(legacy);
    const commit = workspace.ws.published.pin().commits.get(slug)!.commit;
    handler.usage.record({
      operationId: 'agent.context.read',
      origin: 'http',
      surface: 'agent',
      outcome: 'ok',
      target: {},
      response: Response.json({ mappingId: slug + '/mapping.yaml', documents: [{ documentId: slug + '/a.yaml', path: ['ontology', 0] }] }, { headers: { 'X-Workbench-Snapshot': commit } }),
    });
    await handler.usage.settled();
    expect(handler.usage.pending(slug)).toHaveLength(1);
    await handler.usage.close();
    const reopened = createHandler(workspace.ws, { usageSettings: settings });
    try {
      const fresh = emptyDayFile(slug, day);
      addCount(fresh.counts, { address: address(slug), measure: 'workbench-requests', operation: 'agent.context.read', origin: 'http' });
      expect(store.readDay(slug, day)).toEqual({ status: 'ok', file: fresh });
      const removed = await workspace.ws.trash.deleteProject(slug);
      const archived = join(workspace.ws.layout.trash, removed.entryId, 'usage', slug, day + '.unverified.json');
      expect(JSON.parse(readFileSync(archived, 'utf8'))).toEqual(legacy);
      await workspace.ws.trash.restore(removed.entryId, {}, LOCAL_READER);
      expect(store.readDay(slug, day)).toEqual({ status: 'ok', file: fresh });
      expect(JSON.parse(readFileSync(join(store.projectFolder(slug), day + '.unverified.json'), 'utf8'))).toEqual(legacy);
    } finally {
      await reopened.usage.close();
    }
  } finally {
    await handler.usage.close();
    workspace.dispose();
  }
});
