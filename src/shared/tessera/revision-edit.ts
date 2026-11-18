// Raises the Tessera revision of a document's text. An addition of revision 2 needs the document to declare it, and the author must agree first because older workbenches then stop reading the file.
import { applyPatches } from '../editor/patch';
import { isObject } from '../edit/source-text';
import { isJsonSource, parseSource, valuePatches } from '../edit/yaml-patch';
import { TesseraNames } from './format';
import { readMarker } from './marker';

/** The revision the three added properties need. */
export const ADDITIONS_REVISION = 2;

/** What the document needs before an addition is written: nothing, a higher revision number, or the marker itself. */
export type RevisionNeed = 'none' | 'raise' | 'mark';

/** Reads the document's marker and says what writing a revision 2 addition requires. */
export function revisionNeed(source: string): RevisionNeed {
  let data: unknown;
  try {
    data = parseSource(source).toJS({ maxAliasCount: 100 });
  } catch {
    return 'none';
  }
  if (!isObject(data)) return 'none';
  const marker = readMarker(data);
  if (marker.family === 'standard') return 'mark';
  if (marker.family === 'tessera' && marker.revision < ADDITIONS_REVISION) return 'raise';
  return 'none';
}

/** Returns the text with the marker at the revision, changing the number in place or adding the marker as the first key of a YAML file. */
export function withRevision(source: string, filename: string, revision: number = ADDITIONS_REVISION): string {
  if (revisionNeed(source) === 'none') return source;
  const hasMarker = revisionNeed(source) === 'raise';
  if (!hasMarker && !isJsonSource(source, filename)) {
    const lineBreak = source.includes('\r\n') ? '\r\n' : '\n';
    return `${TesseraNames.markerKey}: ${revision}${lineBreak}${source}`;
  }
  return applyPatches(source, valuePatches(source, [TesseraNames.markerKey], revision, filename));
}
