/** Chooses the highlighting budget for a document without reacting to typing. */
import { largeDocumentThreshold } from './languages';

/** Keeps the initial size mode until an external replacement starts a new document. */
export function chooseLargeDocumentMode(
  length: number,
  previousMode?: boolean,
  externalReplacement = false,
): boolean {
  if (previousMode !== undefined && !externalReplacement) return previousMode;
  return length > largeDocumentThreshold;
}

/** Applies a document-local override until a different document is opened. */
export function resolveDocumentMode(
  length: number,
  previousMode: boolean,
  override: boolean | undefined,
  newDocument: boolean,
): boolean {
  if (newDocument) return chooseLargeDocumentMode(length);
  return override ?? previousMode;
}

/** Switches between full parsing and viewport parsing for the current document. */
export function toggleDocumentMode(largeMode: boolean): boolean {
  return !largeMode;
}
