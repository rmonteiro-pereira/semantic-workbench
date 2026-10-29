// Tests Git action refusals when workspace changes would be lost.
import { test, expect } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { blockers } from '../src/server/projects/scm';
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
  const project = await scmProject();
  try {
    writeFileSync(join(project.other, 'shop.yaml'), ontology('Remote.'));
    sh(project.other, ['commit', '-qam', 'Remote']);
    sh(project.other, ['push', '-q']);
    await ok(call(project.t, 'POST', project.base + '/git/switch', { branch: 'side', create: true }));
    await ok(call(project.t, 'POST', project.base + '/git/switch', { branch: 'main' }));
    project.t.ws.state.writeDraft(project.slug, 'shop.yaml', {
      baseHash: null,
      text: 'unsaved',
      patches: [],
    });
    for (const [method, path, body] of [
      ['POST', '/git/pull'],
      ['POST', '/git/sync'],
      ['POST', '/git/switch', { branch: 'side' }],
    ] as const) {
      const response = await call(project.t, method, project.base + path, body);
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: 'drafts', paths: ['shop.yaml'] });
    }
    project.t.ws.state.deleteDraft(project.slug, 'shop.yaml');
    project.write('shop.yaml', ontology('Local edit.'));
    for (const [path, body] of [['/git/pull'], ['/git/switch', { branch: 'side' }]] as const) {
      const response = await call(project.t, 'POST', project.base + path, body);
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: 'dirty', paths: ['shop.yaml'] });
    }
    expect(sh(project.dir, ['stash', 'list'])).toBe('');
    expect(project.t.ws.readFile(project.slug, 'shop.yaml').source).toBe(ontology('Local edit.'));
    expect((await ok(call(project.t, 'GET', project.base + '/git/status'))).branch).toBe('main');
    // Staged-only changes block too; push and fetch do not touch the working tree and are allowed.
    await ok(call(project.t, 'POST', project.base + '/git/stage', { all: true }));
    expect((await call(project.t, 'POST', project.base + '/git/pull')).body.error).toBe('dirty');
    expect((await ok(call(project.t, 'POST', project.base + '/git/fetch'))).ok).toBe(true);
    // An untracked file alone does not block a switch.
    await ok(call(project.t, 'POST', project.base + '/git/unstage', { all: true }));
    sh(project.dir, ['checkout', '--', 'shop.yaml']);
    project.write('scratch.csv', 'x');
    await ok(call(project.t, 'POST', project.base + '/git/switch', { branch: 'side' }));
  } finally {
    project.dispose();
  }
});
