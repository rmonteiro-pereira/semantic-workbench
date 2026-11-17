// Focused assertions for immutable publication faults.
import assert from 'node:assert/strict';
import { localPublicationFixture as localPublicationFixtureForHistory } from '../tests/helpers/local-publication-fixture';
import { createPublishedSnapshots as makeSnapshots } from '../src/server/projects/published-snapshot';
import { localPublicationCase, localCommitCase, adoptionCase } from './local-publication-mutation-cases';
import type { createScm } from '../src/server/projects/scm';
import type { metricRoutes } from '../src/server/routes/metrics';
import { testWorkspace } from '../tests/helpers/temp-data-dir';
import { publishFixture } from '../tests/helpers/published-workspace';
import { localPrincipal } from '../src/server/auth/principal';
import type * as agentRoutes from '../src/server/routes/agent';
import { authWorkspace } from '../tests/helpers/auth-workspace';
import { createAccessControl } from '../src/server/auth/authorize';
import { accessFixture, person } from '../tests/auth/access-fixture';
import { requestAccess } from '../src/server/auth/request-scope';
import { LOCAL_READER } from '../src/server/projects/reader';
import type { RouteAction } from '../src/server/auth/route-actions';
import { type createWorktrees, type defaultBranchAt } from '../src/server/projects/worktrees';
import { createPublication } from '../src/server/projects/publication';
import { publicationQueueCase } from '../tests/helpers/publication-queue-case';
import { publicationMoveFixture } from '../tests/helpers/publication-fixture';
import { attachRequestSurface } from '../src/server/auth/request-surface';
import { mintCaller } from '../src/server/auth/caller';
import type { requestSurface } from '../src/server/auth/request-surface';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { publicationRepository } from '../tests/helpers/git-fixtures';
import { createCache } from '../src/server/projects/cache';
import { indexBytes } from '../src/server/projects/scanner';
import { UnknownDefaultBranchError } from '../src/server/projects/worktrees';
import type { openWorkspace } from '../src/server/projects/workspace';
import type { initializePublishedPointers } from '../src/server/projects/published-initialization';
import { createGit } from '../src/server/projects/git';
import type { classify } from '../src/server/projects/published-pointer';
import type { publicationChecks } from '../src/server/projects/publication-checks';
import { createState, type ProjectEntry } from '../src/server/projects/state';
import { dataLayout } from '../src/server/projects/paths';
import { createPublishedPointers } from '../src/server/projects/published-pointer';
import type { createPublishedSnapshots } from '../src/server/projects/published-snapshot';
import type { createSnapshotIndexes } from '../src/server/projects/snapshot-index';
/** Exercises the publication predicate belonging to a candidate module. */
export async function snapshotMutationCase(
  category: string,
  candidate: Parameters<typeof localPublicationCase>[0] & {
    metricRoutes?: typeof metricRoutes;
    createScm?: typeof createScm;
    createAgentRoutes?: typeof agentRoutes.createAgentRoutes;
    createPreviewRoutes?: typeof agentRoutes.createPreviewRoutes;
    publishedAgentDocuments?: typeof agentRoutes.publishedAgentDocuments;
    attachRequestSurface?: typeof attachRequestSurface;
    requestSurface?: typeof requestSurface;
    createWorktrees?: typeof createWorktrees;
    createPublication?: typeof createPublication;
    defaultBranchAt?: typeof defaultBranchAt;
    ROUTE_ACTIONS?: RouteAction[];
    openWorkspace?: typeof openWorkspace;
    initializePublishedPointers?: typeof initializePublishedPointers;
    classify?: typeof classify;
    publicationChecks?: typeof publicationChecks;
    createPublishedSnapshots?: typeof createPublishedSnapshots;
    createSnapshotIndexes?: typeof createSnapshotIndexes;
  },
) {
  if (category === 'snapshot-export') {
    const fixture = publicationRepository();
    let workspace: Awaited<ReturnType<typeof openWorkspace>> | undefined;
    try {
      createState(dataLayout(fixture.dir)).writeRegistry([{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }]);
      workspace = await candidate.openWorkspace!({ root: fixture.dir });
      writeFileSync(join(fixture.repository, 'shop.ontology.yaml'), 'name: Draft\nontology: []\n');
      const plan = await workspace.exportProject('definitions', LOCAL_READER, { source: 'published', includeHistory: false, historyAllowed: true }, 64_000_000);
      assert(
        Buffer.from(plan.entries.find(entry => entry.name === 'shop.ontology.yaml')!.read())
          .toString()
          .includes('Published'),
      );
    } finally {
      workspace?.close();
      fixture.dispose();
    }
  }
  if (category === 'snapshot-history') {
    using fixture = localPublicationFixtureForHistory();
    const layout = dataLayout(fixture.dir);
    const published = makeHistorySnapshots(fixture);
    const scm = candidate.createScm!({
      layout,
      git: fixture.git,
      gitAvailable: true,
      siblings: () => ['definitions'],
      project: () => ({}),
      drafts: () => [],
      rescan: async () => {},
      emit: () => {},
      isReadableRevision: (_slug, revision, head) => published.isReadableRevision(revision, head, 'definitions'),
    });
    assert.equal((await scm.show('definitions', fixture.published!, 'shop.ontology.yaml', LOCAL_READER)).exists, true);
    assert.deepEqual(await scm.show('definitions', fixture.foreign!, 'shop.ontology.yaml', LOCAL_READER), { source: '', exists: false });
  }
  if (category === 'snapshot-preview') {
    using fixture = await testWorkspace();
    const { slug } = await fixture.ws.loadExample('mapped-commerce');
    const route = candidate.createPreviewRoutes!();
    const access = createAccessControl({ ...accessFixture(), mode: 'local', knownProjects: () => [slug] });
    const request = Object.assign(new Request(`http://localhost/api/preview/catalog?project=${slug}`), { [requestAccess]: access.forRequest(localPrincipal()) });
    assert.equal(await route(fixture.ws, request, new URL(request.url)), null);
    attachRequestSurface(request, mintCaller({ principal: localPrincipal(), origin: 'http' }));
    const browser = Object.assign(new Request(request, { headers: { 'Sec-Fetch-Site': 'same-origin' } }), { [requestAccess]: access.forRequest(localPrincipal()) });
    attachRequestSurface(browser, mintCaller({ principal: localPrincipal(), origin: 'http', surface: 'browser' }));
    assert.equal((await route(fixture.ws, browser, new URL(browser.url)))?.status, 200);
  }
  if (category === 'snapshot-adoption') await adoptionCase(candidate);
  if (category === 'snapshot-local-commit') await localCommitCase(candidate);
  if (category === 'snapshot-local') await localPublicationCase(candidate);
  if (category === 'snapshot-metrics') {
    using fixture = await testWorkspace();
    const { slug } = await fixture.ws.loadExample('mapped-commerce');
    await publishFixture(fixture);
    const file = fixture.ws.documents().find(document => document.filename === 'commerce.mapped-semantic.yaml')!;
    await fixture.ws.saveFile(slug, file.path, { baseHash: file.hash, source: file.source.replaceAll('gross_revenue', 'unpublished_revenue') }, LOCAL_READER);
    const access = createAccessControl({ ...accessFixture(), mode: 'local', knownProjects: () => [slug] });
    const request = Object.assign(new Request(`http://localhost/api/projects/${slug}/metrics`), { [requestAccess]: access.forRequest(access.principalFor(localPrincipal())) });
    const response = await candidate.metricRoutes!(fixture.ws, request, new URL(request.url));
    assert.equal(response!.status, 200);
    assert.ok(!(await response!.text()).includes('unpublished_revenue'));
  }
  if (category === 'snapshot-agent-permissions') {
    using fixture = await authWorkspace({ published: false });
    const access = createAccessControl(accessFixture());
    const request = Object.assign(new Request('http://localhost/api/agent/catalog?project=hr-people'), {
      [requestAccess]: access.forRequest(access.principalFor(person('alice'))),
    });
    await assert.rejects(() => Promise.resolve(candidate.createAgentRoutes!(candidate.publishedAgentDocuments!)(fixture.ws, request, new URL(request.url))), /Project not found/);
  }
  if (category === 'snapshot-agent') {
    using fixture = await authWorkspace();
    const access = createAccessControl(accessFixture());
    const request = Object.assign(new Request('http://localhost/api/agent/catalog?project=sales-contracts'), {
      [requestAccess]: access.forRequest(access.principalFor(person('alice'))),
    });
    const file = fixture.ws.readFile('sales-contracts', 'sales.mapping.yaml', LOCAL_READER);
    await fixture.ws.saveFile('sales-contracts', 'sales.mapping.yaml', { baseHash: file.hash, source: file.source.replace('Sales mapping', 'Unpublished mapping') }, LOCAL_READER);
    const response = await candidate.createAgentRoutes!(candidate.publishedAgentDocuments!)(fixture.ws, request, new URL(request.url));
    assert.equal(response!.status, 200);
    assert.ok(!(await response!.text()).includes('Unpublished mapping'));
  }
  if (category === 'snapshot-surface') {
    const request = new Request('http://localhost/');
    candidate.attachRequestSurface!(request, mintCaller({ principal: localPrincipal(), origin: 'mcp', surface: 'browser' }));
    assert.equal(candidate.requestSurface!(request), 'agent');
  }
  if (category === 'snapshot-default') {
    const fixture = publicationRepository();
    const git = createGit({ projectsRoot: dataLayout(fixture.dir).projects });
    try {
      await git.run(fixture.repository, ['switch', '-c', 'feature-x', 'work/local']);
      assert.equal(await candidate.defaultBranchAt!(git, fixture.repository, 'definitions'), 'main');
      await git.run(fixture.repository, ['branch', 'trunk', fixture.authoring]);
      await git.run(fixture.repository, ['config', '--local', 'init.defaultBranch', 'trunk']);
      assert.equal(await candidate.defaultBranchAt!(git, fixture.repository, 'definitions'), 'trunk');
      await git.run(fixture.repository, ['branch', '-D', 'main', 'trunk']);
      await assert.rejects(() => candidate.defaultBranchAt!(git, fixture.repository, 'definitions'), /Choose its default branch/);
    } finally {
      fixture.dispose();
    }
  }
  if (category === 'snapshot-queue') await publicationQueueCase(candidate.createPublication!);
  if (category === 'snapshot-writer') {
    const { moveToAuthoringBranch } = await import('../src/server/projects/local-publication');
    await localPublicationCase({
      moveToAuthoringBranch,
      createPublication: candidate.createPublication,
    });
  }
  if (category === 'snapshot-adoption-writer') {
    await adoptionCase({ createPublication: candidate.createPublication });
  }
  if (category === 'snapshot-publication') {
    const fixture = await publicationMoveFixture(undefined, candidate.createPublication);
    try {
      await assert.rejects(() =>
        fixture.worktrees.publish('definitions', fixture.owner.key, async () => {
          throw Error('Refused');
        }),
      );
      assert.equal(fixture.pointers.get('definitions')?.commit, fixture.fixture.published);
      const moved = Bun.spawnSync(['git', 'update-ref', 'refs/heads/main', fixture.fixture.previous!], { cwd: fixture.fixture.repository });
      assert.equal(moved.exitCode, 0);
      await assert.rejects(() => fixture.worktrees.publish('definitions', fixture.owner.key, async () => {}), /moved outside/);
    } finally {
      fixture.fixture.dispose();
    }
  }
  if (category === 'snapshot-inventory') {
    assert.equal(candidate.ROUTE_ACTIONS!.find(row => row.path === 'GET /api/agent/catalog')?.readSource, 'published');
    assert.equal(candidate.ROUTE_ACTIONS!.find(row => row.path === 'GET /api/projects/:slug/export')?.readSource, 'by-query');
  }
  if (category === 'snapshot-initialization' || category === 'snapshot-workspace') await startupCase(category, candidate);
  if (category === 'snapshot-pointer') {
    const pointer = { branch: 'main', commit: 'a'.repeat(40) };
    assert.equal(await candidate.classify!('b'.repeat(40), pointer, async () => false), 'diverged');
    assert.equal(await candidate.classify!('b'.repeat(40), pointer, async () => true), 'fast-forward');
  }
  if (category === 'snapshot-checks') {
    await checksCase(candidate.publicationChecks!);
  }
  if (category === 'snapshot-resolver') await resolverCase(candidate.createPublishedSnapshots!);
  if (category === 'snapshot-index') {
    await indexCase(candidate.createSnapshotIndexes!);
  }
}

async function checksCase(checks: typeof publicationChecks) {
  for (const failure of ['ancestor', 'bounds', 'guard', null]) {
    const calls: string[] = [];
    const list = checks({
      isAncestor: async () => {
        calls.push('ancestor');
        return failure !== 'ancestor';
      },
      readable: async () => {
        calls.push('bounds');
        if (failure === 'bounds') throw Error('Bounds');
      },
      guard: async () => {
        calls.push('guard');
        if (failure === 'guard') throw Error('Guard');
      },
    });
    const publish = async () => {
      for (const check of list) await check({ repo: 'definitions', branch: 'main', previous: 'a'.repeat(40), next: 'b'.repeat(40) });
    };
    if (failure) await assert.rejects(publish);
    else await publish();
    const expected = ['ancestor', 'bounds', 'guard'];
    assert.deepEqual(calls, failure ? expected.slice(0, expected.indexOf(failure) + 1) : expected);
  }
}

async function indexCase(indexes: typeof createSnapshotIndexes) {
  const fixture = publicationRepository();
  const cache = createCache(join(fixture.dir, 'parse.sqlite'));
  try {
    const git = createGit({ projectsRoot: join(fixture.dir, 'projects') });
    const committed = new TextDecoder().decode((await git.blob(fixture.repository, fixture.published!, 'shop.ontology.yaml'))!);
    const indexed = indexBytes('definitions', 'shop.ontology.yaml', new TextEncoder().encode(committed));
    cache.put({ ...indexed.file, indexedAt: 'cached' }, indexed.entities, indexed.findings);
    writeFileSync(join(fixture.repository, 'shop.ontology.yaml'), 'dirty');
    const loader = indexes({ git, directory: () => fixture.repository, cache });
    const snapshot = await loader.build('definitions', fixture.published!, [{ slug: 'definitions', name: 'Definitions', createdAt: '', origin: '' }]);
    assert.equal(snapshot.projects.get('definitions')![0].document.source, committed);
    assert.equal(snapshot.projects.get('definitions')![0].document.updated, 'cached');
  } finally {
    cache.close();
    fixture.dispose();
  }
}

async function resolverCase(create: typeof createPublishedSnapshots) {
  const fixture = publicationRepository();
  try {
    const layout = dataLayout(fixture.dir);
    mkdirSync(layout.state, { recursive: true });
    const pointers = createPublishedPointers(createState(layout));
    pointers.complete('definitions', 'main', fixture.published!);
    const git = createGit({ projectsRoot: layout.projects });
    let projects: ProjectEntry[] = [{ slug: 'definitions', name: 'Definitions', createdAt: '', origin: '' }];
    const snapshots = create({ git, pointers, projects: () => projects, directory: () => fixture.repository, gitAvailable: () => true });
    await git.run(fixture.repository, ['update-ref', 'refs/heads/main', fixture.authoring]);
    assert((await snapshots.documents(snapshots.pin(), 'definitions'))[0].source.includes('Published'));
    await git.run(fixture.repository, ['update-ref', 'refs/heads/main', fixture.published!]);
    assert.equal(await snapshots.resolveRevision(fixture.foreign!), null);
    assert.equal(await snapshots.resolveRevision('main'), null);
    await snapshots.withPin(async pin => {
      const original = await snapshots.documents(pin, 'definitions');
      pointers.complete('definitions', 'main', fixture.authoring);
      assert.deepEqual(await snapshots.documents(pin, 'definitions'), original);
      for (let index = 0; index < 5; index++) {
        await git.commit(fixture.repository, 'Publication', true);
        pointers.complete('definitions', 'main', (await git.head(fixture.repository))!);
        await snapshots.documents(snapshots.pin(), 'definitions');
        assert(snapshots.retainedCount() <= 3);
      }
    });
    mkdirSync(join(fixture.repository, 'nested'));
    writeFileSync(join(fixture.repository, 'nested', 'nested.yaml'), 'name: Nested\nontology: [{concept: Nested}]\n');
    await git.addAll(fixture.repository);
    await git.commit(fixture.repository, 'Nested project');
    pointers.complete('definitions', 'main', (await git.head(fixture.repository))!);
    const pin = snapshots.pin();
    assert.equal((await snapshots.documents(pin, 'definitions')).length, 2);
    projects = [{ ...projects[0], folder: 'definitions/nested', repo: 'definitions' }];
    assert.equal((await snapshots.documents(snapshots.pin(), 'definitions')).length, 1);
    assert.equal((await snapshots.documents(pin, 'definitions')).length, 2);
    for (let index = 0; index < 2; index++) {
      await git.commit(fixture.repository, 'Unread publication', true);
      pointers.complete('definitions', 'main', (await git.head(fixture.repository))!);
      snapshots.supersede();
    }
    assert.equal(snapshots.retainedCount(), 0);
  } finally {
    fixture.dispose();
  }
}

async function startupCase(category: string, candidate: { openWorkspace?: typeof openWorkspace; initializePublishedPointers?: typeof initializePublishedPointers }) {
  const fixture = publicationRepository();
  try {
    const layout = dataLayout(fixture.dir);
    const state = createState(layout);
    state.writeRegistry([{ slug: 'definitions', name: 'Definitions', createdAt: '', origin: '' }]);
    const git = createGit({ projectsRoot: layout.projects });
    const pointers = createPublishedPointers(state);
    if (category === 'snapshot-initialization') {
      await candidate.initializePublishedPointers!({
        git,
        layout,
        state,
        publication: createPublication({ git, pointers, directory: () => fixture.repository, readable: async () => {}, supersede: () => {} }),
        serverMode: false,
        defaultBranch: async () => {
          throw new UnknownDefaultBranchError('definitions');
        },
      });
      assert.equal(pointers.entries().length, 0);
      return;
    }
    await git.run(fixture.repository, ['config', '--local', 'workbench.defaultBranch', 'main']);
    const path = join(fixture.repository, 'shop.ontology.yaml');
    writeFileSync(path, 'staged');
    await git.stage(fixture.repository, ['shop.ontology.yaml']);
    writeFileSync(path, 'unstaged');
    const index = readFileSync(join(fixture.repository, '.git', 'index'));
    await assert.rejects(() => candidate.openWorkspace!({ root: fixture.dir, reconcilePublished: true }), /has changes/);
    assert.equal(readFileSync(path, 'utf8'), 'unstaged');
    assert.deepEqual(readFileSync(join(fixture.repository, '.git', 'index')), index);
  } finally {
    fixture.dispose();
  }
}

function makeHistorySnapshots(fixture: ReturnType<typeof localPublicationFixtureForHistory>) {
  return makeSnapshots({
    git: fixture.git,
    pointers: fixture.pointers,
    directory: () => fixture.repository,
    projects: () => [{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }],
    gitAvailable: () => true,
  });
}
