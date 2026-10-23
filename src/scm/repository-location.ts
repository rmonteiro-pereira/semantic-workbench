import type { GitStatus } from '../projects/api';

/**
 * Where a project sits in its repository, for the panel header: the remote it follows, the
 * branch and, when only a folder is checked out, that folder (`origin · main · semantic/ubl`).
 */
export function repositoryLocation(
  status: Pick<GitStatus, 'upstream' | 'remotes' | 'branch' | 'folder'>,
) {
  const remote = status.upstream
    ? status.upstream.slice(0, status.upstream.indexOf('/'))
    : (Object.keys(status.remotes)[0] ?? 'no remote');
  return [remote, status.branch, status.folder].filter(Boolean).join(' · ');
}
