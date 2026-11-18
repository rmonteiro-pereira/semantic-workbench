// The table of Ossie bases a Tessera document may declare, and the check that a base leaves the Tessera names alone.
import type { ValidateFunction } from 'ajv';
import ontologySchema020 from '../../../schemas/ossie-ontology-0.2.0.dev0.json';
import { tessera as tesseraValidator020, tesseraRevisionTwo as tesseraRevisionTwoValidator020 } from '../../generated/validators.js';
import { hasTesseraPrefix, TesseraNames } from './format';

/** A parsed JSON Schema document. */
export type JsonSchema = Record<string, any>;

/** One Ossie base: the version a document names in `version`, how output is labelled and the pinned ontology schema. */
export type SupportedBase = {
  version: string;
  label: string;
  draft: boolean;
  ontologySchema: JsonSchema;
  /** The compiled validator of the derived schema, by the Tessera revision it checks. */
  validators: Record<number, ValidateFunction>;
};

/** The places in an ontology schema where Tessera adds properties, so a base must not define the Tessera names there. */
const SCHEMA_PLACES: { place: string; read: (schema: JsonSchema) => JsonSchema | undefined }[] = [
  { place: 'the document root', read: schema => schema },
  { place: 'OntologyComponent', read: schema => schema.$defs?.OntologyComponent },
  { place: 'Relationship', read: schema => schema.$defs?.Relationship },
];

/** Builds the label that names a base in compiled output. */
export function baseLabel(version: string, draft: boolean): string {
  return `valid against the bundled Ossie ${version}${draft ? ' draft' : ''}`;
}

/** The bases this workbench ships. */
export const SUPPORTED_BASES: readonly SupportedBase[] = [
  {
    version: '0.2.0.dev0',
    label: baseLabel('0.2.0.dev0', true),
    draft: true,
    ontologySchema: ontologySchema020,
    validators: { 1: tesseraValidator020, 2: tesseraRevisionTwoValidator020 },
  },
];

/** Lists the properties a base's ontology schema defines under the Tessera prefix or equal to the marker key. */
export function baseCollisions(base: SupportedBase): string[] {
  const collisions: string[] = [];
  for (const { place, read } of SCHEMA_PLACES) {
    const names = Object.keys(read(base.ontologySchema)?.properties ?? {});
    for (const name of names) {
      if (hasTesseraPrefix(name) || name === TesseraNames.markerKey) collisions.push(`${name} at ${place}`);
    }
  }
  return collisions;
}

/** Adds a base to a table, or throws and names the property when the base already uses a Tessera name. */
export function registerBase(table: readonly SupportedBase[], base: SupportedBase): SupportedBase[] {
  const collisions = baseCollisions(base);
  if (collisions.length) throw new Error(`Ossie ${base.version} cannot be a Tessera base because its schema defines ${collisions.join(', ')}.`);
  if (table.some(entry => entry.version === base.version)) throw new Error(`Ossie ${base.version} is already a Tessera base.`);
  return [...table, base];
}

/** Finds the base a document names, or nothing when the version is not supported. */
export function findBase(table: readonly SupportedBase[], version: unknown): SupportedBase | undefined {
  return table.find(base => base.version === version);
}
