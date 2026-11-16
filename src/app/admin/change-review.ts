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
