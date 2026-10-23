// Assertions for the Source Control mutants: what staging answers with, case variants, branch
// names, and the arguments of remote commands. Each case runs against a candidate scm module.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Candidate = any;

export function git(cwd: string, ...args: string[]) {
  const result = Bun.spawnSync(['git', ...args], { cwd });
  if (result.exitCode !== 0) throw Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

/** A reader of server mode that cannot read the `secret/` folder. */
export function readerWithoutSecrets(slug: string) {
  const view = {
    readableProjects: new Set([slug]),
    canRead: (_project: string, path: string) => !path.startsWith('secret/'),
    roles: () => [],
  };
  const guard = (changes: unknown) => ({ changes, refused: [], demoted: [] });
  return { view, owner: 'person', guard };
}

/** Wraps a Git runner so the arguments of every command the module runs are recorded. */
function recordingGit(real: any, calls: string[][]) {
  return new Proxy(real, {
    get(target, key, receiver) {
      if (key !== 'run') return Reflect.get(target, key, receiver);
      return (cwd: string, args: string[], options: unknown) => {
        calls.push(args);
        return target.run(cwd, args, options);
      };
    },
  });
}

/** A workspace with one repository project, its files committed, and Source Control over it. */
async function scmFixture(candidate: Candidate, wrap?: (git: any) => any, deps: object = {}) {
  const { testWorkspace } = await import('../tests/helpers/temp-data-dir');
  const { ontologyText } = await import('../tests/helpers/git-fixtures');
  const fixture = await testWorkspace();
  const project = await fixture.seed(
    [
      { path: 'a.ontology.yaml', source: ontologyText('A', ['X']) },
      { path: 'secret/plan.ontology.yaml', source: ontologyText('P', ['Y']) },
    ],
    'proj',
  );
  const slug = project.slug as string;
  const dir = join(fixture.root, 'projects', slug);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'base');
  const ws = fixture.ws;
  const scm = candidate.createScm({
    layout: ws.layout,
    git: wrap ? wrap(ws.git) : ws.git,
    gitAvailable: true,
    siblings: () => [slug],
    project: () => ({}),
    drafts: () => [],
    rescan: async () => {},
    emit: () => {},
    defaultBranch: async () => 'main',
    ...deps,
  });
  return { fixture, slug, dir, scm, root: fixture.root };
}

/** Adds a local bare remote named origin with the current branch pushed to it. */
function addRemote(dir: string, root: string) {
  const bare = join(root, 'remote.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', bare);
  git(dir, 'remote', 'add', 'origin', bare);
  git(dir, 'push', '-q', '-u', 'origin', 'main');
  return bare;
}

async function scmStatusCase(candidate: Candidate) {
  const { scm, slug, dir, fixture } = await scmFixture(candidate);
  try {
    const reader = readerWithoutSecrets(slug);
    writeFileSync(join(dir, 'secret', 'new.txt'), 'hidden');
    writeFileSync(join(dir, 'a.ontology.yaml'), '# changed\n');
    const names = (status: any) => status.changes.map((change: any) => change.path);
    const staged = await scm.stage(slug, ['a.ontology.yaml'], 'project', reader);
    assert.deepEqual(names(staged), ['a.ontology.yaml']);
    const unstaged = await scm.unstage(slug, ['a.ontology.yaml'], 'project', reader);
    assert.deepEqual(names(unstaged), ['a.ontology.yaml']);
    const everything = await scm.stageAll(slug, true, reader);
    assert.deepEqual(names(everything), ['a.ontology.yaml']);
    // Without a reader the caller is local and sees everything.
    const local = await scm.stage(slug, ['a.ontology.yaml']);
    assert(names(local).includes('secret/new.txt'));
  } finally {
    fixture.dispose();
  }
}

async function scmCaseVariantCase(candidate: Candidate) {
  const { scm, slug, fixture } = await scmFixture(candidate);
  const refused = (error: any) => error.name === 'CaseVariantError';
  try {
    await assert.rejects(() => scm.stage(slug, ['SECRET/plan.ontology.yaml']), refused);
    await assert.rejects(() => scm.unstage(slug, ['secret/PLAN.ontology.yaml']), refused);
    const diff = () =>
      scm.diff(slug, 'SECRET/plan.ontology.yaml', 'HEAD', 'worktree', 'project', {});
    await assert.rejects(diff, refused);
    await assert.rejects(() => scm.log(slug, 'SECRET/plan.ontology.yaml', 5, {}), refused);
    await assert.rejects(() => scm.versions(slug, 'Secret/plan.ontology.yaml', 5, {}), refused);
    const exact = await scm.diff(
      slug,
      'secret/plan.ontology.yaml',
      'HEAD',
      'worktree',
      'project',
      {},
    );
    assert.equal(exact.afterExists, true);
  } finally {
    fixture.dispose();
  }
}

async function scmBranchListCase(candidate: Candidate) {
  const { scm, slug, dir, fixture } = await scmFixture(candidate, undefined, {
    ownBranch: () => 'work/alice',
  });
  try {
    git(dir, 'branch', 'work/alice');
    git(dir, 'branch', 'work/bob');
    git(dir, 'update-ref', 'refs/remotes/origin/work/bob', 'HEAD');
    git(dir, 'update-ref', 'refs/remotes/origin/work/alice', 'HEAD');
    const reader = readerWithoutSecrets(slug);
    const shown = await scm.branches(slug, reader);
    assert(shown.local.includes('work/alice') && shown.local.includes('main'));
    assert(!shown.local.includes('work/bob'));
    assert(shown.remote.includes('origin/work/alice'));
    assert(!shown.remote.includes('origin/work/bob'));
    // A local reader has no view and sees every branch of their own repository.
    const all = await scm.branches(slug);
    assert(all.local.includes('work/bob') && all.remote.includes('origin/work/bob'));
  } finally {
    fixture.dispose();
  }
}

async function scmSwitchCase(candidate: Candidate) {
  const calls: string[][] = [];
  const authorized: string[] = [];
  const freed: string[] = [];
  const deps = {
    assertBranchFree: async (_slug: string, branch: string) => void freed.push(branch),
  };
  const { scm, slug, dir, root, fixture } = await scmFixture(
    candidate,
    real => recordingGit(real, calls),
    deps,
  );
  try {
    const bare = addRemote(dir, root);
    git(dir, 'branch', 'feature');
    git(dir, 'push', '-q', 'origin', 'feature');
    git(dir, 'branch', '-D', 'feature');
    git(dir, 'tag', 'v1');
    git(dir, 'update-ref', 'refs/remotes/origin/-x', 'HEAD');
    assert(bare);
    const reader = readerWithoutSecrets(slug);
    const record = (local: string) => void authorized.push(local);
    const refuse = async (name: string, pattern: RegExp) =>
      assert.rejects(() => scm.switchBranch(slug, name, false, reader, record), pattern);
    git(dir, 'switch', '-q', '-c', 'other');
    git(dir, 'switch', '-q', 'main');
    // `@{-1}` names the previous checkout, not a branch the person was authorized for.
    await refuse('@{-1}', /not a valid branch name/);
    await refuse('v1', /is not a branch/);
    await refuse('origin/-x', /not a valid branch name/);
    assert.deepEqual(authorized, []);
    assert.equal(git(dir, 'branch', '--show-current'), 'main');
    // The remote branch is authorized and checked as the local branch it becomes.
    const switched = await scm.switchBranch(slug, 'origin/feature', false, reader, record);
    assert.equal(switched.branch, 'feature');
    assert.deepEqual(authorized, ['feature']);
    assert.deepEqual(freed, ['feature']);
    assert.equal(git(dir, 'branch', '--show-current'), 'feature');
    const switchCall = calls.find(args => args[0] === 'switch')!;
    assert.deepEqual(switchCall, ['switch', '--end-of-options', 'feature']);
    await scm.switchBranch(slug, 'brand-new', true, reader, record);
    assert.deepEqual(calls.filter(args => args[0] === 'switch').at(-1), [
      'switch',
      '-c',
      'brand-new',
    ]);
    await assert.rejects(() => scm.switchBranch(slug, '-bad', true, reader, record));
    const create = (name: string) => scm.switchBranch(slug, name, true, reader, record);
    // Our own message, not Git's: the name is refused before Git sees it.
    await assert.rejects(() => create('@{-1}'), /"@\{-1\}" is not a valid branch name/);
    await assert.rejects(() => create('bad..name'), /"bad\.\.name" is not a valid branch name/);
    // A spelling that differs only in case is the existing branch on a volume that ignores case.
    await assert.rejects(() => create('Main'), /differs only in letter case from "main"/);
  } finally {
    fixture.dispose();
  }
}

export const allowAll = (changes: unknown) => ({ changes, refused: [], demoted: [] });

async function scmRemoteArgumentsCase(candidate: Candidate) {
  const calls: string[][] = [];
  const { scm, slug, dir, root, fixture } = await scmFixture(candidate, real =>
    recordingGit(real, calls),
  );
  try {
    addRemote(dir, root);
    const reader = { ...readerWithoutSecrets(slug), guard: allowAll };
    const optionEnd = (verb: string, ...rest: string[]) => {
      const call = calls.filter(args => args[0] === verb).at(-1);
      assert(call, `no ${verb} call`);
      const at = call.indexOf('--end-of-options');
      assert(at > 0, `${verb} does not end its options before the remote`);
      assert.deepEqual(call.slice(at + 1, at + 1 + rest.length), rest);
    };
    await scm.fetch(slug);
    optionEnd('fetch', 'origin');
    await scm.push(slug);
    optionEnd('push', 'origin', 'main');
    await scm.pushDefault(slug);
    optionEnd('push', 'origin', 'refs/heads/main:refs/heads/main');
    // A pull with a guard fetches the branch first; without one it names the remote and branch.
    git(dir, 'branch', '--unset-upstream');
    await scm.pull(slug, reader);
    optionEnd('fetch', 'origin', 'refs/heads/main');
    await scm.pull(slug, { ...reader, guard: undefined });
    optionEnd('pull', 'origin', 'refs/heads/main');
  } finally {
    fixture.dispose();
  }
}

async function scmRemoteNameCase(candidate: Candidate) {
  const calls: string[][] = [];
  const fakeRemote = { name: '--upload-pack=sh', fetchUrl: '/x', pushUrl: '/x' };
  const wrap = (real: any) => {
    const recorded = recordingGit(real, calls);
    return new Proxy(recorded, {
      get(target, key, receiver) {
        if (key === 'remoteAddresses') return async () => [fakeRemote];
        return Reflect.get(target, key, receiver);
      },
    });
  };
  const { scm, slug, fixture } = await scmFixture(candidate, wrap);
  try {
    const reader = readerWithoutSecrets(slug);
    await assert.rejects(() => scm.fetch(slug), /remote name/);
    await assert.rejects(() => scm.push(slug), /remote name/);
    await assert.rejects(() => scm.pull(slug, reader), /remote name/);
    await assert.rejects(() => scm.pushDefault(slug), /remote name/);
    assert.equal(calls.filter(args => ['fetch', 'push', 'pull'].includes(args[0])).length, 0);
  } finally {
    fixture.dispose();
  }
}

/** The Source Control categories and the assertions each runs. */
export const scmCases: Record<string, (candidate: Candidate) => Promise<void>> = {
  'secrev-scm-status': scmStatusCase,
  'secrev-scm-case': scmCaseVariantCase,
  'secrev-scm-branches': scmBranchListCase,
  'secrev-scm-switch': scmSwitchCase,
  'secrev-scm-remote-args': scmRemoteArgumentsCase,
  'secrev-scm-remote-name': scmRemoteNameCase,
};
