// Focused assertions for the proposal mutants: each module under test is exercised through its own
// entry point with small real repositories and stand-ins for the rest, so a fault that weakens a
// decision fails one named assertion.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGit } from '../src/server/projects/git';
import { dataLayout } from '../src/server/projects/paths';
import { createProposalRefs } from '../src/server/projects/proposal-refs';
import { createProposalStore } from '../src/server/projects/proposal-store';
import { createProposalContext } from '../src/server/projects/proposal-context';
import { createAccessControl } from '../src/server/auth/authorize';
import { attachIdentity } from '../src/server/auth/request-scope';
import { WriteAccessError } from '../src/server/auth/write-access-error';
import { accessFixture, person } from '../tests/auth/access-fixture';
import { publicationRepository } from '../tests/helpers/git-fixtures';
import { createPublishedPointers } from '../src/server/projects/published-pointer';
import { createState } from '../src/server/projects/state';
import { createSnapshotIndexes } from '../src/server/projects/snapshot-index';
import { createPublication } from '../src/server/projects/publication';
import type { ProposalRecord } from '../src/shared/proposals/proposal';

type Loaded = Record<string, any>;

function git(cwd: string, args: string[]) {
  const result = Bun.spawnSync(['git', ...args], { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  assert.equal(result.exitCode, 0, `git ${args.join(' ')}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

// A repository with Sales and Billing folders, one proposal at the base, and a contribution branch.
async function proposalWorld() {
  const root = mkdtempSync(join(tmpdir(), 'workbench-proposal-mutation-'));
  const layout = dataLayout(root);
  const repository = join(layout.projects, 'shared');
  mkdirSync(join(repository, 'sales'), { recursive: true });
  mkdirSync(join(repository, 'billing'), { recursive: true });
  git(repository, ['init', '-q', '-b', 'main']);
  writeFileSync(join(repository, 'sales/a.txt'), 'one\n');
  writeFileSync(join(repository, 'billing/b.txt'), 'one\n');
  git(repository, ['add', '-A']);
  git(repository, ['-c', 'user.name=T', '-c', 'user.email=t@example.org', 'commit', '-q', '-m', 'base']);
  const base = git(repository, ['rev-parse', 'HEAD']);
  const gitHelper = createGit({ projectsRoot: layout.projects });
  const refs = createProposalRefs(gitHelper, () => repository);
  assert(await refs.createRef('shared', 'p1', base));
  const record: ProposalRecord = { id: 'p1', name: 'One', projects: ['sales'], base, createdBy: 'a', createdByName: 'A', createdAt: '2026-11-17T00:00:00.000Z', status: 'open', contributors: [] };
  const store = createProposalStore(layout);
  store.write('shared', [record]);
  const branchHead = (changes: Record<string, string>, message = 'work') => {
    git(repository, ['switch', '-q', '--detach', base]);
    for (const [path, text] of Object.entries(changes)) writeFileSync(join(repository, path), text);
    git(repository, ['add', '-A']);
    git(repository, ['-c', 'user.name=T', '-c', 'user.email=t@example.org', 'commit', '-q', '-m', message]);
    const head = git(repository, ['rev-parse', 'HEAD']);
    git(repository, ['switch', '-q', 'main']);
    git(repository, ['update-ref', 'refs/heads/work/alice.p1', head]);
    return head;
  };
  const calls = { files: 0, guard: 0, promoted: 0 };
  const behaviour = { filesThrow: false, guardThrow: false, authorityThrow: false };
  const deps: any = {
    store,
    refs,
    git: gitHelper,
    worktrees: { baseDir: () => repository, defaultBranch: async () => 'main' },
    changes: async () => [],
    repositoryOf: () => 'shared',
    projectsIn: () => ['sales', 'billing'],
    projectName: (slug: string) => slug,
    prefixOf: (slug: string) => `${slug}/`,
    ownerOf: () => ({ key: 'u', handle: 'alice', name: 'Alice' }),
    publishedCommit: () => base,
    serialized: (_repository: string, use: () => Promise<unknown>) => use(),
    emit: () => {},
    now: () => new Date('2026-11-17T00:00:00.000Z'),
    promote: async () => {
      calls.promoted++;
      return { published: 'main', previous: base, commit: base };
    },
    checkCandidate: async () => {},
  };
  const authority = {
    check: () => {
      if (behaviour.authorityThrow) throw new Error('no authority');
    },
    allows: () => true,
    files: () => {
      calls.files++;
      if (behaviour.filesThrow) throw new Error('may not edit');
    },
    checkout: () => {},
  };
  const reader: any = {
    view: undefined,
    owner: 'alice',
    guard: () => {
      calls.guard++;
      if (behaviour.guardThrow) throw new Error('guarded');
    },
  };
  const context = createProposalContext(deps);
  const tipOf = async () => refs.readTip('shared', 'p1');
  return { repository, base, branchHead, context, caller: { reader, authority }, calls, behaviour, tipOf, dispose: () => rmSync(root, { recursive: true, force: true }) };
}

async function contributionCases(loaded: Loaded) {
  const world = await proposalWorld();
  try {
    const { createContributions } = loaded;
    const contributions = createContributions(world.context);
    const contribute = (expectedTip: string, branchHead: string) => contributions.contribute('sales', 'p1', { expectedTip, branchHead }, world.caller);
    const inside = world.branchHead({ 'sales/a.txt': 'two\n' });
    await assert.rejects(contribute('f'.repeat(40), inside), { code: 'stale-tip' }, 'a tip the person did not review is stale');
    assert.equal(await world.tipOf(), world.base, 'a stale contribution moves nothing');
    const outside = world.branchHead({ 'sales/a.txt': 'two\n', 'billing/b.txt': 'two\n' });
    await assert.rejects(contribute(world.base, outside), { code: 'outside-declared-projects' }, 'a file of an undeclared project refuses the contribution');
    const loose = world.branchHead({ 'README.md': 'outside every project\n' });
    await assert.rejects(contribute(world.base, loose), { code: 'outside-declared-projects' }, 'a file of no project refuses the contribution');
    assert.equal(await world.tipOf(), world.base, 'a refused scope moves nothing');
    world.branchHead({ 'sales/a.txt': 'two\n' });
    world.behaviour.filesThrow = true;
    await assert.rejects(contribute(world.base, inside), /may not edit/, 'every changed file is authorized');
    world.behaviour.filesThrow = false;
    world.behaviour.guardThrow = true;
    await assert.rejects(contribute(world.base, inside), /guarded/, 'the content guard judges the contribution');
    assert.equal(await world.tipOf(), world.base, 'refusals move nothing');
    world.behaviour.guardThrow = false;
    const accepted = await contribute(world.base, inside);
    assert.equal(await world.tipOf(), inside, 'a good contribution moves the proposal');
    assert.equal(accepted.audit.commits[1], inside);
    assert(world.calls.files > 0 && world.calls.guard > 0, 'authority and guard were consulted');
  } finally {
    world.dispose();
  }
}

async function promotionCases(loaded: Loaded) {
  const world = await proposalWorld();
  try {
    const { createPromotions } = loaded;
    const promotions = createPromotions(world.context);
    const promote = (expectedTip: string) => promotions.promote('sales', 'p1', { expectedTip }, world.caller);
    await assert.rejects(promote('f'.repeat(40)), { code: 'stale-tip' }, 'a promotion names the tip it reviewed');
    assert.equal(world.calls.promoted, 0, 'a stale promotion never reaches publication');
    world.behaviour.authorityThrow = true;
    await assert.rejects(promote(world.base), /no authority/, 'authority is checked before anything else');
    assert.equal(world.calls.promoted, 0, 'a refused promotion never reaches publication');
    world.behaviour.authorityThrow = false;
    await promote(world.base);
    assert.equal(world.calls.promoted, 1, 'a reviewed, authorized promotion reaches publication once');
  } finally {
    world.dispose();
  }
}

function accessCases(loaded: Loaded) {
  const access = createAccessControl(accessFixture());
  const promoteAs = (who: 'bob' | 'dave', repositoryProjects: string[]) => {
    const principal = access.principalFor(person(who));
    const request = new Request('http://operation.internal/api/projects/sales-contracts/proposals');
    attachIdentity(request, { principal, origin: 'http', sourceIp: '127.0.0.1', session: null } as never, { scope: access.forRequest(principal), requestId: 'mutation', remote: 'local' });
    loaded.authorizeProposal(request, 'promote', { id: 'p1', declaredProjects: ['sales-contracts'], repositoryProjects, defaultBranch: 'main' });
  };
  promoteAs('bob', ['sales-contracts', 'sales-metrics']);
  assert.throws(() => promoteAs('bob', ['sales-contracts', 'sales-metrics', 'hr-people']), WriteAccessError, 'authority covers every project that shares the repository');
  promoteAs('dave', ['sales-contracts', 'sales-metrics', 'hr-people']);
}

async function publicationCases(loaded: Loaded) {
  const checks = loaded.publicationChecks({ isAncestor: async () => false, readable: async () => {}, guard: async () => {} });
  await assert.rejects(checks[0]({ repo: 'shared', branch: 'main', previous: 'a', next: 'b' }), { name: 'NotFastForwardError' }, 'a candidate that does not contain the published tip is refused');
}

async function secondWriterCases(loaded: Loaded) {
  const fixture = publicationRepository();
  try {
    const layout = dataLayout(fixture.dir);
    mkdirSync(layout.state, { recursive: true });
    const gitHelper = createGit({ projectsRoot: layout.projects, worktreesRoot: layout.worktrees });
    const state = createState(layout);
    state.writeRegistry([{ slug: 'definitions', name: 'Definitions', createdAt: '', origin: '' }]);
    const pointers = createPublishedPointers(state);
    pointers.complete('definitions', 'main', fixture.published!);
    const indexes = createSnapshotIndexes({ git: gitHelper, directory: () => fixture.repository });
    const publication = createPublication({
      git: gitHelper,
      pointers,
      directory: () => fixture.repository,
      readable: candidate => indexes.build(candidate.repo, candidate.next, []),
      supersede: () => {},
    });
    const worktrees = loaded.createWorktrees({ layout, git: gitHelper, people: () => [], publication });
    const before = git(fixture.repository, ['rev-parse', 'refs/heads/main']);
    await assert.rejects(
      worktrees.promote(
        'definitions',
        fixture.authoring,
        async () => {
          throw Error('Guard refused');
        },
        {},
      ),
      /Guard refused/,
      'a promotion is judged by the publication guard before the default branch moves',
    );
    assert.equal(git(fixture.repository, ['rev-parse', 'refs/heads/main']), before, 'a refused promotion leaves the default branch alone');
    assert.deepEqual(pointers.get('definitions'), { branch: 'main', commit: fixture.published! }, 'and the durable pointer');
  } finally {
    fixture.dispose();
  }
}

async function pushRuleCases(loaded: Loaded) {
  for (const branch of ['work/alice', 'Work/Alice.p1', 'proposal/rename']) assert.throws(() => loaded.refuseWorkInProgressPush(branch), /Work in progress stays/, `${branch} is never pushed`);
  for (const branch of ['main', 'feature/work', 'release/1']) loaded.refuseWorkInProgressPush(branch);
}

// Push and sync through the remote actions with a stand-in Git that records what it is asked to run.
async function remoteCases(loaded: Loaded) {
  const runs: string[][] = [];
  let branch = 'work/alice';
  const stub: any = {
    status: async () => ({ branch, upstream: '' }),
    run: async (_directory: string, args: string[]) => {
      runs.push(args);
      return { code: 0, stdout: '', stderr: '', bytes: new Uint8Array() };
    },
    remoteAddresses: async () => [],
    remotes: async () => new Map(),
    configValue: async () => null,
  };
  const context: any = {
    deps: {},
    git: stub,
    dir: () => '/repository',
    ownerOf: () => undefined,
    after: async () => ({ ahead: 0, behind: 0 }),
    alteredAfter: async () => [],
    fetchFolderContents: async () => {},
  };
  const remote = loaded.createScmRemote(context);
  const pushes = () => runs.filter(args => args.includes('push'));
  for (const kind of ['push', 'sync'] as const) {
    await assert.rejects(remote.remoteAction('s', kind, { choice: { name: 'origin' } }), /Work in progress stays/, `${kind} refuses a work branch`);
    assert.equal(pushes().length, 0, `${kind} of a work branch sends nothing`);
  }
  branch = 'main';
  await remote.remoteAction('s', 'push', { choice: { name: 'origin' } });
  assert.equal(pushes().length, 1, 'the default branch still pushes');
  for (const forbidden of ['refs/workbench', '--all', '--mirror', '--tags']) assert(!pushes()[0].join(' ').includes(forbidden), `a push never names ${forbidden}`);
}

/** Runs the cases for the proposal module a mutant changed, found by what the candidate module exports. */
export async function proposalsCases(loaded: Loaded): Promise<void> {
  if ('createContributions' in loaded) await contributionCases(loaded);
  else if ('createPromotions' in loaded) await promotionCases(loaded);
  else if ('authorizeProposal' in loaded) accessCases(loaded);
  else if ('publicationChecks' in loaded) await publicationCases(loaded);
  else if ('createWorktrees' in loaded) await secondWriterCases(loaded);
  else if ('refuseWorkInProgressPush' in loaded) await pushRuleCases(loaded);
  else if ('createScmRemote' in loaded) await remoteCases(loaded);
  else throw Error('No proposal case for this module.');
}
