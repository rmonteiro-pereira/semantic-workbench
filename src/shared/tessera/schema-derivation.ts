// Derives the Tessera ontology schema from a pinned Ossie ontology schema and the registry, so the two can never drift apart.
import type { JsonSchema, SupportedBase } from './bases';
import { TesseraNames } from './format';
import type { AdditionEntry, AdditionPlace, Registry } from './registry';

/** Where each place's properties sit inside an ontology schema. */
const PROPERTY_HOLDERS: Record<AdditionPlace, (schema: JsonSchema) => JsonSchema> = {
  root: schema => schema,
  concept: schema => schema.$defs.OntologyComponent,
  relationship: schema => schema.$defs.Relationship,
};

/** The identifier of the derived schema for one revision and base. */
export function derivedSchemaId(base: SupportedBase, revision: number): string {
  return `urn:semantic-workbench:tessera-ontology:${revision}:ossie-${base.version}`;
}

/** The file name the derived schema is stored under in the schemas folder. */
export function derivedSchemaFileName(base: SupportedBase, revision: number): string {
  return `tessera-ontology-${revision}-ossie-${base.version}.json`;
}

function additionProperty(entry: AdditionEntry): JsonSchema {
  return { ...entry.value.schema, description: `Tessera addition since revision ${entry.since}: ${entry.value.description}.` };
}

/** Returns the pinned ontology schema with the marker, the registered additions and a new identifier, and nothing else changed. */
export function deriveTesseraSchema(base: SupportedBase, registry: Registry, revision: number): JsonSchema {
  const schema: JsonSchema = structuredClone(base.ontologySchema);
  schema.$id = derivedSchemaId(base, revision);
  schema.$comment =
    `Workbench schema derived from the pinned Ossie ${base.version} ontology schema for Tessera revision ${revision}. ` +
    'It is not part of the Ossie standard. Regenerate it with scripts/derive-tessera-schema.ts.';
  schema.properties[TesseraNames.markerKey] = { type: 'integer', const: revision, description: `Marks the document as ${TesseraNames.product} revision ${revision}.` };
  schema.required = [TesseraNames.markerKey, ...schema.required];
  for (const entry of registry.additions) {
    if (entry.since > revision) continue;
    for (const place of entry.places) PROPERTY_HOLDERS[place](schema).properties[entry.name] = additionProperty(entry);
  }
  return schema;
}

/** Prints a derived schema the way it is stored on disk. */
export function printDerivedSchema(schema: JsonSchema): string {
  return JSON.stringify(schema, null, 2) + '\n';
}
