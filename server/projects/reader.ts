// Carries an explicit read boundary through workspace services.
import type { AccessView } from '../auth/authorize';
/** A local reader is unrestricted; server readers carry a view and personal state owner. */
export type Reader = { view: AccessView; owner: string } | { view: undefined; owner: undefined };
/** Explicit authority for local workspace operations. */
export const LOCAL_READER: Reader = Object.freeze({ view: undefined, owner: undefined });
