// Property names kept for later Tessera features. A document that uses one is refused with its own finding.
import { tesseraPropertyName } from './format';

/** A name no document may use yet, and the feature that will register it. */
export type ReservedName = { name: string; owner: string };

/** The reserved names. A feature that registers one removes it from this list in the same change. */
export const RESERVED_NAMES: readonly ReservedName[] = [{ name: tesseraPropertyName('imports'), owner: 'multi-file units' }];
