// Tests deletion, undo, restore and purge without overwriting occupied paths.
import { LOCAL_READER } from '../server/projects/reader';
import { test, expect } from 'bun:test';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../server/projects/atomic';
import { UNDO_MS, ulid } from '../server/projects/trash';
import { testWorkspace } from './helpers/temp-data-dir';
const ont = (name: string) => `name: ${name}\nontology: [{concept: ${name}}]\n`;
const api = (
  t: { handler: (r: Request) => Promise<Response> },
  method: string,
  path: string,
  body?: unknown,
) =>
  t.handler(
    new Request('http://127.0.0.1:4310' + path, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
async function setup() {
  let clock = Date.parse('2026-10-21T10:00:00Z');
  const t = await testWorkspace({ now: () => clock });
  await t.ws.importBatch(
    {
      name: 'Alpha',
      files: [
        { path: 'a.yaml', source: ont('A') },
        { path: 'dir/b.yaml', source: ont('B') },
      ],
    },
    LOCAL_READER,
  );
  await t.ws.importBatch(
    { name: 'Beta', files: [{ path: 'c.yaml', source: ont('C') }] },
    LOCAL_READER,
  );
  return {
    t,
    tick: (ms: number) => {
      clock += ms;
    },
    file: (slug: string, path: string) => join(t.root, 'projects', slug, path),
  };
}
test('ULIDs are 26 Crockford characters and sort by time', () => {
  const a = ulid(1000);
  const b = ulid(2000);
  expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(a < b).toBe(true);
});
test('deleting a file needs confirmation, moves it to the trash and undo restores it exactly within 10 s', async () => {
  const { t, tick, file } = await setup();
  try {
    expect((await api(t, 'DELETE', '/api/projects/alpha/files/a.yaml')).status).toBe(400);
    expect(
      (await api(t, 'DELETE', '/api/projects/alpha/files/a.yaml', { confirm: false })).status,
    ).toBe(400);
    expect(existsSync(file('alpha', 'a.yaml'))).toBe(true);
    t.ws.state.writeView('alpha', { 'a.yaml': { mode: 'types' } });
    t.ws.state.writeDraft('alpha', 'a.yaml', {
      baseHash: sha256(ont('A')),
      text: 'draft',
      patches: [],
    });
    const r = await api(t, 'DELETE', '/api/projects/alpha/files/a.yaml', { confirm: true });
    expect(r.status).toBe(200);
    const { entryId, undoUntil } = await r.json();
    expect(Date.parse(undoUntil) - Date.parse('2026-10-21T10:00:00Z')).toBe(UNDO_MS);
    expect(existsSync(file('alpha', 'a.yaml'))).toBe(false);
    expect(readFileSync(join(t.root, 'trash', entryId, 'payload', 'a.yaml'), 'utf8')).toBe(
      ont('A'),
    );
    expect(
      JSON.parse(readFileSync(join(t.root, 'trash', entryId, 'entry.json'), 'utf8')),
    ).toMatchObject({
      entryId,
      kind: 'file',
      project: 'alpha',
      projectName: 'Alpha',
      path: 'a.yaml',
      hash: sha256(ont('A')),
      batchId: null,
    });
    expect(t.ws.cache.file('alpha', 'a.yaml')).toBeNull();
    expect(t.ws.state.draft('alpha', 'a.yaml')).toBeNull();
    expect(t.ws.grouping('alpha/a.yaml', LOCAL_READER)).toEqual({});
    expect((await t.ws.git.status(join(t.root, 'projects/alpha'))).files.get('a.yaml')).toBe(
      'deleted',
    );
    tick(UNDO_MS);
    expect((await api(t, 'POST', `/api/trash/${entryId}/undo`)).status).toBe(200);
    expect(readFileSync(file('alpha', 'a.yaml'), 'utf8')).toBe(ont('A'));
    expect(t.ws.state.draft('alpha', 'a.yaml')!.text).toBe('draft');
    expect(t.ws.grouping('alpha/a.yaml', LOCAL_READER)).toEqual({ mode: 'types' });
    expect(existsSync(join(t.root, 'trash', entryId))).toBe(false);
    expect((await t.ws.git.status(join(t.root, 'projects/alpha'))).changes).toBe(0);
  } finally {
    t.dispose();
  }
});
test('after 10 s undo is refused with 410 and restore from the trash still works', async () => {
  const { t, tick, file } = await setup();
  try {
    const { entryId } = await t.ws.trash.deleteFile('alpha', 'dir/b.yaml', undefined, LOCAL_READER);
    tick(UNDO_MS + 1);
    const late = await api(t, 'POST', `/api/trash/${entryId}/undo`);
    expect(late.status).toBe(410);
    expect(existsSync(file('alpha', 'dir/b.yaml'))).toBe(false);
    expect(
      (await (await api(t, 'GET', '/api/trash')).json()).map((e: any) => [
        e.entryId,
        e.kind,
        e.path,
      ]),
    ).toEqual([[entryId, 'file', 'dir/b.yaml']]);
    expect((await api(t, 'POST', `/api/trash/${entryId}/restore`)).status).toBe(200);
    expect(readFileSync(file('alpha', 'dir/b.yaml'), 'utf8')).toBe(ont('B'));
    expect((await api(t, 'POST', '/api/trash/NOTANID/undo')).status).toBe(404);
  } finally {
    t.dispose();
  }
});
test('restore never overwrites: an occupied location is a 409 with a free alternative', async () => {
  const { t, file } = await setup();
  try {
    const { entryId } = await t.ws.trash.deleteFile('alpha', 'a.yaml', undefined, LOCAL_READER);
    writeFileSync(file('alpha', 'a.yaml'), ont('Newer'));
    await t.ws.rescan('alpha');
    const r = await api(t, 'POST', `/api/trash/${entryId}/restore`);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({
      error: 'occupied',
      suggestion: { toProject: 'alpha', toPath: 'a (2).yaml' },
    });
    expect(readFileSync(file('alpha', 'a.yaml'), 'utf8')).toBe(ont('Newer'));
    expect(
      (
        await api(t, 'POST', `/api/trash/${entryId}/restore`, {
          toProject: 'alpha',
          toPath: 'a (2).yaml',
        })
      ).status,
    ).toBe(200);
    expect(readFileSync(file('alpha', 'a (2).yaml'), 'utf8')).toBe(ont('A'));
    expect(readFileSync(file('alpha', 'a.yaml'), 'utf8')).toBe(ont('Newer'));
  } finally {
    t.dispose();
  }
});
test('deleting a project moves its folder with .git and registry entry; restore brings both back', async () => {
  const { t } = await setup();
  try {
    t.ws.state.writeView('beta', { 'c.yaml': { mode: 'types' } });
    expect((await api(t, 'DELETE', '/api/projects/beta', {})).status).toBe(400);
    const { entryId } = await (
      await api(t, 'DELETE', '/api/projects/beta', { confirm: true })
    ).json();
    expect(t.ws.state.registry().projects.map(p => p.slug)).toEqual(['alpha']);
    expect(existsSync(join(t.root, 'projects/beta'))).toBe(false);
    expect(existsSync(join(t.root, 'trash', entryId, 'payload/beta/.git/HEAD'))).toBe(true);
    expect(t.ws.cache.files('beta')).toEqual([]);
    expect((await api(t, 'POST', `/api/trash/${entryId}/undo`)).status).toBe(200);
    expect(t.ws.state.registry().projects.map(p => [p.slug, p.name])).toEqual([
      ['alpha', 'Alpha'],
      ['beta', 'Beta'],
    ]);
    expect(t.ws.grouping('beta/c.yaml', LOCAL_READER)).toEqual({ mode: 'types' });
    expect(
      (await t.ws.git.run(join(t.root, 'projects/beta'), ['log', '--format=%s'])).stdout.trim(),
    ).toBe('Import c.yaml');
    expect(t.ws.cache.files('beta').map(f => f.path)).toEqual(['c.yaml']);
  } finally {
    t.dispose();
  }
});
test('a deleted file whose project is gone is restored into a new project; a taken project id is a 409', async () => {
  const { t } = await setup();
  try {
    const file = await t.ws.trash.deleteFile('beta', 'c.yaml', undefined, LOCAL_READER);
    const project = await t.ws.trash.deleteProject('beta');
    await t.ws.importBatch(
      { name: 'Beta', files: [{ path: 'x.yaml', source: ont('X') }] },
      LOCAL_READER,
    );
    const occupied = await api(t, 'POST', `/api/trash/${project.entryId}/restore`);
    expect(occupied.status).toBe(409);
    const { suggestion } = await occupied.json();
    expect(suggestion).toEqual({ toProject: 'beta-2' });
    expect(
      await (await api(t, 'POST', `/api/trash/${project.entryId}/restore`, suggestion)).json(),
    ).toEqual({ kind: 'project', project: 'beta-2', name: 'Beta (2)' });
    await t.ws.trash.deleteProject('beta');
    await t.ws.trash.deleteProject('beta-2');
    const restored = await t.ws.trash.restore(file.entryId, {}, LOCAL_READER);
    expect(restored.kind).toBe('file');
    expect(t.ws.state.registry().projects.find(p => p.slug === restored.project)!.name).toBe(
      'Beta',
    );
  } finally {
    t.dispose();
  }
});
test('Clear moves every project to the trash as entries sharing a batch id; purge needs confirmation', async () => {
  const { t } = await setup();
  try {
    expect((await api(t, 'POST', '/api/clear', {})).status).toBe(400);
    const clear = await (await api(t, 'POST', '/api/clear', { confirm: true })).json();
    expect(clear.entries).toHaveLength(2);
    expect(t.ws.state.registry().projects).toEqual([]);
    expect(readdirSync(join(t.root, 'projects'))).toEqual([]);
    const entries = await (await api(t, 'GET', '/api/trash')).json();
    expect(entries.map((e: any) => e.batchId)).toEqual([clear.batchId, clear.batchId]);
    expect(entries.map((e: any) => e.kind)).toEqual(['project', 'project']);
    for (const id of clear.entries)
      expect((await api(t, 'POST', `/api/trash/${id}/undo`)).status).toBe(200);
    expect(
      t.ws.state
        .registry()
        .projects.map(p => p.slug)
        .sort(),
    ).toEqual(['alpha', 'beta']);
    const { entryId } = await t.ws.trash.deleteFile('alpha', 'a.yaml', undefined, LOCAL_READER);
    expect((await api(t, 'DELETE', `/api/trash/${entryId}`, {})).status).toBe(400);
    expect(existsSync(join(t.root, 'trash', entryId))).toBe(true);
    expect((await api(t, 'DELETE', `/api/trash/${entryId}`, { confirm: true })).status).toBe(204);
    expect(existsSync(join(t.root, 'trash', entryId))).toBe(false);
    await t.ws.trash.deleteFile('alpha', 'dir/b.yaml', undefined, LOCAL_READER);
    expect((await api(t, 'DELETE', '/api/trash', {})).status).toBe(400);
    expect((await api(t, 'DELETE', '/api/trash', { confirm: true })).status).toBe(204);
    expect(await (await api(t, 'GET', '/api/trash')).json()).toEqual([]);
  } finally {
    t.dispose();
  }
});
test('every multi-file operation is journaled and leaves no journal behind', async () => {
  const { t } = await setup();
  try {
    const ops: string[] = [];
    const run = t.ws.journal.run;
    (t.ws.journal as any).run = (kind: string, ...rest: any[]) => {
      ops.push(kind);
      return (run as any)(kind, ...rest);
    };
    const f = await t.ws.trash.deleteFile('alpha', 'a.yaml', undefined, LOCAL_READER);
    await t.ws.trash.undo(f.entryId, LOCAL_READER);
    const p = await t.ws.trash.deleteProject('beta');
    await t.ws.trash.restore(p.entryId, {}, LOCAL_READER);
    await t.ws.trash.clear();
    expect(ops).toEqual(['delete', 'restore', 'delete', 'restore', 'clear']);
    expect(t.ws.journal.pending()).toEqual([]);
  } finally {
    t.dispose();
  }
});
