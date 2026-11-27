import { AdminApiError, problemText } from './api';
import type { DryRun, Proposal } from './types';
/** Binds a review to the exact proposal and base version that produced it. */
export function proposalKey(proposal: Proposal, baseVersion: string): string {
  return JSON.stringify({ proposal, baseVersion });
}
/** Prevents editing or a stale review from authorizing a different proposal. */
export function canConfirm(review: { key: string; result: DryRun } | null, key: string): boolean {
  return review !== null && review.key === key && Boolean(review.result.dryRunId);
}
/** How many of one kind a change removes, as "a restriction" or "3 restrictions". */
function removedCount(count: number, noun: string): string {
  if (count === 1) return `a ${noun}`;
  return `${count} ${noun}s`;
}

/**
 * A short dialog title that names only the kind of removal, such as "Remove a restriction" or
 * "Remove domains and restrictions". The removed names can be long, so they go in the dialog body
 * where they wrap. Counts are keyed by the singular noun; with nothing removed there is no title.
 */
export function removalTitle(counts: Record<string, number>): string | undefined {
  const removed = Object.entries(counts).filter(([, count]) => count > 0);
  if (!removed.length) return undefined;
  if (removed.length > 1) return `Remove ${removed.map(([noun]) => `${noun}s`).join(' and ')}`;
  const [noun, count] = removed[0];
  return `Remove ${removedCount(count, noun)}`;
}

/** Lower-cases only the first letter, so names inside a sentence keep their own capitals. */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Parses comma-separated user input without introducing empty members. */
export function commaList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(',')
        .map(value => value.trim())
        .filter(Boolean),
    ),
  ];
}

/** Checks the normalized address against the grant schema's address pattern. */
export function validGrantEmail(value: string): boolean {
  return /^[^\sA-Z@]+@[^\sA-Z@]+\.[^\sA-Z@]+$/.test(value.trim().toLowerCase());
}

/** Keeps schema diagnostics out of the access-change review. */
export function reviewProblemText(problem: unknown): string {
  if (problem instanceof AdminApiError && problem.status === 400 && /grantsFile|must match|oneOf|data\//.test(problem.reason)) {
    return 'Check the change fields and review the change again.';
  }
  return problemText(problem);
}

/** Stops a refused identity change from being offered or submitted again. */
export function canOfferUserConfirmation(refused: boolean): boolean {
  return !refused;
}
