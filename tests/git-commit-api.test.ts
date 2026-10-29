// Tests selected-path commits, push results and journaled reverts.
import { test, expect } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { testWorkspace } from './helpers/temp-data-dir';
import { call, ok, ontology, scmProject, sh } from './helpers/scm';
// POST git/commit with `paths` and `push`, POST git/revert (journaled), and commit refusal during
// a merge with conflicts.
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
test('commit with paths commits exactly those paths; push reports its outcome', async () => {
  const p = await scmProject();
  try {
    p.write('shop.yaml', ontology('Changed.'));
    p.write('extra.yaml', ontology('Extra'));
    p.write('other.yaml', ontology('Other'));
    sh(p.dir, ['add', 'other.yaml']);
    const r = await ok(
      call(p.t, 'POST', p.base + '/git/commit', {
        message: 'Update shop.yaml',
        paths: ['shop.yaml', 'extra.yaml'],
        push: true,
      }),
    );
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(r.pushed).toMatchObject({ ok: true });
    expect(sh(p.dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n').sort()).toEqual(['extra.yaml', 'shop.yaml']);
    expect(sh(p.dir, ['status', '--porcelain']).trim()).toBe('A  other.yaml');
    expect(sh(p.bare, ['log', '-1', '--format=%s', 'main']).trim()).toBe('Update shop.yaml');
    // Without explicit paths, the commit uses the staged index.
    const idx = await ok(call(p.t, 'POST', p.base + '/git/commit', { message: 'Index' }));
    expect(idx.pushed).toBeUndefined();
    expect(sh(p.dir, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe('other.yaml');
  } finally {
    p.dispose();
  }
});
test('commit with push and no remote commits and explains the push failure', async () => {
  const p = await scmProject({ remote: false });
  try {
    p.write('shop.yaml', ontology('Changed.'));
    const r = await ok(
      call(p.t, 'POST', p.base + '/git/commit', {
        message: 'Update',
        paths: ['shop.yaml'],
        push: true,
      }),
    );
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(r.pushed.ok).toBe(false);
    expect(r.pushed.message).toContain('no remote');
  } finally {
    p.dispose();
  }
});
test('empty message and path escapes are refused; commit with paths is refused during a merge', async () => {
  const p = await scmProject({ remote: false });
  try {
    expect((await call(p.t, 'POST', p.base + '/git/commit', { message: ' ', paths: ['shop.yaml'] })).status).toBe(500);
    expect((await call(p.t, 'POST', p.base + '/git/commit', { message: 'x', paths: ['../x'] })).status).toBe(400);
    sh(p.dir, ['switch', '-q', '-c', 'other']);
    p.write('shop.yaml', ontology('Other'));
    sh(p.dir, ['commit', '-qam', 'other']);
    sh(p.dir, ['switch', '-q', 'main']);
    p.write('shop.yaml', ontology('Main'));
    sh(p.dir, ['commit', '-qam', 'main']);
    Bun.spawnSync(['git', 'merge', 'other'], { cwd: p.dir });
    p.write('new.yaml', ontology('New'));
    const r = await call(p.t, 'POST', p.base + '/git/commit', {
      message: 'x',
      paths: ['new.yaml'],
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('merging');
    expect(r.body.conflicts).toEqual(['shop.yaml']);
  } finally {
    p.dispose();
  }
});
test('revert restores the last committed bytes and keeps the replaced version in the trash', async () => {
  const p = await scmProject({ remote: false });
  try {
    const committed = readFileSync(join(p.dir, 'shop.yaml'), 'utf8');
    const mine = ontology('My edit.');
    p.write('shop.yaml', mine);
    expect(
      (
        await call(p.t, 'POST', p.base + '/git/revert', {
          path: 'shop.yaml',
          baseHash: hash(committed),
        })
      ).status,
    ).toBe(409);
    const r = await ok(call(p.t, 'POST', p.base + '/git/revert', { path: 'shop.yaml', baseHash: hash(mine) }));
    expect(readFileSync(join(p.dir, 'shop.yaml'), 'utf8')).toBe(committed);
    expect(r.hash).toBe(hash(committed));
    expect(sh(p.dir, ['status', '--porcelain']).trim()).toBe('');
    const trash = await ok(call(p.t, 'GET', '/api/trash'));
    const entry = trash.find((e: any) => e.entryId === r.trashEntry);
    expect(entry).toMatchObject({ kind: 'file', path: 'shop.yaml', hash: hash(mine) });
    // The replaced version can be restored (as a copy, since shop.yaml exists again).
    const restored = await call(p.t, 'POST', `/api/trash/${r.trashEntry}/restore`, {});
    expect(restored.status).toBe(409);
    // A file that is not in the last commit is moved to the trash.
    p.write('draft.yaml', ontology('New'));
    const gone = await ok(
      call(p.t, 'POST', p.base + '/git/revert', {
        path: 'draft.yaml',
        baseHash: hash(ontology('New')),
      }),
    );
    expect(gone.hash).toBeNull();
    expect(existsSync(join(p.dir, 'draft.yaml'))).toBe(false);
  } finally {
    p.dispose();
  }
});
test('an interrupted revert is completed on the next start', async () => {
  const crash = { on: false };
  const t = await testWorkspace({
    journalHooks: {
      crashAfter: (kind: string, step: number) => crash.on && kind === 'revert' && step === 0,
    },
  });
  const root = t.root;
  const created = await ok(
    call(t, 'POST', '/api/import', {
      files: [{ path: 'shop.yaml', source: ontology('Committed.') }],
    }),
  );
  const dir = join(root, 'projects', created.slug);
  const mine = ontology('Mine.');
  writeFileSync(join(dir, 'shop.yaml'), mine);
  crash.on = true;
  const r = await call(t, 'POST', `/api/projects/${created.slug}/git/revert`, {
    path: 'shop.yaml',
    baseHash: hash(mine),
  });
  expect(r.status).not.toBe(200);
  expect(existsSync(join(dir, 'shop.yaml'))).toBe(false);
  t.ws.close();
  const again = await testWorkspace({ root });
  try {
    expect(again.ws.recovery.map(x => [x.kind, x.outcome])).toEqual([['revert', 'completed']]);
    expect(readFileSync(join(dir, 'shop.yaml'), 'utf8')).toBe(ontology('Committed.'));
    const trash = await ok(call(again, 'GET', '/api/trash'));
    expect(trash.some((e: any) => e.hash === hash(mine))).toBe(true);
  } finally {
    again.dispose();
  }
});
