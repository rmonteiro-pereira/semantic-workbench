// Carries an explicit read boundary through workspace services.
import type { AccessView } from '../auth/authorize';
import type { ContentGuard } from '../auth/guards';
/**
 * A local reader is unrestricted. A server reader carries a view, the personal state owner and
 * the governance guard every content write applies, so a server write cannot go unguarded.
 */
export type Reader =
  | { view: AccessView; owner: string; guard: ContentGuard }
  | { view: undefined; owner: undefined; guard?: undefined };
/** Explicit authority for local workspace operations. */
export const LOCAL_READER: Reader = Object.freeze({ view: undefined, owner: undefined });
