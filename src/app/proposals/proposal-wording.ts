// The words the interface uses for proposals: statuses, the reasons a promotion would be refused and
// the refusals of each operation, in plain sentences that name what to do next.
import type { DerivedStatus, PromotionReason } from '../../shared/proposals/proposal';
import { ProposalProblem } from './api';

/** The name of each status as people read it. */
export const STATUS_LABEL: Record<DerivedStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  promoted: 'Published',
  damaged: 'Needs attention',
  unregistered: 'Unknown',
};

/** What each reason of a promotion check means for the person reading it. */
export const REASON_TEXT: Record<PromotionReason, string> = {
  authority: 'You cannot publish every project in this repository, so you cannot publish this proposal.',
  'stale-tip': 'Someone changed this proposal after you opened it. Reload it and review it again.',
  'not-descendant': 'The published version moved on. Synchronize the proposal with it and review it again.',
  invalid: 'The proposal cannot be read as a whole, so it cannot be published.',
  guard: 'The proposal makes changes that only a Steward may publish.',
  limit: 'The proposal is larger than the limits allow.',
  'missing-project': 'A project this proposal changes is no longer in the repository.',
  'not-open': 'This proposal is not open.',
};

/** The sentence to show for a failed operation. */
export function problemText(error: unknown): string {
  if (error instanceof ProposalProblem) return error.status === 404 ? 'This proposal is not available to you any more.' : error.message;
  return error instanceof Error ? error.message : 'The request failed.';
}

/** The count of files in a project of a proposal, worded for a heading. */
export const fileCount = (count: number) => (count === 1 ? '1 file' : `${count} files`);

/** The count of published commits a proposal lacks. */
export function behindLine(count: number) {
  if (count === 0) return 'Up to date with the published version.';
  if (count === 1) return 'Lacks 1 published change.';
  return `Lacks ${count} published changes.`;
}

/** The notice that the guarantee is the application's, shown beside the list. */
export const CONFINEMENT_NOTE = 'Proposals stay in the workbench and are never pushed. The workbench enforces this; anyone with Git or file access to the server can still copy them.';
