/** Validates standalone and embedded mappings against the pinned mapping schema of the declared Ossie version. */
import { standalone, embedded, ontology as versionedOntology } from '../../generated/validators.js';
import { schemaErrorPath, type Issue } from '../validation/diagnostics';
import { draftChecksLoadingIssue, draftValidators, OSSIE_DRAFT_VERSION, type DraftValidators } from '../validation/draft-validators';

type MappingMode = 'standalone' | 'embedded' | 'ontology';

const VALIDATORS_020: Record<MappingMode, typeof standalone> = { standalone, embedded, ontology: versionedOntology };

function draftValidatorFor(mode: MappingMode, loaded: DraftValidators): typeof standalone {
  if (mode === 'standalone') return loaded.standaloneDraft030;
  if (mode === 'embedded') return loaded.embeddedDraft030;
  return loaded.ontologyDraft030;
}

/** Checks whether parsed data has a supported concept-mapping shape. */
export function isMapping(data: any) {
  return data && ['concept_mappings', 'ontology_ref', 'semantic_model_ref'].some(key => data[key] !== undefined);
}

/**
 * Validates mappings and attaches findings to their document paths. Mappings stay strict: a version
 * other than the draft base is checked against the 0.2.0.dev0 schema, whose version constant refuses it.
 * An embedded mapping has no version of its own, so the caller passes the version of the ontology around it.
 */
export function mappingSchemaIssues(data: any, mode: MappingMode = 'standalone', prefix = '', version: unknown = data?.version): Issue[] {
  const draft = version === OSSIE_DRAFT_VERSION;
  const loaded = draftValidators();
  if (draft && !loaded) return [{ ...draftChecksLoadingIssue(), path: prefix + '/version' }];
  const validate = draft && loaded ? draftValidatorFor(mode, loaded) : VALIDATORS_020[mode];
  if (validate(data)) return [];
  const versionName = draft ? OSSIE_DRAFT_VERSION : '0.2.0.dev0';
  return (validate.errors ?? []).map(error => ({
    severity: 'error',
    code: 'schema',
    path: prefix + schemaErrorPath(error) || '/',
    message:
      error.keyword === 'additionalProperties' && error.params.additionalProperty === 'uri' && /^\/ontology\/\d+(\/relationships\/\d+)?$/.test(error.instancePath)
        ? `"uri" is not an Ossie ${versionName} field. Global identifiers use "iri" (full IRI or prefix:local QName); rename uri to iri.`
        : (error.message ?? 'Mapping schema violation.'),
  }));
}
