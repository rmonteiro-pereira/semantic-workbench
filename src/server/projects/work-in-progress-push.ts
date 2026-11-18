// The rule that work in progress never leaves the workbench: a branch the workbench keeps for
// someone's unfinished work, a personal branch, a contribution branch or a proposal, is not pushed.
// People publish first and push the default branch instead.
import { BadRequestError } from './errors';

const WORK_IN_PROGRESS_PREFIXES = ['work/', 'proposal/'];

/** What a person is told when a push or sync is refused. */
export const WORK_IN_PROGRESS_MESSAGE = 'Work in progress stays in the workbench. Publish it, then use Push default.';

/** Whether a branch name is one the workbench keeps for work in progress, in any letter case. */
export function isWorkInProgressBranch(branch: string) {
  const folded = branch.normalize('NFC').toLowerCase();
  return WORK_IN_PROGRESS_PREFIXES.some(prefix => folded.startsWith(prefix));
}

/** Refuses a push or sync of a branch that holds work in progress; other branches are not touched. */
export function refuseWorkInProgressPush(branch: string) {
  if (isWorkInProgressBranch(branch)) throw new BadRequestError(WORK_IN_PROGRESS_MESSAGE);
}
