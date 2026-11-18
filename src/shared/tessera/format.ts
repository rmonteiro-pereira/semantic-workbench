// The one definition of the Tessera name and the constants every other Tessera module reads.

/** The product name, the marker key and the property prefix, spelled once. */
export const TesseraNames = {
  product: 'Tessera',
  markerKey: 'tessera',
  propertyPrefix: 'tessera_',
} as const;

/** The revisions of the Tessera rules this workbench understands. */
export const SUPPORTED_REVISIONS: readonly number[] = [1];

/** The version of the compiler; it is part of every loss report and manifest. */
export const COMPILER_VERSION = '1.0.0';

/** Tells whether a property name belongs to the Tessera namespace. */
export function hasTesseraPrefix(name: string): boolean {
  return name.startsWith(TesseraNames.propertyPrefix);
}

/** Builds a Tessera property name from its suffix, so no other module spells the prefix. */
export function tesseraPropertyName(suffix: string): string {
  return TesseraNames.propertyPrefix + suffix;
}

/** What a document is: ordinary Ossie or ODCS, or Tessera at a revision on a named Ossie base. */
export type DocumentFormat = { family: 'standard' } | { family: 'tessera'; revision: number; base: string; baseLabel: string };
