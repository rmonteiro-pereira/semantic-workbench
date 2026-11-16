// Wire representation of the durable snapshot and the caller's authoring distance.
type PublishedCommit = { branch: string; commit: string; ahead: number; behind: number; remote?: { branch: string; ahead: number } };
/** The published commit, pending outside movement and one-person upgrade notice shown by Source Control. */
export type PublishedStatus = { notice: boolean } & (
  | { state: 'none'; reason: 'no-git' | 'no-commit' | 'unavailable' }
  | ({ state: 'in-sync' } & PublishedCommit)
  | ({ state: 'pending'; pending: { next: string; commits: number; move: 'fast-forward' | 'diverged' } } & PublishedCommit)
);
