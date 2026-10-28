import type { GitStatus } from '../projects/api';

/** The line under the branch picker that names the remote branch Pull and Push use. */
export function trackingLine(upstream: string): string {
  return upstream ? `Tracking ${upstream}` : 'Not tracking a remote branch';
}

/** The remote Fetch, Pull and Push use: the upstream's remote, else the first remote there is. */
export function upstreamRemote(
  status: Pick<GitStatus, 'upstream' | 'remotes'>,
): string | undefined {
  if (status.upstream) return status.upstream.slice(0, status.upstream.indexOf('/'));
  return Object.keys(status.remotes)[0];
}

/** A branch with no upstream has never been pushed, so it has no commits to push or pull yet. */
export function isPublished(upstream: string): boolean {
  return upstream !== '';
}
