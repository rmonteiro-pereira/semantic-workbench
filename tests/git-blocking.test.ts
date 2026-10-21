import { test, expect } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blockers } from '../server/projects/scm';
import { call, ok, ontology, scmProject, sh } from './helpers/scm';
const entry = (path: string, untracked = false) => ({
  path,
  index: untracked ? '?' : '.',
  worktree: untracked ? '?' : 'M',
  conflicted: false,
  untracked,
});
test('blockers: drafts first, then tracked changes; untracked files alone do not block', () => {
  expect(blockers(['a.yaml'], [entry('b.yaml')])).toMatchObject({
    reason: 'drafts',
    paths: ['a.yaml'],
  });
  expect(blockers([], [entry('b.yaml'), entry('c.csv', true)])).toMatchObject({
    reason: 'dirty',
    paths: ['b.yaml'],
  });
  expect(blockers([], [entry('c.csv', true)])).toBeNull();
  expect(blockers([], [])).toBeNull();
});
test('pull, sync and switch answer 409 with drafts or a dirty tree, and nothing is stashed', async () => {
  const p = await scmProject();
  try {
    writeFileSync(join(p.other, 'shop.yaml'), ontology('Remote.'));
    sh(p.other, ['commit', '-qam', 'Remote']);
    sh(p.other, ['push', '-q']);
    await ok(call(p.t, 'POST', p.base + '/git/switch', { branch: 'side', create: true }));
    await ok(call(p.t, 'POST', p.base + '/git/switch', { branch: 'main' }));
    p.t.ws.state.writeDraft(p.slug, 'shop.yaml', { baseHash: null, text: 'unsaved', patches: [] });
    for (const [method, path, body] of [
      ['POST', '/git/pull'],
      ['POST', '/git/sync'],
      ['POST', '/git/switch', { branch: 'side' }],
    ] as const) {
      const r = await call(p.t, method, p.base + path, body);
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: 'drafts', paths: ['shop.yaml'] });
    }
    p.t.ws.state.deleteDraft(p.slug, 'shop.yaml');
    p.write('shop.yaml', ontology('Local edit.'));
    for (const [path, body] of [['/git/pull'], ['/git/switch', { branch: 'side' }]] as const) {
      const r = await call(p.t, 'POST', p.base + path, body);
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: 'dirty', paths: ['shop.yaml'] });
    }
    expect(sh(p.dir, ['stash', 'list'])).toBe('');
    expect(p.t.ws.readFile(p.slug, 'shop.yaml').source).toBe(ontology('Local edit.'));
    expect((await ok(call(p.t, 'GET', p.base + '/git/status'))).branch).toBe('main');
    // Staged-only changes block too; push and fetch do not touch the working tree and are allowed.
    await ok(call(p.t, 'POST', p.base + '/git/stage', { all: true }));
    expect((await call(p.t, 'POST', p.base + '/git/pull')).body.error).toBe('dirty');
    expect((await ok(call(p.t, 'POST', p.base + '/git/fetch'))).ok).toBe(true);
    // An untracked file alone does not block a switch.
    await ok(call(p.t, 'POST', p.base + '/git/unstage', { all: true }));
    sh(p.dir, ['checkout', '--', 'shop.yaml']);
    p.write('scratch.csv', 'x');
    await ok(call(p.t, 'POST', p.base + '/git/switch', { branch: 'side' }));
  } finally {
    p.dispose();
  }
});
