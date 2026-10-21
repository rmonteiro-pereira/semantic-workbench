// Tests Git status, staging and diffs for workspace files.
import { test, expect } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStatus } from '../server/projects/git';
import { call, ok, ontology, scmProject } from './helpers/scm';
test('porcelain v2 -z: index and worktree columns, renames with their origin, conflicts, upstream', () => {
  const out = [
    '# branch.oid abc',
    '# branch.head feature',
    '# branch.upstream origin/feature',
    '# branch.ab +1 -3',
    '1 MM N... 100644 100644 100644 a b both.yaml',
    '2 R. N... 100644 100644 100644 a a R100 dir/new name.yaml',
    'dir/old name.yaml',
    'u UU N... 100644 100644 100644 100644 a b c c.yaml',
    '? notes.csv',
    '',
  ].join('\0');
  const s = parseStatus(out);
  expect([s.branch, s.upstream, s.ahead, s.behind]).toEqual(['feature', 'origin/feature', 1, 3]);
  expect(s.entries).toEqual([
    { path: 'both.yaml', index: 'M', worktree: 'M', conflicted: false, untracked: false },
    {
      path: 'dir/new name.yaml',
      orig: 'dir/old name.yaml',
      index: 'R',
      worktree: '.',
      conflicted: false,
      untracked: false,
    },
    { path: 'c.yaml', index: 'U', worktree: 'U', conflicted: true, untracked: false },
    { path: 'notes.csv', index: '?', worktree: '?', conflicted: false, untracked: true },
  ]);
});
test('status lists hidden-type changes labelled "not shown in workspace", and skips ignored files', async () => {
  const p = await scmProject({ remote: false });
  try {
    p.write('notes.csv', 'a,b\n');
    mkdirSync(join(p.dir, 'sub'));
    p.write('sub/ünïcode file.yaml', ontology('x'));
    p.write('shop.yaml', ontology('Changed.'));
    writeFileSync(join(p.dir, '.gitignore'), '*.log\n');
    p.write('debug.log', 'noise');
    const s = await ok(call(p.t, 'GET', p.base + '/git/status'));
    expect(s).toMatchObject({
      branch: 'main',
      gitAvailable: true,
      identityConfigured: true,
      merging: false,
    });
    const byPath = Object.fromEntries(s.changes.map((c: any) => [c.path, c]));
    expect(Object.keys(byPath).sort()).toEqual([
      '.gitignore',
      'notes.csv',
      'shop.yaml',
      'sub/ünïcode file.yaml',
    ]);
    expect(byPath['notes.csv']).toMatchObject({
      hidden: true,
      label: 'not shown in workspace',
      untracked: true,
    });
    expect(byPath['shop.yaml']).toMatchObject({ hidden: false, index: '.', worktree: 'M' });
    expect(byPath['shop.yaml'].label).toBeUndefined();
    expect(byPath['.gitignore'].hidden).toBe(false);
    // Stage, unstage and diff work for hidden files too (read-only in the workspace, not in Git).
    const staged = await ok(
      call(p.t, 'POST', p.base + '/git/stage', { paths: ['notes.csv', 'shop.yaml'] }),
    );
    expect(staged.changes.find((c: any) => c.path === 'notes.csv')).toMatchObject({
      index: 'A',
      worktree: '.',
    });
    const d = await ok(call(p.t, 'GET', p.base + '/git/diff?path=notes.csv&from=HEAD&to=index'));
    expect(d).toMatchObject({
      before: '',
      after: 'a,b\n',
      beforeExists: false,
      afterExists: true,
      binary: false,
    });
    const u = await ok(call(p.t, 'POST', p.base + '/git/unstage', { paths: ['notes.csv'] }));
    expect(u.changes.find((c: any) => c.path === 'notes.csv').untracked).toBe(true);
    const y = await ok(call(p.t, 'GET', p.base + '/git/diff?path=shop.yaml'));
    expect([y.before, y.after]).toEqual([ontology('Buys.'), ontology('Changed.')]);
    p.write('blob.bin', '\0\x01binary');
    expect((await ok(call(p.t, 'GET', p.base + '/git/diff?path=blob.bin'))).binary).toBe(true);
    expect((await call(p.t, 'GET', p.base + '/git/diff?path=../x')).status).toBe(400);
    expect((await call(p.t, 'GET', p.base + '/git/diff?path=shop.yaml&from=HEAD;rm')).status).toBe(
      400,
    );
  } finally {
    p.dispose();
  }
});
test('commit needs a message and staged changes; history and versions between two commits', async () => {
  const p = await scmProject({ remote: false });
  try {
    p.write('shop.yaml', ontology('Second.'));
    expect(
      (await call(p.t, 'POST', p.base + '/git/commit', { message: 'x' })).body.error,
    ).toContain('Nothing is staged');
    await ok(call(p.t, 'POST', p.base + '/git/stage', { all: true }));
    for (const message of ['', '   ', undefined, 42])
      expect((await call(p.t, 'POST', p.base + '/git/commit', { message })).body.error).toBe(
        'A commit message is required.',
      );
    const c = await ok(
      call(p.t, 'POST', p.base + '/git/commit', { message: 'Describe customers' }),
    );
    expect(c.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(c.altered).toEqual([]);
    p.write('shop.yaml', ontology('Third.'));
    await ok(call(p.t, 'POST', p.base + '/git/stage', { paths: ['shop.yaml'] }));
    await ok(call(p.t, 'POST', p.base + '/git/commit', { message: 'Again' }));
    const log = await ok(call(p.t, 'GET', p.base + '/git/log?path=shop.yaml'));
    expect(log.map((l: any) => l.message)).toEqual([
      'Again',
      'Describe customers',
      'Import shop.yaml',
    ]);
    expect(log[0]).toMatchObject({ author: 'Workbench Test' });
    const d = await ok(
      call(
        p.t,
        'GET',
        `${p.base}/git/diff?path=shop.yaml&from=${log[2].commit}&to=${log[0].commit}`,
      ),
    );
    expect([d.before, d.after]).toEqual([ontology('Buys.'), ontology('Third.')]);
    expect(
      (await ok(call(p.t, 'GET', `${p.base}/git/show?commit=${log[1].commit}&path=shop.yaml`)))
        .source,
    ).toBe(ontology('Second.'));
    const versions = await ok(call(p.t, 'GET', p.base + '/git/versions?path=shop.yaml&limit=2'));
    expect(versions.map((v: any) => [v.message, v.source])).toEqual([
      ['Again', ontology('Third.')],
      ['Describe customers', ontology('Second.')],
    ]);
    expect((await ok(call(p.t, 'GET', p.base + '/git/status'))).changes).toEqual([]);
  } finally {
    p.dispose();
  }
});
test("branches: create, list, switch; a switched branch's content is rescanned", async () => {
  const p = await scmProject({ remote: false });
  try {
    await ok(call(p.t, 'POST', p.base + '/git/switch', { branch: 'feature', create: true }));
    p.write('shop.yaml', ontology('On feature.'));
    await ok(call(p.t, 'POST', p.base + '/git/stage', { all: true }));
    await ok(call(p.t, 'POST', p.base + '/git/commit', { message: 'Feature' }));
    expect(await ok(call(p.t, 'GET', p.base + '/git/branches'))).toEqual({
      current: 'feature',
      local: ['feature', 'main'],
      remote: [],
    });
    await ok(call(p.t, 'POST', p.base + '/git/switch', { branch: 'main' }));
    expect(p.t.ws.readFile(p.slug, 'shop.yaml').source).toBe(ontology('Buys.'));
    expect((await ok(call(p.t, 'GET', '/api/projects')))[0].branch).toBe('main');
    for (const branch of ['-x', 'bad..name', ''])
      expect(
        (await call(p.t, 'POST', p.base + '/git/switch', { branch, create: true })).status,
      ).toBe(400);
  } finally {
    p.dispose();
  }
});
