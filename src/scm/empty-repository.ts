import type { GitStatus } from '../projects/api';

/** What the panel says when nothing changed, without claiming a last commit that may not exist. */
export function cleanTreeText(status: Pick<GitStatus, 'hasCommits'>): string {
  if (!status.hasCommits) return 'No changes. This repository has no commits yet.';
  return 'No changes. The working tree matches the last commit.';
}
