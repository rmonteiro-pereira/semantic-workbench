// Carries an explicit read boundary through workspace services.
import type { AccessView } from '../auth/authorize';
import type { ContentGuard } from '../auth/guards';
import type { CommitAuthor } from './git';
/**
 * A signed-in person's own working copies in server mode: the folder key, the author their
 * commits carry, and whether a project is theirs to edit (only then do they get a copy of it).
 */
export type CopyAccess = {
  key: string;
  author: CommitAuthor;
  editable: (project: string) => boolean;
};
/**
 * A local reader is unrestricted. A server reader carries a view, the personal state owner and
 * the governance guard every content write applies, so a server write cannot go unguarded. A
 * person also carries their working copies; agent clients and readers without one see the
 * published state.
 */
export type Reader = { view: AccessView; owner: string; guard: ContentGuard; copy?: CopyAccess } | { view: undefined; owner: undefined; guard?: undefined; copy?: undefined };
/** Explicit authority for local workspace operations. */
export const LOCAL_READER: Reader = Object.freeze({ view: undefined, owner: undefined });
