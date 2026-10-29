// Each Editor works in a personal Git working copy; the base checkout holds the published state.
import { expect, spyOn, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit } from '../../src/server/projects/git';
import { openWorkspace } from '../../src/server/projects/workspace';
import { branchHolders, parseWorktreeList } from '../../src/server/projects/worktrees';
import { copyKeyFor, writeKeyFor } from '../../src/server/projects/working-copies';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { testWorkspace } from '../helpers/temp-data-dir';
import { bareRepository, ontologyText } from '../helpers/git-fixtures';
import { createAccessControl } from '../../src/server/auth/authorize';
import type { CloneEvent } from '../../src/server/projects/clone';
import { accessFixture, boundaryReader } from './access-fixture';
import { requestAccess, requestReader } from '../../src/server/auth/request-scope';
import { authWorkspace } from '../helpers/auth-workspace';
import { tempDataDir } from '../helpers/temp-data-dir';
import { person } from './access-fixture';
import { copyFolder, gitOutput, openCopy, salesViewer, saveText, signedIn, textAt } from './working-copy-fixture';

const ORDERS = 'orders.odcs.yaml';
const FILE = `/api/projects/sales-contracts/files/${ORDERS}`;
const note = (who: string) => (text: string) => `${text}# ${who} was here\n`;

test('a first write creates a locked copy on work/<handle>; the base stays detached and unedited', async () => {
  using fixture = await authWorkspace();
  const as = signedIn(fixture.ws);
  const alice = as(person('alice'));
  // Frank's username starts like Alice's, so his handle must be made unique.
  const frank = as({ ...person('frank'), username: 'alice@elsewhere.example' });
  const base = join(fixture.ws.layout.projects, 'sales-contracts');
  const published = textAt(base, ORDERS);

  expect((await saveText(alice.call, 'sales-contracts', ORDERS, note('alice'))).status).toBe(200);
  expect((await saveText(frank.call, 'sales-contracts', ORDERS, note('frank'))).status).toBe(200);

  const aliceCopy = copyFolder(fixture.ws, alice.principal.key, 'sales-contracts');
  const frankCopy = copyFolder(fixture.ws, frank.principal.key, 'sales-contracts');
  expect(gitOutput(aliceCopy, ['branch', '--show-current']).text).toBe('work/alice');
  expect(gitOutput(frankCopy, ['branch', '--show-current']).text).toBe('work/alice-2');
  const listed = parseWorktreeList(gitOutput(base, ['worktree', 'list', '--porcelain']).text);
  expect(listed.filter(entry => entry.locked).map(entry => entry.branch)).toEqual(['work/alice', 'work/alice-2']);
  expect(textAt(aliceCopy, ORDERS)).toContain('# alice was here');
  expect(textAt(aliceCopy, ORDERS)).not.toContain('frank');
  expect(textAt(frankCopy, ORDERS)).not.toContain('alice was');
  // The base checkout is detached at main and its files are untouched.
  expect(gitOutput(base, ['symbolic-ref', '-q', 'HEAD']).code).not.toBe(0);
  expect(gitOutput(base, ['rev-parse', 'HEAD']).text).toBe(gitOutput(base, ['rev-parse', 'refs/heads/main']).text);
  expect(textAt(base, ORDERS)).toBe(published);
  expect(gitOutput(base, ['status', '--porcelain']).text).toBe('');
  // Each person reads their own copy; a Viewer reads the published state and gets no copy.
  expect((await alice.call(FILE)).body.source).toContain('# alice was here');
  const viewer = as(salesViewer());
  expect((await viewer.call(FILE)).body.source).toBe(published);
  expect(existsSync(join(fixture.ws.layout.worktrees, viewer.principal.key))).toBe(false);
});

test('two first writes at once create one copy and both land in it', async () => {
  using fixture = await authWorkspace();
  const alice = signedIn(fixture.ws)(person('alice'));
  const saves = await Promise.all([saveText(alice.call, 'sales-contracts', ORDERS, note('orders')), saveText(alice.call, 'sales-contracts', 'sales.mapping.yaml', note('mapping'))]);
  expect(saves.map(save => save.status)).toEqual([200, 200]);
  const copy = copyFolder(fixture.ws, alice.principal.key, 'sales-contracts');
  expect(textAt(copy, ORDERS)).toContain('# orders was here');
  expect(textAt(copy, 'sales.mapping.yaml')).toContain('# mapping was here');
});

test('a branch checked out in another copy is refused with the name of who holds it', async () => {
  using fixture = await authWorkspace();
  const as = signedIn(fixture.ws);
  const alice = as(person('alice'));
  const frank = as(person('frank'));
  const switchTo = (branch: string) => ['/api/projects/sales-contracts/git/switch', 'POST', { branch }] as const;
  expect((await openCopy(alice.call, 'sales-contracts')).status).toBe(200);
  expect((await openCopy(frank.call, 'sales-contracts')).status).toBe(200);
  const taken = await frank.call(...switchTo('work/alice'));
  expect(taken.status).toBe(409);
  expect(taken.body.inUseBy).toBe('Alice Andrade');
  // Main is protected, so an Editor's copy may not hold it; an Admin's copy finds it published.
  expect((await frank.call(...switchTo('main'))).status).toBe(403);
  const dave = as(person('dave'));
  const published = await dave.call(...switchTo('main'));
  expect(published.status).toBe(409);
  expect(published.body.inUseBy).toBe('the published state');
  const frankCopy = copyFolder(fixture.ws, frank.principal.key, 'sales-contracts');
  expect(gitOutput(frankCopy, ['branch', '--show-current']).text).toBe('work/frank');
  // The project listing tells each person which branches the others hold.
  const projects = (await frank.call('/api/projects')).body;
  const copy = projects.find((project: { slug: string }) => project.slug === 'sales-contracts').copy;
  expect(copy.branch).toBe('work/frank');
  expect(copy.inUseBranches).toContainEqual({ branch: 'work/alice', inUseBy: 'Alice Andrade' });
});

test('publish fast-forwards main with a compare-and-swap and refreshes what everyone reads', async () => {
  using fixture = await authWorkspace();
  const as = signedIn(fixture.ws);
  const bob = as(person('bob'));
  const dave = as(person('dave'));
  const alice = as(person('alice'));
  const viewer = as(salesViewer());
  const base = join(fixture.ws.layout.projects, 'sales-contracts');
  // Dave's copy starts from the main that Bob's publish is about to replace.
  expect((await openCopy(dave.call, 'sales-contracts')).status).toBe(200);
  await saveText(bob.call, 'sales-contracts', ORDERS, note('bob'));
  const committed = await bob.call('/api/projects/sales-contracts/git/commit', 'POST', {
    message: 'Bob edits orders',
    paths: [ORDERS],
  });
  expect(committed.status).toBe(200);
  // An Editor may not publish; the Steward may.
  await saveText(alice.call, 'sales-contracts', ORDERS, note('alice'));
  const refused = await alice.call('/api/projects/sales-contracts/git/publish', 'POST', {});
  expect(refused.status).toBe(403);
  const previous = gitOutput(base, ['rev-parse', 'refs/heads/main']).text;
  const run = spyOn(fixture.ws.git, 'run');
  const published = await bob.call('/api/projects/sales-contracts/git/publish', 'POST', {});
  const updates = run.mock.calls.filter(([, args]) => args.includes('update-ref'));
  run.mockRestore();
  expect(published.status).toBe(200);
  expect(published.body).toEqual({ published: 'main', commit: committed.body.commit });
  expect(updates.map(([, args]) => args)).toEqual([['update-ref', 'refs/heads/main', committed.body.commit, previous]]);
  expect(gitOutput(base, ['rev-parse', 'HEAD']).text).toBe(committed.body.commit);
  expect(gitOutput(base, ['symbolic-ref', '-q', 'HEAD']).code).not.toBe(0);
  expect((await viewer.call(FILE)).body.source).toContain('# bob was here');
  const event = fixture.ws.events.replay(0)!.find(candidate => candidate.event === 'published');
  expect(event?.data).toEqual({
    project: 'sales-contracts',
    branch: 'main',
    commit: committed.body.commit,
  });
  // Dave's copy does not contain the new main: publishing it would not be a fast-forward.
  await saveText(dave.call, 'sales-contracts', 'sales.mapping.yaml', note('dave'));
  await dave.call('/api/projects/sales-contracts/git/commit', 'POST', {
    message: 'Dave edits the mapping',
    paths: ['sales.mapping.yaml'],
  });
  const stale = await dave.call('/api/projects/sales-contracts/git/publish', 'POST', {});
  expect(stale.status).toBe(409);
  expect(stale.body.notFastForward).toBe(true);
  expect(gitOutput(base, ['rev-parse', 'refs/heads/main']).text).toBe(committed.body.commit);
  // Pulling main merges it into Dave's branch, after which his publish fast-forwards.
  const pulled = await dave.call('/api/projects/sales-contracts/git/pull-default', 'POST', {});
  expect(pulled.status).toBe(200);
  expect(pulled.body.ok).toBe(true);
  const daveCopy = copyFolder(fixture.ws, dave.principal.key, 'sales-contracts');
  expect(textAt(daveCopy, ORDERS)).toContain('# bob was here');
  expect(gitOutput(daveCopy, ['log', '-1', '--format=%P']).text.split(' ')).toHaveLength(2);
  const again = await dave.call('/api/projects/sales-contracts/git/publish', 'POST', {});
  expect(again.status).toBe(200);
  expect(textAt(base, 'sales.mapping.yaml')).toContain('# dave was here');
  expect(textAt(base, ORDERS)).toContain('# bob was here');
  // Alice's uncommitted edit stays in her copy only.
  expect(textAt(base, ORDERS)).not.toContain('alice');
});

test('pull from the default branch is refused while the person has uncommitted changes', async () => {
  using fixture = await authWorkspace();
  const alice = signedIn(fixture.ws)(person('alice'));
  await saveText(alice.call, 'sales-contracts', ORDERS, note('alice'));
  const blocked = await alice.call('/api/projects/sales-contracts/git/pull-default', 'POST', {});
  expect(blocked.status).toBe(409);
  expect(blocked.body.error).toBe('dirty');
});

test('every working copy of a repository waits in the base repository Git queue', async () => {
  const data = tempDataDir();
  try {
    const projects = join(data.root, 'projects');
    const worktrees = join(data.root, 'worktrees');
    const log = join(data.root, 'git.log');
    const fake = join(data.root, 'fake-git');
    writeFileSync(log, '');
    // A stand-in for Git that records when each command starts and ends.
    writeFileSync(fake, `#!/bin/sh\necho "start $(basename "$PWD")" >> ${log}\nsleep 0.2\necho "end" >> ${log}\n`);
    chmodSync(fake, 0o755);
    const base = join(projects, 'sales');
    const copy = join(worktrees, 'u0123456789abcdef0123', 'sales');
    const other = join(projects, 'finance');
    for (const dir of [base, copy, other]) mkdirSync(dir, { recursive: true });
    const git = createGit({ projectsRoot: projects, worktreesRoot: worktrees, binary: fake });
    await Promise.all([git.run(base, ['commit']), git.run(copy, ['commit'])]);
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(['start sales', 'end', 'start sales', 'end']);
    writeFileSync(log, '');
    await Promise.all([git.run(copy, ['commit']), git.run(other, ['commit'])]);
    // Another repository has its own queue, so its command does not wait.
    expect(readFileSync(log, 'utf8').trim().split('\n').slice(0, 2).sort()).toEqual(['start finance', 'start sales']);
    expect(() => git.run(join(data.root, 'elsewhere'), ['status'])).toThrow('data/worktrees');
  } finally {
    data.cleanup();
  }
});

test('an idle copy releases its watcher and keeps its files and drafts', async () => {
  const fixture = await authWorkspace();
  fixture.ws.close();
  let now = Date.parse('2026-10-22T09:00:00Z');
  const ws = await openWorkspace({
    root: fixture.root,
    watch: true,
    copyIdleMs: 30 * 60_000,
    now: () => now,
  });
  try {
    const alice = signedIn(ws)(person('alice'));
    await saveText(alice.call, 'sales-contracts', ORDERS, note('alice'));
    const draft = `/api/drafts/sales-contracts/${ORDERS}`;
    await alice.call(draft, 'PUT', { baseHash: null, text: 'unsaved words', patches: [] });
    expect(ws.activeCopies()).toEqual([{ key: alice.principal.key, watching: ['sales-contracts'] }]);
    now += 29 * 60_000;
    expect(ws.releaseIdleCopies()).toEqual([]);
    now += 2 * 60_000;
    expect(ws.releaseIdleCopies()).toEqual([alice.principal.key]);
    expect(ws.activeCopies()).toEqual([]);
    const copy = copyFolder(ws, alice.principal.key, 'sales-contracts');
    expect(textAt(copy, ORDERS)).toContain('# alice was here');
    expect((await alice.call(draft)).body.text).toBe('unsaved words');
    // The next use brings the copy back with the person's edit.
    expect((await alice.call(FILE)).body.source).toContain('# alice was here');
    expect(ws.activeCopies().map(active => active.key)).toEqual([alice.principal.key]);
    // A change waits until the reactivated copy is rescanned, before the folder goes.
    expect((await openCopy(alice.call, 'sales-contracts')).status).toBe(200);
  } finally {
    ws.close();
    fixture.dispose();
  }
});

test('deleting a project keeps each person’s unpublished work in its trash entry', async () => {
  using fixture = await authWorkspace();
  const as = signedIn(fixture.ws);
  const alice = as(person('alice'));
  const dave = as(person('dave'));
  await saveText(alice.call, 'sales-contracts', ORDERS, note('alice'));
  await alice.call(`/api/drafts/sales-contracts/${ORDERS}`, 'PUT', {
    baseHash: null,
    text: 'draft',
    patches: [],
  });
  const impact = await dave.call('/api/projects/sales-contracts/delete-impact');
  expect(impact.body.unpublished).toEqual([{ name: 'Alice Andrade', changes: 1 }]);
  const deleted = await dave.call('/api/projects/sales-contracts', 'DELETE', { confirm: true });
  expect(deleted.status).toBe(200);
  const entry = fixture.ws.trash.entry(deleted.body.entryId);
  const key = alice.principal.key;
  expect(entry.unpublished).toEqual([{ userKey: key, name: 'Alice Andrade', patch: `unpublished/${key}.patch`, drafts: 1 }]);
  const saved = join(fixture.ws.layout.trash, entry.entryId, `unpublished/${key}.patch`);
  expect(readFileSync(saved, 'utf8')).toContain('+# alice was here');
  expect(existsSync(copyFolder(fixture.ws, key, 'sales-contracts'))).toBe(false);
});

test('branch holders name the people of the copies and the published state', () => {
  const entries = parseWorktreeList(
    [
      'worktree /data/projects/sales',
      'HEAD 1111111111111111111111111111111111111111',
      'detached',
      '',
      'worktree /data/worktrees/u0123456789abcdef0123/sales',
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/work/alice',
      'locked Semantic Workbench working copy',
      '',
    ].join('\n'),
  );
  expect(entries[1]).toMatchObject({ branch: 'work/alice', locked: true });
  const people = [{ key: 'u0123456789abcdef0123', handle: 'alice', name: 'Alice Andrade' }];
  expect([...branchHolders(entries, '/data/worktrees', 'main', people)]).toEqual([
    ['main', { key: null, name: 'the published state' }],
    ['work/alice', { key: 'u0123456789abcdef0123', name: 'Alice Andrade' }],
  ]);
});

test('an entry deleted from a copy is its owner’s alone, even for a Steward', async () => {
  using fixture = await authWorkspace();
  const as = signedIn(fixture.ws);
  const alice = as(person('alice'));
  const bob = as(person('bob'));
  // A file with nothing governed in it, which an Editor may delete.
  const mapping = 'sales.mapping.yaml';
  await saveText(alice.call, 'sales-contracts', mapping, note('alice'));
  const deleted = await alice.call(`/api/projects/sales-contracts/files/${mapping}`, 'DELETE', {
    confirm: true,
  });
  expect(deleted.status).toBe(200);
  const listed = (await bob.call('/api/trash')).body.map((entry: any) => entry.entryId);
  expect(listed).not.toContain(deleted.body.entryId);
  const restore = `/api/trash/${deleted.body.entryId}/restore`;
  expect((await bob.call(restore, 'POST', {})).status).toBe(404);
  expect((await alice.call('/api/trash')).body.map((entry: any) => entry.entryId)).toContain(deleted.body.entryId);
  expect((await alice.call(restore, 'POST', {})).status).toBe(200);
  const copy = copyFolder(fixture.ws, alice.principal.key, 'sales-contracts');
  expect(textAt(copy, mapping)).toContain('# alice was here');
});

test('a protected branch named through its remote is still refused to an Editor', async () => {
  using fixture = await authWorkspace();
  const frank = signedIn(fixture.ws)(person('frank'));
  const base = join(fixture.ws.layout.projects, 'sales-contracts');
  const head = gitOutput(base, ['rev-parse', 'HEAD']).text;
  // A remote branch `origin/release/1` is checked out as the protected local `release/1`.
  gitOutput(base, ['update-ref', 'refs/remotes/origin/release/1', head]);
  expect((await openCopy(frank.call, 'sales-contracts')).status).toBe(200);
  const refused = await frank.call('/api/projects/sales-contracts/git/switch', 'POST', {
    branch: 'origin/release/1',
  });
  expect(refused.status).toBe(403);
  const copy = copyFolder(fixture.ws, frank.principal.key, 'sales-contracts');
  expect(gitOutput(copy, ['branch', '--show-current']).text).toBe('work/frank');
});

test('changes always go to the person’s copy; agent clients and local mode have none', () => {
  const view = { readableProjects: new Set<string>(), canRead: () => true, roles: () => [] };
  const author = { name: 'Ann', email: 'ann@example.org', id: 'ann' };
  const { guard } = boundaryReader(view, 'ann');
  const editor = {
    view,
    owner: 'ann',
    guard: guard!,
    copy: { key: 'ua'.repeat(20), author, editable: () => true },
  };
  const committer = { ...editor, copy: { ...editor.copy, editable: () => false } };
  expect(writeKeyFor(editor)).toBe(editor.copy.key);
  expect(writeKeyFor(committer)).toBe(editor.copy.key);
  expect(copyKeyFor(editor, 'sales')).toBe(editor.copy.key);
  expect(copyKeyFor(committer, 'sales')).toBeNull();
  expect(writeKeyFor(LOCAL_READER)).toBeNull();
  expect(writeKeyFor(boundaryReader(view, 'agent'))).toBeNull();
});

test('local mode saves, commits and switches without creating any working copy', async () => {
  using workspace = await testWorkspace();
  const project = await workspace.seed([{ path: 'a.yaml', source: ontologyText('A', ['Customer']) }]);
  const call = (path: string, method: string, body: unknown) => workspace.handler(new Request('http://localhost' + path, { method, body: JSON.stringify(body) }));
  const base = `/api/projects/${project.slug}`;
  const file = workspace.ws.readFile(project.slug, 'a.yaml');
  const responses = [
    await call(base + '/files/a.yaml', 'PUT', {
      baseHash: file.hash,
      source: ontologyText('B', ['Customer']),
    }),
    await call(base + '/git/commit', 'POST', { message: 'Rename', paths: ['a.yaml'] }),
    await call(base + '/git/switch', 'POST', { branch: 'feature', create: true }),
  ];
  expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
  expect(workspace.ws.readFile(project.slug, 'a.yaml').source).toContain('name: B');
  expect(existsSync(workspace.ws.layout.worktrees)).toBe(false);
});

// Clones the two-project monorepo fixture (Sales in the sales domain, Finance in hr) and signs
// people in against it.
async function monorepoWorkspace(fixture: Awaited<ReturnType<typeof testWorkspace>>, bare: string) {
  const started = fixture.ws.clone(bare, undefined, LOCAL_READER);
  for (let attempt = 0; attempt < 400; attempt++) {
    const done = fixture.ws.events.replay(0)!.some(event => {
      const data = event.data as CloneEvent;
      return event.event === 'clone' && data.op === started.op && data.phase === 'done';
    });
    if (done) break;
    await Bun.sleep(10);
  }
  const projects = fixture.ws.state.registry().projects;
  const sales = projects.find(project => project.name === 'Sales')!;
  const finance = projects.find(project => project.name === 'Finance')!;
  const options = accessFixture();
  const assigned = { stewards: [], restricted: [], protectedBranches: [] };
  options.config.projects.projects[sales.slug] = { domain: 'sales', ...assigned };
  options.config.projects.projects[finance.slug] = { domain: 'hr', ...assigned };
  const access = createAccessControl({
    ...options,
    knownProjects: () => projects.map(project => project.slug),
  });
  return { sales, finance, as: signedIn(fixture.ws, access) };
}

test('deleting a subproject keeps each person’s work on it and takes it out of their copies', async () => {
  const remote = bareRepository('monorepo');
  using fixture = await testWorkspace();
  try {
    const { sales, as } = await monorepoWorkspace(fixture, remote.bare);
    const alice = as(person('alice'));
    const dave = as(person('dave'));
    const file = 'sales.ontology.yaml';
    expect((await saveText(alice.call, sales.slug, file, note('alice'))).status).toBe(200);
    const impact = await dave.call(`/api/projects/${sales.slug}/delete-impact`);
    expect(impact.body.unpublished).toEqual([{ name: 'Alice Andrade', changes: 1 }]);
    const deleted = await dave.call(`/api/projects/${sales.slug}`, 'DELETE', {
      mode: 'delete',
      confirm: true,
    });
    expect(deleted.status).toBe(200);
    const entry = fixture.ws.trash.entry(deleted.body.entryId);
    expect(entry.kind).toBe('subproject');
    const key = alice.principal.key;
    expect(entry.unpublished).toEqual([{ userKey: key, name: 'Alice Andrade', patch: `unpublished/${key}.patch`, drafts: 0 }]);
    const saved = join(fixture.ws.layout.trash, entry.entryId, `unpublished/${key}.patch`);
    const patch = readFileSync(saved, 'utf8');
    expect(patch).toContain('+# alice was here');
    expect(patch).not.toContain('domains/finance');
    // The repository stays, so Alice keeps her copy without the deleted folder.
    const repo = fixture.ws.state.registry().projects[0].repo!;
    const copy = copyFolder(fixture.ws, key, repo);
    expect(existsSync(join(copy, 'domains/sales'))).toBe(false);
    expect(existsSync(join(copy, 'domains/finance'))).toBe(true);
  } finally {
    remote.dispose();
  }
});

test('grouping suggestions follow reads: a person’s own copy, the published state for others', async () => {
  using fixture = await authWorkspace();
  const as = signedIn(fixture.ws);
  const alice = as(person('alice'));
  const frank = as(person('frank'));
  const viewer = as(salesViewer());
  // A second semantic model whose dataset source names a contract of sales-contracts.
  const model = fixture.ws.readFile('sales-metrics', 'sales.semantic.yaml').source;
  // Proposed, not approved: an Editor may create a model but not approve its metrics.
  const extra = model.replace('name: Sales semantic model', 'name: Extra semantic model').replace('"status": "approved"', '"status": "proposed"');
  const saved = await alice.call('/api/projects/sales-metrics/files/extra.semantic.yaml', 'PUT', {
    baseHash: null,
    source: extra,
  });
  expect(saved.status).toBe(200);
  const suggested = async (who: typeof alice) => (await who.call('/api/suggestions')).body.map((item: any) => item.file.path);
  expect(await suggested(alice)).toContain('extra.semantic.yaml');
  expect(await suggested(frank)).not.toContain('extra.semantic.yaml');
  expect(await suggested(viewer)).not.toContain('extra.semantic.yaml');
  // The live count each person's stream receives follows the same rule.
  const access = createAccessControl(accessFixture());
  const readerOf = (name: 'alice' | 'frank') => {
    const request = new Request('http://localhost/api/events');
    Object.assign(request, {
      [requestAccess]: access.forRequest(access.principalFor(person(name))),
    });
    return requestReader(request);
  };
  // Given an empty shared index, only a person with a copy counts from their own files.
  expect(fixture.ws.suggestionCount(readerOf('alice'), [])).toBe(3);
  expect(fixture.ws.suggestionCount(readerOf('frank'), [])).toBe(0);
});
