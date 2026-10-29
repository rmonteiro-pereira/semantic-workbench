/** Chooses the highlighting budget when a document opens and preserves it while editing. */

/** Sets the source length above which YAML opens with viewport-limited highlighting. */
export const largeDocumentThreshold = 500_000;

/** Chooses the initial highlighting budget from the document's opening length. */
export function initialDocumentMode(length: number): boolean {
  return length > largeDocumentThreshold;
}

/** Keeps the current mode or override until a different document opens. */
export function resolveDocumentMode({ length, previous, override, newDocument }: { length: number; previous: boolean; override: boolean | undefined; newDocument: boolean }): boolean {
  if (newDocument) return initialDocumentMode(length);
  return override ?? previous;
}
