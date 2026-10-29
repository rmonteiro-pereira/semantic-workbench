// Tests deletion, undo, restore and purge without overwriting occupied paths.
import { LOCAL_READER } from '../src/server/projects/reader';
import { test, expect } from 'bun:test';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../src/server/projects/atomic';
import { UNDO_MS, ulid } from '../src/server/projects/trash';
import { testWorkspace } from './helpers/temp-data-dir';
const ont = (name: string) => `name: ${name}\nontology: [{concept: ${name}}]\n`;
const api = (workspace: { handler: (request: Request) => Promise<Response> }, method: string, path: string, body?: unknown) =>
  workspace.handler(
    new Request('http://127.0.0.1:4310' + path, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
async function setup() {
  let clock = Date.parse('2026-10-21T10:00:00Z');
  const workspace = await testWorkspace({ now: () => clock });
  await workspace.ws.importBatch(
    {
      name: 'Alpha',
      files: [
        { path: 'a.yaml', source: ont('A') },
        { path: 'dir/b.yaml', source: ont('B') },
      ],
    },
    LOCAL_READER,
  );
  await workspace.ws.importBatch({ name: 'Beta', files: [{ path: 'c.yaml', source: ont('C') }] }, LOCAL_READER);
  return {
    workspace,
    tick: (ms: number) => {
      clock += ms;
    },
    file: (slug: string, path: string) => join(workspace.root, 'projects', slug, path),
  };
}
test('ULIDs are 26 Crockford characters and sort by time', () => {
  const earlier = ulid(1000);
  const later = ulid(2000);
  expect(earlier).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(earlier < later).toBe(true);
});
test('deleting a file needs confirmation, moves it to the trash and undo restores it exactly within 10 s', async () => {
  const { workspace, tick, file } = await setup();
  try {
    expect((await api(workspace, 'DELETE', '/api/projects/alpha/files/a.yaml')).status).toBe(400);
    expect((await api(workspace, 'DELETE', '/api/projects/alpha/files/a.yaml', { confirm: false })).status).toBe(400);
    expect(existsSync(file('alpha', 'a.yaml'))).toBe(true);
    workspace.ws.state.writeView('alpha', { 'a.yaml': { mode: 'types' } });
    workspace.ws.state.writeDraft('alpha', 'a.yaml', {
      baseHash: sha256(ont('A')),
      text: 'draft',
      patches: [],
    });
    const response = await api(workspace, 'DELETE', '/api/projects/alpha/files/a.yaml', {
      confirm: true,
    });
    expect(response.status).toBe(200);
    const { entryId, undoUntil } = await response.json();
    expect(Date.parse(undoUntil) - Date.parse('2026-10-21T10:00:00Z')).toBe(UNDO_MS);
    expect(existsSync(file('alpha', 'a.yaml'))).toBe(false);
    expect(readFileSync(join(workspace.root, 'trash', entryId, 'payload', 'a.yaml'), 'utf8')).toBe(ont('A'));
    expect(JSON.parse(readFileSync(join(workspace.root, 'trash', entryId, 'entry.json'), 'utf8'))).toMatchObject({
      entryId,
      kind: 'file',
      project: 'alpha',
      projectName: 'Alpha',
      path: 'a.yaml',
      hash: sha256(ont('A')),
      batchId: null,
    });
    expect(workspace.ws.cache.file('alpha', 'a.yaml')).toBeNull();
    expect(workspace.ws.state.draft('alpha', 'a.yaml')).toBeNull();
    expect(workspace.ws.grouping('alpha/a.yaml', LOCAL_READER)).toEqual({});
    expect((await workspace.ws.git.status(join(workspace.root, 'projects/alpha'))).files.get('a.yaml')).toBe('deleted');
    tick(UNDO_MS);
    expect((await api(workspace, 'POST', `/api/trash/${entryId}/undo`)).status).toBe(200);
    expect(readFileSync(file('alpha', 'a.yaml'), 'utf8')).toBe(ont('A'));
    expect(workspace.ws.state.draft('alpha', 'a.yaml')!.text).toBe('draft');
    expect(workspace.ws.grouping('alpha/a.yaml', LOCAL_READER)).toEqual({ mode: 'types' });
    expect(existsSync(join(workspace.root, 'trash', entryId))).toBe(false);
    expect((await workspace.ws.git.status(join(workspace.root, 'projects/alpha'))).changes).toBe(0);
  } finally {
    workspace.dispose();
  }
});
test('after 10 s undo is refused with 410 and restore from the trash still works', async () => {
  const { workspace, tick, file } = await setup();
  try {
    const { entryId } = await workspace.ws.trash.deleteFile('alpha', 'dir/b.yaml', undefined, LOCAL_READER);
    tick(UNDO_MS + 1);
    const late = await api(workspace, 'POST', `/api/trash/${entryId}/undo`);
    expect(late.status).toBe(410);
    expect(existsSync(file('alpha', 'dir/b.yaml'))).toBe(false);
    expect((await (await api(workspace, 'GET', '/api/trash')).json()).map((entry: any) => [entry.entryId, entry.kind, entry.path])).toEqual([[entryId, 'file', 'dir/b.yaml']]);
    expect((await api(workspace, 'POST', `/api/trash/${entryId}/restore`)).status).toBe(200);
    expect(readFileSync(file('alpha', 'dir/b.yaml'), 'utf8')).toBe(ont('B'));
    expect((await api(workspace, 'POST', '/api/trash/NOTANID/undo')).status).toBe(404);
  } finally {
    workspace.dispose();
  }
});
test('restore never overwrites: an occupied location is a 409 with a free alternative', async () => {
  const { workspace, file } = await setup();
  try {
    const { entryId } = await workspace.ws.trash.deleteFile('alpha', 'a.yaml', undefined, LOCAL_READER);
    writeFileSync(file('alpha', 'a.yaml'), ont('Newer'));
    await workspace.ws.rescan('alpha');
    const response = await api(workspace, 'POST', `/api/trash/${entryId}/restore`);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: 'occupied',
      suggestion: { toProject: 'alpha', toPath: 'a (2).yaml' },
    });
    expect(readFileSync(file('alpha', 'a.yaml'), 'utf8')).toBe(ont('Newer'));
    expect(
      (
        await api(workspace, 'POST', `/api/trash/${entryId}/restore`, {
          toProject: 'alpha',
          toPath: 'a (2).yaml',
        })
      ).status,
    ).toBe(200);
    expect(readFileSync(file('alpha', 'a (2).yaml'), 'utf8')).toBe(ont('A'));
    expect(readFileSync(file('alpha', 'a.yaml'), 'utf8')).toBe(ont('Newer'));
  } finally {
    workspace.dispose();
  }
});
test('deleting a project moves its folder with .git and registry entry; restore brings both back', async () => {
  const { workspace } = await setup();
  try {
    workspace.ws.state.writeView('beta', { 'c.yaml': { mode: 'types' } });
    expect((await api(workspace, 'DELETE', '/api/projects/beta', {})).status).toBe(400);
    const { entryId } = await (await api(workspace, 'DELETE', '/api/projects/beta', { confirm: true })).json();
    expect(workspace.ws.state.registry().projects.map(p => p.slug)).toEqual(['alpha']);
    expect(existsSync(join(workspace.root, 'projects/beta'))).toBe(false);
    expect(existsSync(join(workspace.root, 'trash', entryId, 'payload/beta/.git/HEAD'))).toBe(true);
    expect(workspace.ws.cache.files('beta')).toEqual([]);
    expect((await api(workspace, 'POST', `/api/trash/${entryId}/undo`)).status).toBe(200);
    expect(workspace.ws.state.registry().projects.map(p => [p.slug, p.name])).toEqual([
      ['alpha', 'Alpha'],
      ['beta', 'Beta'],
    ]);
    expect(workspace.ws.grouping('beta/c.yaml', LOCAL_READER)).toEqual({ mode: 'types' });
    expect((await workspace.ws.git.run(join(workspace.root, 'projects/beta'), ['log', '--format=%s'])).stdout.trim()).toBe('Import c.yaml');
    expect(workspace.ws.cache.files('beta').map(f => f.path)).toEqual(['c.yaml']);
  } finally {
    workspace.dispose();
  }
});
test('a deleted file whose project is gone is restored into a new project; a taken project id is a 409', async () => {
  const { workspace } = await setup();
  try {
    const file = await workspace.ws.trash.deleteFile('beta', 'c.yaml', undefined, LOCAL_READER);
    const project = await workspace.ws.trash.deleteProject('beta');
    await workspace.ws.importBatch({ name: 'Beta', files: [{ path: 'x.yaml', source: ont('X') }] }, LOCAL_READER);
    const occupied = await api(workspace, 'POST', `/api/trash/${project.entryId}/restore`);
    expect(occupied.status).toBe(409);
    const { suggestion } = await occupied.json();
    expect(suggestion).toEqual({ toProject: 'beta-2' });
    expect(await (await api(workspace, 'POST', `/api/trash/${project.entryId}/restore`, suggestion)).json()).toEqual({ kind: 'project', project: 'beta-2', name: 'Beta (2)' });
    await workspace.ws.trash.deleteProject('beta');
    await workspace.ws.trash.deleteProject('beta-2');
    const restored = await workspace.ws.trash.restore(file.entryId, {}, LOCAL_READER);
    expect(restored.kind).toBe('file');
    expect(workspace.ws.state.registry().projects.find(p => p.slug === restored.project)!.name).toBe('Beta');
  } finally {
    workspace.dispose();
  }
});
test('Clear moves every project to the trash as entries sharing a batch id; purge needs confirmation', async () => {
  const { workspace } = await setup();
  try {
    expect((await api(workspace, 'POST', '/api/clear', {})).status).toBe(400);
    const clear = await (await api(workspace, 'POST', '/api/clear', { confirm: true })).json();
    expect(clear.entries).toHaveLength(2);
    expect(workspace.ws.state.registry().projects).toEqual([]);
    expect(readdirSync(join(workspace.root, 'projects'))).toEqual([]);
    const entries = await (await api(workspace, 'GET', '/api/trash')).json();
    expect(entries.map((e: any) => e.batchId)).toEqual([clear.batchId, clear.batchId]);
    expect(entries.map((e: any) => e.kind)).toEqual(['project', 'project']);
    for (const id of clear.entries) expect((await api(workspace, 'POST', `/api/trash/${id}/undo`)).status).toBe(200);
    expect(
      workspace.ws.state
        .registry()
        .projects.map(p => p.slug)
        .sort(),
    ).toEqual(['alpha', 'beta']);
    const { entryId } = await workspace.ws.trash.deleteFile('alpha', 'a.yaml', undefined, LOCAL_READER);
    expect((await api(workspace, 'DELETE', `/api/trash/${entryId}`, {})).status).toBe(400);
    expect(existsSync(join(workspace.root, 'trash', entryId))).toBe(true);
    expect((await api(workspace, 'DELETE', `/api/trash/${entryId}`, { confirm: true })).status).toBe(204);
    expect(existsSync(join(workspace.root, 'trash', entryId))).toBe(false);
    await workspace.ws.trash.deleteFile('alpha', 'dir/b.yaml', undefined, LOCAL_READER);
    expect((await api(workspace, 'DELETE', '/api/trash', {})).status).toBe(400);
    expect((await api(workspace, 'DELETE', '/api/trash', { confirm: true })).status).toBe(204);
    expect(await (await api(workspace, 'GET', '/api/trash')).json()).toEqual([]);
  } finally {
    workspace.dispose();
  }
});
test('every multi-file operation is journaled and leaves no journal behind', async () => {
  const { workspace } = await setup();
  try {
    const ops: string[] = [];
    const run = workspace.ws.journal.run;
    (workspace.ws.journal as any).run = (kind: string, ...rest: any[]) => {
      ops.push(kind);
      return (run as any)(kind, ...rest);
    };
    const deletedFile = await workspace.ws.trash.deleteFile('alpha', 'a.yaml', undefined, LOCAL_READER);
    await workspace.ws.trash.undo(deletedFile.entryId, LOCAL_READER);
    const deletedProject = await workspace.ws.trash.deleteProject('beta');
    await workspace.ws.trash.restore(deletedProject.entryId, {}, LOCAL_READER);
    await workspace.ws.trash.clear();
    expect(ops).toEqual(['delete', 'restore', 'delete', 'restore', 'clear']);
    expect(workspace.ws.journal.pending()).toEqual([]);
  } finally {
    workspace.dispose();
  }
});
