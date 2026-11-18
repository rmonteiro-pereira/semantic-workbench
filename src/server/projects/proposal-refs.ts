// The Git refs that hold proposal tips. An open proposal lives at `refs/workbench/proposals/<id>` and
// a closed one at `refs/workbench/closed-proposals/<id>`. They are not branches, so no branch list
// shows them and no ordinary push sends them. Every move names the value it expects, so two
// writers racing for one proposal cannot both win. The caller holds the repository's queue.
import type { ChangedPath } from '../../shared/proposals/proposal';
import type { Git } from './git';

const OPEN_PREFIX = 'refs/workbench/proposals/';
const CLOSED_PREFIX = 'refs/workbench/closed-proposals/';

/** The open and closed tips of each proposal found in a repository. */
export type ProposalTips = { open: Map<string, string>; closed: Map<string, string> };

const openRef = (id: string) => OPEN_PREFIX + id;
const closedRef = (id: string) => CLOSED_PREFIX + id;

function statusOf(code: string): ChangedPath['status'] {
  if (code === 'A') return 'added';
  if (code === 'D') return 'removed';
  return 'changed';
}

/** Parses `git diff --name-status -z` output, which alternates a status letter and a path. */
export function parseChangedPaths(output: string): ChangedPath[] {
  const fields = output.split('\0').filter(Boolean);
  const changes: ChangedPath[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    changes.push({ path: fields[index + 1], status: statusOf(fields[index][0]) });
  }
  return changes;
}

/** Creates the proposal refs service over the repositories' base folders. */
export function createProposalRefs(git: Git, directory: (repository: string) => string) {
  async function update(repository: string, lines: string[]) {
    const result = await git.run(directory(repository), ['update-ref', '--stdin'], { stdin: lines.join('\n') + '\n', allowFailure: true });
    return result.code === 0;
  }
  async function tipsUnder(repository: string, prefix: string) {
    const listed = await git.run(directory(repository), ['for-each-ref', '--format=%(refname) %(objectname)', prefix], { readOnly: true });
    const tips = new Map<string, string>();
    for (const line of listed.stdout.split('\n').filter(Boolean)) {
      const [name, commit] = line.split(' ');
      tips.set(name.slice(prefix.length), commit);
    }
    return tips;
  }
  return {
    /** Creates the open ref; false when one already exists, so a clash never overwrites. */
    createRef: (repository: string, id: string, commit: string) => update(repository, [`update ${openRef(id)} ${commit} ${'0'.repeat(commit.length)}`]),
    /** Moves the open ref only if it still holds `expectedOld`; false means someone moved it first. */
    moveRef: (repository: string, id: string, expectedOld: string, next: string) => update(repository, [`update ${openRef(id)} ${next} ${expectedOld}`]),
    /** Moves the tip from the open to the closed ref in one transaction. */
    closeRef: (repository: string, id: string, tip: string) =>
      update(repository, ['start', `update ${closedRef(id)} ${tip} ${'0'.repeat(tip.length)}`, `delete ${openRef(id)} ${tip}`, 'prepare', 'commit']),
    /** Moves the tip from the closed to the open ref in one transaction. */
    restoreRef: (repository: string, id: string, tip: string) =>
      update(repository, ['start', `update ${openRef(id)} ${tip} ${'0'.repeat(tip.length)}`, `delete ${closedRef(id)} ${tip}`, 'prepare', 'commit']),
    /** Deletes the open ref if it still holds `tip`. */
    removeRef: (repository: string, id: string, tip: string) => update(repository, [`delete ${openRef(id)} ${tip}`]),
    /** The tip of an open or closed proposal, or null when its ref does not exist. */
    async readTip(repository: string, id: string, which: 'open' | 'closed' = 'open') {
      const ref = which === 'open' ? openRef(id) : closedRef(id);
      const result = await git.run(directory(repository), ['rev-parse', '-q', '--verify', ref], { readOnly: true, allowFailure: true });
      return result.code === 0 ? result.stdout.trim() : null;
    },
    /** The identifiers of open proposals whose tip is already part of `commit`'s history. */
    async mergedInto(repository: string, commit: string) {
      const listed = await git.run(directory(repository), ['for-each-ref', '--merged', commit, '--format=%(refname)', OPEN_PREFIX], { readOnly: true });
      return new Set(
        listed.stdout
          .split('\n')
          .filter(Boolean)
          .map(name => name.slice(OPEN_PREFIX.length)),
      );
    },
    /** How many commits of `published` the tip lacks. */
    async behind(repository: string, tip: string, published: string) {
      const counted = await git.run(directory(repository), ['rev-list', '--count', `${tip}..${published}`], { readOnly: true });
      return Number(counted.stdout.trim()) || 0;
    },
    /** Every open and closed proposal tip of a repository, keyed by identifier. */
    async listTips(repository: string): Promise<ProposalTips> {
      return { open: await tipsUnder(repository, OPEN_PREFIX), closed: await tipsUnder(repository, CLOSED_PREFIX) };
    },
    /** The files that differ between two commits, with renames split into a removal and an addition. */
    async changedPaths(repository: string, from: string, to: string) {
      const diff = await git.run(directory(repository), ['diff', '--no-ext-diff', '--no-renames', '--name-status', '-z', from, to], { readOnly: true });
      return parseChangedPaths(diff.stdout);
    },
  };
}

/** The proposal refs of one workspace. */
export type ProposalRefs = ReturnType<typeof createProposalRefs>;
