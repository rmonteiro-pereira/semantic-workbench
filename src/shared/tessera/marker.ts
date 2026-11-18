// Reads the Tessera marker from a parsed document. The marker counts only as a top-level key.
import { isObject } from '../edit/source-text';
import { TesseraNames } from './format';

/** Why a marker is not a valid revision number. */
export type MarkerProblem = 'not-a-whole-number' | 'below-one';

/** The family of a document: ordinary Ossie or ODCS, Tessera at a revision, or Tessera with a marker that cannot be read. */
export type MarkerReading = { family: 'standard' } | { family: 'tessera'; revision: number } | { family: 'invalid'; reason: MarkerProblem; value: unknown };

/** Reads the marker of a parsed document; nested keys with the same name are ordinary data. */
export function readMarker(data: unknown): MarkerReading {
  if (!isObject(data) || !Object.hasOwn(data, TesseraNames.markerKey)) return { family: 'standard' };
  const value = data[TesseraNames.markerKey];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return { family: 'invalid', reason: 'not-a-whole-number', value };
  if (value < 1) return { family: 'invalid', reason: 'below-one', value };
  return { family: 'tessera', revision: value };
}
