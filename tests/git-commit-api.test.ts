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
  const project = await scmProject();
  try {
    project.write('shop.yaml', ontology('Changed.'));
    project.write('extra.yaml', ontology('Extra'));
    project.write('other.yaml', ontology('Other'));
    sh(project.dir, ['add', 'other.yaml']);
    const commitResult = await ok(
      call(project.t, 'POST', project.base + '/git/commit', {
        message: 'Update shop.yaml',
        paths: ['shop.yaml', 'extra.yaml'],
        push: true,
      }),
    );
    expect(commitResult.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(commitResult.pushed).toMatchObject({ ok: true });
    expect(sh(project.dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n').sort()).toEqual(['extra.yaml', 'shop.yaml']);
    expect(sh(project.dir, ['status', '--porcelain']).trim()).toBe('A  other.yaml');
    expect(sh(project.bare, ['log', '-1', '--format=%s', 'main']).trim()).toBe('Update shop.yaml');
    // Without explicit paths, the commit uses the staged index.
    const idx = await ok(call(project.t, 'POST', project.base + '/git/commit', { message: 'Index' }));
    expect(idx.pushed).toBeUndefined();
    expect(sh(project.dir, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe('other.yaml');
  } finally {
    project.dispose();
  }
});
test('commit with push and no remote commits and explains the push failure', async () => {
  const project = await scmProject({ remote: false });
  try {
    project.write('shop.yaml', ontology('Changed.'));
    const commitResult = await ok(
      call(project.t, 'POST', project.base + '/git/commit', {
        message: 'Update',
        paths: ['shop.yaml'],
        push: true,
      }),
    );
    expect(commitResult.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(commitResult.pushed.ok).toBe(false);
    expect(commitResult.pushed.message).toContain('no remote');
  } finally {
    project.dispose();
  }
});
test('empty message and path escapes are refused; commit with paths is refused during a merge', async () => {
  const project = await scmProject({ remote: false });
  try {
    expect(
      (
        await call(project.t, 'POST', project.base + '/git/commit', {
          message: ' ',
          paths: ['shop.yaml'],
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await call(project.t, 'POST', project.base + '/git/commit', {
          message: 'x',
          paths: ['../x'],
        })
      ).status,
    ).toBe(400);
    sh(project.dir, ['switch', '-q', '-c', 'other']);
    project.write('shop.yaml', ontology('Other'));
    sh(project.dir, ['commit', '-qam', 'other']);
    sh(project.dir, ['switch', '-q', 'main']);
    project.write('shop.yaml', ontology('Main'));
    sh(project.dir, ['commit', '-qam', 'main']);
    Bun.spawnSync(['git', 'merge', 'other'], { cwd: project.dir });
    project.write('new.yaml', ontology('New'));
    const response = await call(project.t, 'POST', project.base + '/git/commit', {
      message: 'x',
      paths: ['new.yaml'],
    });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('merging');
    expect(response.body.conflicts).toEqual(['shop.yaml']);
  } finally {
    project.dispose();
  }
});
test('revert restores the last committed bytes and keeps the replaced version in the trash', async () => {
  const project = await scmProject({ remote: false });
  try {
    const committed = readFileSync(join(project.dir, 'shop.yaml'), 'utf8');
    const mine = ontology('My edit.');
    project.write('shop.yaml', mine);
    expect(
      (
        await call(project.t, 'POST', project.base + '/git/revert', {
          path: 'shop.yaml',
          baseHash: hash(committed),
        })
      ).status,
    ).toBe(409);
    const revertResult = await ok(
      call(project.t, 'POST', project.base + '/git/revert', {
        path: 'shop.yaml',
        baseHash: hash(mine),
      }),
    );
    expect(readFileSync(join(project.dir, 'shop.yaml'), 'utf8')).toBe(committed);
    expect(revertResult.hash).toBe(hash(committed));
    expect(sh(project.dir, ['status', '--porcelain']).trim()).toBe('');
    const trash = await ok(call(project.t, 'GET', '/api/trash'));
    const entry = trash.find((e: any) => e.entryId === revertResult.trashEntry);
    expect(entry).toMatchObject({ kind: 'file', path: 'shop.yaml', hash: hash(mine) });
    // The replaced version can be restored (as a copy, since shop.yaml exists again).
    const restored = await call(project.t, 'POST', `/api/trash/${revertResult.trashEntry}/restore`, {});
    expect(restored.status).toBe(409);
    // A file that is not in the last commit is moved to the trash.
    project.write('draft.yaml', ontology('New'));
    const gone = await ok(
      call(project.t, 'POST', project.base + '/git/revert', {
        path: 'draft.yaml',
        baseHash: hash(ontology('New')),
      }),
    );
    expect(gone.hash).toBeNull();
    expect(existsSync(join(project.dir, 'draft.yaml'))).toBe(false);
  } finally {
    project.dispose();
  }
});
test('an interrupted revert is completed on the next start', async () => {
  const crash = { on: false };
  const workspace = await testWorkspace({
    journalHooks: {
      crashAfter: (kind: string, step: number) => crash.on && kind === 'revert' && step === 0,
    },
  });
  const root = workspace.root;
  const created = await ok(
    call(workspace, 'POST', '/api/import', {
      files: [{ path: 'shop.yaml', source: ontology('Committed.') }],
    }),
  );
  const dir = join(root, 'projects', created.slug);
  const mine = ontology('Mine.');
  writeFileSync(join(dir, 'shop.yaml'), mine);
  crash.on = true;
  const response = await call(workspace, 'POST', `/api/projects/${created.slug}/git/revert`, {
    path: 'shop.yaml',
    baseHash: hash(mine),
  });
  expect(response.status).not.toBe(200);
  expect(existsSync(join(dir, 'shop.yaml'))).toBe(false);
  workspace.ws.close();
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
