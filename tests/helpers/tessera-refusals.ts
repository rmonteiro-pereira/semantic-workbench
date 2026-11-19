// The fixture documents of the Tessera format with the findings each must give, as "code pointer" pairs. A file with no findings is valid.
export const EXPECTED_FINDINGS: Record<string, string[]> = {
  'valid.yaml': [],
  'valid.json': [],
  'notes-everywhere.yaml': [],
  'nested-marker-key.yaml': [],
  'lookalike-unmarked.yaml': [],
  'marker-string.yaml': ['tessera-marker /tessera'],
  'marker-zero.yaml': ['tessera-marker /tessera'],
  'marker-fraction.yaml': ['tessera-marker /tessera'],
  'revision-4.yaml': ['tessera-revision /tessera'],
  'no-version.yaml': ['tessera-base /version'],
  'other-version.yaml': ['tessera-base /version'],
  'unknown-property.yaml': ['tessera-property /ontology/0/tessera_note'],
  'misplaced-imports.yaml': ['tessera-location /ontology/0/tessera_imports'],
  'notes-on-dataset.yaml': ['tessera-kind /tessera', 'tessera-location /datasets/0/tessera_notes'],
  'notes-in-embedded-model.yaml': ['tessera-location /ontology_mappings/0/semantic_model/datasets/0/tessera_notes'],
  'notes-empty.yaml': ['schema /ontology/0/tessera_notes'],
  'notes-too-long.yaml': ['schema /ontology/0/tessera_notes'],
  'semantic-model-marked.yaml': ['tessera-kind /tessera'],
  'mapping-marked.yaml': ['tessera-kind /tessera'],
  'odcs-marked.yaml': ['tessera-kind /tessera'],
};

/** The files a validator must refuse. The unmarked look-alike is refused by the pinned schema, not by a Tessera rule. */
export const REFUSED_FILES = Object.entries(EXPECTED_FINDINGS)
  .filter(([, findings]) => findings.length > 0)
  .map(([name]) => name);
