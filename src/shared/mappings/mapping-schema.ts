/** Validates standalone and embedded mappings against the pinned mapping schema. */
import { standalone, embedded, ontology as versionedOntology } from '../../generated/validators.js';
import { schemaErrorPath, type Issue } from '../validation/diagnostics';
/** Checks whether parsed data has a supported concept-mapping shape. */
export function isMapping(data: any) {
  return data && ['concept_mappings', 'ontology_ref', 'semantic_model_ref'].some(key => data[key] !== undefined);
}
/** Validates mappings and attaches findings to their document paths. */
export function mappingSchemaIssues(data: any, mode: 'standalone' | 'embedded' | 'ontology' = 'standalone', prefix = ''): Issue[] {
  let validate: typeof standalone;
  if (mode === 'standalone') {
    validate = standalone;
  } else if (mode === 'embedded') {
    validate = embedded;
  } else {
    validate = versionedOntology;
  }
  if (validate(data)) return [];
  return (validate.errors ?? []).map(error => ({
    severity: 'error',
    code: 'schema',
    path: prefix + schemaErrorPath(error) || '/',
    message:
      error.keyword === 'additionalProperties' && error.params.additionalProperty === 'uri' && /^\/ontology\/\d+(\/relationships\/\d+)?$/.test(error.instancePath)
        ? '"uri" is not an Ossie 0.2.0.dev0 field. Global identifiers use "iri" (full IRI or prefix:local QName); rename uri to iri.'
        : (error.message ?? 'Mapping schema violation.'),
  }));
}
