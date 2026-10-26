import type { DryRun, Proposal } from './types';
/** Binds a review to the exact proposal and base version that produced it. */
export function proposalKey(proposal: Proposal, baseVersion: string): string {
  return JSON.stringify({ proposal, baseVersion });
}
/** Prevents editing or a stale review from authorizing a different proposal. */
export function canConfirm(review: { key: string; result: DryRun } | null, key: string): boolean {
  return review !== null && review.key === key && Boolean(review.result.dryRunId);
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
