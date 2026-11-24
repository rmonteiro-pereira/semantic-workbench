// The rule that work in progress never leaves the workbench: a branch the workbench keeps for
// someone's unfinished work, a personal branch, a contribution branch or a proposal, is not pushed.
// People publish first and push the default branch instead.
import { BadRequestError } from './errors';
import type { Git } from './git';

const WORK_IN_PROGRESS_PREFIXES = ['work/', 'proposal/'];

/** What a person is told when a push or sync is refused. */
export const WORK_IN_PROGRESS_MESSAGE = 'Work in progress stays in the workbench. Publish it, then use Push default.';

/** Whether a branch name is one the workbench keeps for work in progress, in any letter case. */
export function isWorkInProgressBranch(branch: string) {
  const folded = branch.normalize('NFC').toLowerCase();
  const name = folded.startsWith('refs/heads/') ? folded.slice('refs/heads/'.length) : folded;
  return name.startsWith('refs/workbench/') || WORK_IN_PROGRESS_PREFIXES.some(prefix => name.startsWith(prefix));
}

/** Refuses a push or sync of a branch that holds work in progress; other branches are not touched. */
export function refuseWorkInProgressPush(branch: string) {
  if (isWorkInProgressBranch(branch)) throw new BadRequestError(WORK_IN_PROGRESS_MESSAGE);
}

/** Returns the one explicit Git refspec allowed for a commit in the published history. */
export async function outgoingRefspec(git: Git, directory: string, source: string | null, branch: string, published: string | null | undefined): Promise<string> {
  refuseWorkInProgressPush(branch);
  if (!source || !published || !(await git.isAncestor(directory, source, published))) throw new BadRequestError(WORK_IN_PROGRESS_MESSAGE);
  return `${source}:refs/heads/${branch}`;
}
