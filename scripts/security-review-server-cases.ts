// Assertions for the mutants of the routes and policies around data access: drafts, the trash,
// the authorization of Git commands, guard refusals and the audit chain.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { allowAll, type Candidate } from './security-review-scm-cases';

/** A server-mode workspace of the access fixture and requests carrying a person's scope. */
async function serverFixture() {
  const { authWorkspace } = await import('../tests/helpers/auth-workspace');
  const { createAccessControl } = await import('../server/auth/authorize');
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  const { attachRemoteCredentials, requestAccess } = await import('../server/auth/request-scope');
  const { allowEveryRemote } = await import('../tests/helpers/remote-credentials-fixture');
  const fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  type Name = 'alice' | 'bob' | 'frank';
  const scoped = (name: Name, path: string, method = 'GET', body?: unknown) => {
    const request = new Request('http://localhost' + path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    Object.assign(request, {
      [requestAccess]: access.forRequest(access.principalFor(person(name))),
    });
    attachRemoteCredentials(request, allowEveryRemote());
    return request;
  };
  // Working copies belong to people the workspace has seen sign in.
  for (const name of ['alice', 'bob', 'frank'] as const) {
    fixture.ws.state.recordUser(access.principalFor(person(name)), new Date().toISOString());
  }
  const idOf = (name: Name) => access.principalFor(person(name)).id;
  const keyOf = (name: Name) => access.principalFor(person(name)).key;
  return { fixture, scoped, idOf, keyOf };
}

async function gitRoutesCase(candidate: Candidate) {
  const { requestReader } = await import('../server/auth/request-scope');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { fixture, scoped, keyOf } = await serverFixture();
  try {
    const reader = requestReader(scoped('alice', '/'));
    await fixture.ws.scmFor('sales-contracts', reader);
    const copy = join(fixture.ws.layout.worktrees, keyOf('alice'), 'sales-contracts');
    Bun.spawnSync(['git', 'branch', 'work/bob'], { cwd: copy });
    mkdirSync(join(copy, 'finance'), { recursive: true });
    writeFileSync(join(copy, 'finance', 'budget.txt'), 'hidden');
    const post = async (action: string, body: unknown) => {
      const request = scoped('alice', `/api/projects/sales-contracts/git/${action}`, 'POST', body);
      const response = await candidate.gitRoutes(fixture.ws, request, new URL(request.url));
      return JSON.stringify(await response.json());
    };
    const body = { paths: ['orders.odcs.yaml'] };
    assert(!(await post('stage', body)).includes('finance'), 'stage answers with her own view');
    assert(!(await post('unstage', body)).includes('finance'), 'unstage answers likewise');
    const request = scoped('alice', '/api/projects/sales-contracts/git/branches');
    const branches = await candidate.gitRoutes(fixture.ws, request, new URL(request.url));
    const { local } = await branches.json();
    assert(local.includes('work/alice'));
    assert(!local.includes('work/bob'));
  } finally {
    fixture.dispose();
  }
}

async function draftsCase(candidate: Candidate) {
  const { fixture, scoped } = await serverFixture();
  try {
    const put = async (path: string, text: string) => {
      const request = scoped('alice', '/api/drafts/' + path, 'PUT', {
        baseHash: null,
        text,
        patches: [],
      });
      return candidate.draftRoutes(fixture.ws, request, new URL(request.url));
    };
    assert.equal((await put('sales-contracts/orders.odcs.yaml', 'x')).status, 200);
    assert.equal((await put('sales-contracts/not/there.yaml', 'x')).status, 404);
    await assert.rejects(
      () => put('sales-contracts/FINANCE/x.yaml', 'x'),
      (error: any) => error.name === 'CaseVariantError',
    );
    await assert.rejects(() => put('sales-contracts/orders.odcs.yaml', 'a'.repeat(5_000_000)));
    const held = (count: number, project = 'p') =>
      Array.from({ length: count }, (_, index) => ({ project, path: `f${index}.yaml` }));
    assert.doesNotThrow(() => candidate.assertRoomForDraft(held(199), 'p', 'new.yaml'));
    assert.throws(
      () => candidate.assertRoomForDraft(held(200), 'p', 'new.yaml'),
      /in this project/,
    );
    assert.doesNotThrow(() => candidate.assertRoomForDraft(held(200), 'p', 'f0.yaml'));
    assert.doesNotThrow(() => candidate.assertRoomForDraft(held(200), 'other', 'new.yaml'));
    const wide = Array.from({ length: 1000 }, (_, index) => ({
      project: `p${index % 10}`,
      path: `f${index}.yaml`,
    }));
    assert.throws(
      () => candidate.assertRoomForDraft(wide, 'fresh', 'new.yaml'),
      /Too many unsaved/,
    );
  } finally {
    fixture.dispose();
  }
}

/** Removes a project's old entry from the access configuration, as if it had never existed. */
async function forgetProject(administration: any, slug: string) {
  await administration.ensure();
  const document = administration.load().projects;
  delete document.projects[slug];
  await administration.write(
    { 'projects.json': JSON.stringify(document, null, 2) + '\n' },
    {
      baseVersion: await administration.version(),
      author: { name: 'Test', email: 'test@example.org' },
      message: 'projects: forget the deleted project',
    },
  );
}

type Call = (route: any, name: 'alice' | 'bob', path: string, body?: unknown) => Promise<any>;

// An undo takes the same optional domain as a restore, and refuses a body it does not know.
async function undoTakesDomain(call: Call, route: unknown, entryId: string) {
  const url = `/api/trash/${entryId}/undo`;
  const badDomain = await call(route, 'bob', url, { domain: 'hr' });
  assert(badDomain.error, 'an undo that makes a project needs the right to create one');
  const unknown = await call(route, 'bob', url, { other: 1 });
  assert.match(unknown.error?.message ?? '', /Expected \{domain\?\}/);
}

/** Calls a route as a person and returns the status and body, or the error it threw. */
function routeCaller(
  ws: any,
  scoped: (name: any, path: string, method: string, body?: unknown) => Request,
) {
  return async (route: any, name: 'alice' | 'bob', path: string, body?: unknown) => {
    const request = scoped(name, path, body === undefined ? 'GET' : 'POST', body);
    try {
      const response = await route(ws, request, new URL(request.url));
      return { status: response.status as number, body: await response.clone().json() };
    } catch (error) {
      return { error: error as Error };
    }
  };
}

async function trashRoutesCase(candidate: Candidate) {
  const { LOCAL_READER } = await import('../server/projects/reader');
  const { openAdminRepository } = await import('../server/auth/admin-repo');
  const { readFileSync } = await import('node:fs');
  const { fixture, scoped, idOf } = await serverFixture();
  try {
    const ws = fixture.ws;
    const slugs = () => ws.state.registry().projects.map((project: any) => project.slug);
    const administration = openAdminRepository({ root: fixture.root });
    const call = routeCaller(ws, scoped);
    // A file whose project is gone: an Editor may not make a project by restoring it.
    const own = await ws.trash.deleteFile(
      'sales-contracts',
      'orders.odcs.yaml',
      idOf('alice'),
      LOCAL_READER,
    );
    const stewards = await ws.trash.deleteFile(
      'sales-contracts',
      'sales.mapping.yaml',
      idOf('bob'),
      LOCAL_READER,
    );
    // The impact of deleting a project lists unpublished work only for those who may delete it.
    const impact = await call(
      candidate.trashRoutesWith(administration),
      'alice',
      '/api/projects/sales-contracts/delete-impact',
    );
    assert.equal(impact.status, 200);
    assert(!('unpublished' in impact.body), 'unpublished work is for those who may delete');
    const third = await ws.trash.deleteFile(
      'sales-contracts',
      'people.mapping.yaml',
      idOf('bob'),
      LOCAL_READER,
    );
    await ws.trash.deleteProject('sales-contracts', undefined);
    const before = slugs();
    const refused = await call(
      candidate.trashRoutesWith(administration),
      'alice',
      `/api/trash/${own.entryId}/restore`,
      {},
    );
    assert(refused.error, 'the restore that makes a project needs the right to create one');
    assert.deepEqual(slugs(), before);
    const undone = await call(
      candidate.trashRoutesWith(administration),
      'alice',
      `/api/trash/${own.entryId}/undo`,
      {},
    );
    assert(undone.error || (undone.status ?? 0) >= 400);
    assert.deepEqual(slugs(), before);
    await undoTakesDomain(call, candidate.trashRoutesWith(administration), third.entryId);
    assert.deepEqual(slugs(), before);
    // Without an administration repository a project cannot be made, and nothing is.
    const unavailable = await call(
      candidate.trashRoutesWith(),
      'bob',
      `/api/trash/${stewards.entryId}/restore`,
      {},
    );
    assert.match(unavailable.error?.message ?? '', /not available/);
    assert.deepEqual(slugs(), before);
    // A Steward makes it in a domain they may create in, and the domain is recorded. The
    // project's old entry is removed first, since the restored project reuses its id.
    await administration.ensure();
    await forgetProject(administration, 'sales-contracts');
    const made = await call(
      candidate.trashRoutesWith(administration),
      'bob',
      `/api/trash/${stewards.entryId}/restore`,
      {},
    );
    assert.equal(made.status, 200, JSON.stringify(made));
    const recorded = JSON.parse(readFileSync(join(fixture.root, 'admin', 'projects.json'), 'utf8'));
    assert.equal(recorded.projects[made.body.project].domain, 'sales');
  } finally {
    fixture.dispose();
  }
}

async function trashCopyCase(candidate: Candidate) {
  const { testWorkspace } = await import('../tests/helpers/temp-data-dir');
  const { copyLayout } = await import('../server/projects/paths');
  const { LOCAL_READER } = await import('../server/projects/reader');
  const { existsSync, mkdirSync: makeFolder } = await import('node:fs');
  const fixture = await testWorkspace();
  const key = 'u' + 'd'.repeat(20);
  try {
    const ws = fixture.ws;
    const source = 'name: A\nontology: [{concept: A}]\n';
    const project = await fixture.seed([{ path: 'a.yaml', source }], 'sample');
    const slug = project.slug as string;
    const copies = copyLayout(ws.layout, key);
    makeFolder(join(copies.projects, slug), { recursive: true });
    const trash = candidate.createTrash({
      layout: ws.layout,
      copyLayout: (copy: string) => copyLayout(ws.layout, copy),
      state: ws.state,
      journal: ws.journal,
      lock: ws.lock,
      projects: () => ws.state.registry().projects,
      registrySteps: ws.registrySteps,
      afterFiles: async () => {},
      writeCopy: async () => key,
      forgetProject: () => {},
      adoptProject: async () => {},
      createProject: async () => {
        throw Error('unused');
      },
      emit: () => {},
      withCurrentReaders: (_event: string, tags: object) => tags,
    });
    const entry = await trash.deleteFile(slug, 'a.yaml', undefined, LOCAL_READER);
    const author = { name: 'Ann', email: 'ann@example.org', id: 'ann' };
    const reader = {
      view: { readableProjects: new Set([slug]), canRead: () => true, roles: () => [] },
      owner: 'ann',
      guard: allowAll,
      copy: { key, author, editable: () => true },
    };
    await trash.restore(entry.entryId, {}, reader);
    assert(existsSync(join(copies.projects, slug, 'a.yaml')), 'the file returns into the copy');
    assert(!existsSync(join(ws.layout.projects, slug, 'a.yaml')), 'the published checkout stays');
  } finally {
    fixture.dispose();
  }
}

async function gitAccessCase(candidate: Candidate) {
  const { fixture, scoped } = await serverFixture();
  try {
    const status = (branch: string, changes: object[] = []) => ({
      status: async () => ({ branch, changes }),
    });
    const target = (read: any, pending: any) => ({
      ws: { ...fixture.ws, readScm: () => read, pendingScm: () => pending },
      request: scoped('alice', '/api/projects/sales-contracts/git/push', 'POST'),
      slug: 'sales-contracts',
    });
    const refused = /not authorized/;
    // The command runs in the place whose branch is protected, though the published one is not.
    const moved = target(status('work/alice'), status('main'));
    await assert.rejects(() => candidate.authorizeGitPush(moved), refused);
    await candidate.authorizeGitPush(target(status('main'), status('work/alice')));
    // Likewise a change waiting there, in a folder the person may not stage.
    const waiting = [{ repoPath: 'finance/revenue-recognition.odcs.yaml' }];
    const hidden = target(status('work/alice'), status('work/alice', waiting));
    await assert.rejects(() => candidate.authorizeGitPaths(hidden, 'stage', {}), refused);
    await candidate.authorizeGitPaths(target(status('x', waiting), status('x')), 'stage', {});
  } finally {
    fixture.dispose();
  }
}

async function guardsCase(candidate: Candidate) {
  const { createAccessControl } = await import('../server/auth/authorize');
  const { accessFixture, person } = await import('../tests/auth/access-fixture');
  const { readFileSync } = await import('node:fs');
  const metrics = readFileSync(
    'tests/fixtures/auth-workspace/projects/sales-metrics/sales.semantic.yaml',
    'utf8',
  );
  const withOrderCount = (status: string, owner: string) => {
    const start = metrics.indexOf('- name: order_count');
    const end = metrics.indexOf('- name:', start + 1);
    const block = metrics.slice(start, end < 0 ? undefined : end);
    const changed = block
      .replace(/"status": "[a-z]+"/, `"status": "${status}"`)
      .replace(/"owner": "[^"]*"/, `"owner": "${owner}"`);
    return metrics.replace(block, changed);
  };
  const hiddenOwn = {
    project: 'sales-contracts',
    path: 'finance/sales.semantic.yaml',
    before: withOrderCount('proposed', 'alice@example.org'),
    after: withOrderCount('approved', 'alice@example.org'),
  };
  const readable = {
    project: 'sales-metrics',
    path: 'sales.semantic.yaml',
    before: metrics,
    after: withOrderCount('approved', 'bob@example.org'),
  };
  const access = createAccessControl(accessFixture());
  const scope = access.forRequest(access.principalFor(person('alice')));
  const refusal = (changes: object[]) => {
    try {
      candidate.guardFor(scope)(changes);
    } catch (error) {
      return error as any;
    }
    throw Error('Expected a refusal.');
  };
  const mixed = refusal([hiddenOwn, readable]);
  assert.match(mixed.message, /approving or deprecating a metric/);
  assert(!mixed.message.includes('order_count'));
  assert.deepEqual(
    mixed.guarded.map((item: any) => item.file),
    ['sales.semantic.yaml'],
  );
  assert(mixed.decision.rules.includes('F1-no-self-approval'));
  const only = refusal([hiddenOwn]);
  assert.match(only.message, /a guarded change/);
  assert(!only.message.includes('order_count') && !only.message.includes('they own'));
  assert.deepEqual(only.guarded, []);
}

async function auditCase(candidate: Candidate) {
  const { tempDataDir } = await import('../tests/helpers/temp-data-dir');
  const { sha256 } = await import('../server/projects/atomic');
  const { readFileSync } = await import('node:fs');
  const input = {
    requestId: 'r',
    principal: { id: 'local', kind: 'local' },
    action: 'edit',
    resource: { type: 'workspace' },
    decision: 'allow' as const,
    rules: [],
    outcome: 'ok' as const,
  };
  const dir = tempDataDir();
  try {
    const mirrored: string[] = [];
    let now = new Date('2026-08-30Z');
    const open = () =>
      candidate.createAuditLog({
        dir: dir.root,
        now: () => now,
        mirror: line => mirrored.push(line),
      });
    let log = open();
    log.append(input);
    now = new Date('2026-09-02Z');
    log.append(input);
    // A new writer in the same month continues that month, with no anchor.
    log = open();
    now = new Date('2026-09-03Z');
    log.append(input);
    now = new Date('2026-10-05Z');
    log.append(input);
    const tail = (month: string) =>
      sha256(
        readFileSync(join(dir.root, `${month}.jsonl`), 'utf8')
          .trimEnd()
          .split('\n')
          .at(-1)!,
      );
    const first = (month: string) => log.entries(month)[0].prev;
    assert.equal(first('2026-08'), '0'.repeat(64));
    assert.equal(first('2026-09'), tail('2026-08'));
    assert.equal(first('2026-10'), tail('2026-09'));
    const anchors = mirrored
      .map(line => JSON.parse(line))
      .filter(record => record.type === 'audit-anchor');
    assert.deepEqual(anchors, [
      { type: 'audit-anchor', month: '2026-08', tail: tail('2026-08') },
      { type: 'audit-anchor', month: '2026-09', tail: tail('2026-09') },
    ]);
    const months = candidate.readStoredMonths(dir.root);
    assert.equal(candidate.verifyAuditChain(months, anchors).ok, true);
    // A changed record, a removed month and a cut tail are each reported.
    const changed = months.map((item: any) => ({ ...item, lines: [...item.lines] }));
    changed[1].lines[0] = changed[1].lines[0].replace('"edit"', '"read"');
    assert.equal(candidate.verifyAuditChain(changed).ok, false);
    assert.equal(
      candidate.verifyAuditChain(months.filter((item: any) => item.month !== '2026-09')).ok,
      false,
    );
    const forged = [{ ...anchors[0], tail: 'f'.repeat(64) }];
    const forgedResult = candidate.verifyAuditChain(months, forged);
    assert.equal(forgedResult.ok, false);
    assert.equal(forgedResult.reason, 'anchor-mismatch');
    assert.equal(candidate.verifyAuditChain([], anchors).reason, 'anchor-month-missing');
    assert.equal(
      candidate.verifyAuditChain([{ month: '2026-08', lines: ['{no'] }]).reason,
      'unreadable',
    );
  } finally {
    dir.cleanup();
  }
}

/** The categories of this file and the assertions each runs. */
export const serverCases: Record<string, (candidate: Candidate) => Promise<void>> = {
  'secrev-git-routes': gitRoutesCase,
  'secrev-drafts': draftsCase,
  'secrev-trash-routes': trashRoutesCase,
  'secrev-trash': trashCopyCase,
  'secrev-git-access': gitAccessCase,
  'secrev-guards': guardsCase,
  'secrev-audit': auditCase,
};
