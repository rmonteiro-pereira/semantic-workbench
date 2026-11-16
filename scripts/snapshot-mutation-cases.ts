// Focused assertions for immutable publication faults.
import assert from 'node:assert/strict';
import { localPublicationCase, localCommitCase } from './local-publication-mutation-cases';
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
import type { createWorktrees } from '../src/server/projects/worktrees';
import { publicationMoveFixture } from '../tests/helpers/publication-fixture';
import type { surfaceFromCredential } from '../src/server/auth/request-surface';
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
    createAgentRoutes?: typeof agentRoutes.createAgentRoutes;
    publishedAgentDocuments?: typeof agentRoutes.publishedAgentDocuments;
    surfaceFromCredential?: typeof surfaceFromCredential;
    createWorktrees?: typeof createWorktrees;
    ROUTE_ACTIONS?: RouteAction[];
    openWorkspace?: typeof openWorkspace;
    initializePublishedPointers?: typeof initializePublishedPointers;
    classify?: typeof classify;
    publicationChecks?: typeof publicationChecks;
    createPublishedSnapshots?: typeof createPublishedSnapshots;
    createSnapshotIndexes?: typeof createSnapshotIndexes;
  },
) {
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
    assert.equal(candidate.surfaceFromCredential!(new Request('http://localhost/'), { mode: 'local', session: false, originAllowed: true }), 'agent');
  }
  if (category === 'snapshot-publication') {
    const fixture = await publicationMoveFixture(candidate.createWorktrees!);
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
        pointers,
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
