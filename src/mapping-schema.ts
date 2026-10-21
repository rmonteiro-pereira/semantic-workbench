/** Validates standalone and embedded mappings against the pinned mapping schema. */
import Ajv from 'ajv/dist/2020';
import formats from 'ajv-formats';
import ontology from '../schemas/ossie-ontology-0.2.0.dev0.json';
import mapping from '../schemas/ossie-mapping-0.2.0.dev0.json';
import core from '../schemas/ossie-core-mapping-dependencies.json';
import type { Issue } from './diagnostics';
const validator = new Ajv({ strict: false, allErrors: true });
formats(validator);
validator.addFormat('iri', /^[a-z][a-z\d+.-]*:[^\s]+$/i);
validator.addSchema(
  core,
  'https://raw.githubusercontent.com/apache/ossie/main/core-spec/ossie-schema.json',
);
validator.addSchema(
  ontology,
  'https://raw.githubusercontent.com/apache/ossie/main/ontology/ontology.json',
);
const standalone = validator.compile(mapping);
const embedded = validator.compile({
  $ref: 'https://raw.githubusercontent.com/apache/ossie/main/ontology/ontology.json#/$defs/OntologyMap',
});
const versionedOntology = validator.getSchema(
  'https://raw.githubusercontent.com/apache/ossie/main/ontology/ontology.json',
)!;
/** Checks whether parsed data has a supported concept-mapping shape. */
export function isMapping(data: any) {
  return (
    data &&
    ['concept_mappings', 'ontology_ref', 'semantic_model_ref'].some(key => data[key] !== undefined)
  );
}
/** Validates mappings and attaches findings to their document paths. */
export function mappingSchemaIssues(
  data: any,
  mode: 'standalone' | 'embedded' | 'ontology' = 'standalone',
  prefix = '',
): Issue[] {
  const validate =
    mode === 'standalone' ? standalone : mode === 'embedded' ? embedded : versionedOntology;
  if (validate(data)) return [];
  return (validate.errors ?? []).map(e => ({
    severity: 'error',
    code: 'schema',
    path:
      prefix +
        (e.instancePath || '') +
        (e.keyword === 'required'
          ? '/' + e.params.missingProperty
          : e.keyword === 'additionalProperties'
            ? '/' + e.params.additionalProperty
            : '') || '/',
    message:
      e.keyword === 'additionalProperties' &&
      e.params.additionalProperty === 'uri' &&
      /^\/ontology\/\d+(\/relationships\/\d+)?$/.test(e.instancePath)
        ? '"uri" is not an Ossie 0.2.0.dev0 field. Global identifiers use "iri" (full IRI or prefix:local QName); rename uri to iri.'
        : (e.message ?? 'Mapping schema violation.'),
  }));
}
