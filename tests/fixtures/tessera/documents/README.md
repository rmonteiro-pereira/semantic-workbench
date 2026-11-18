# Tessera fixture documents

Each file is one document for the format tests. The table gives the findings a validator must
report for it, with the pointer of each. A file marked "valid" has no error. "No Tessera finding"
means no code that starts with `tessera-` appears.

| File | Expected findings |
| --- | --- |
| `valid.yaml`, `valid.json` | valid |
| `notes-everywhere.yaml` | valid (`tessera_notes` on the root, two concepts and one relationship) |
| `marker-string.yaml` | `tessera-marker` at `/tessera` |
| `marker-zero.yaml` | `tessera-marker` at `/tessera` |
| `marker-fraction.yaml` | `tessera-marker` at `/tessera` |
| `revision-4.yaml` | `tessera-revision` at `/tessera` |
| `no-version.yaml` | `tessera-base` at `/version` |
| `other-version.yaml` | `tessera-base` at `/version` |
| `unknown-property.yaml` | `tessera-property` at `/ontology/0/tessera_note` |
| `misplaced-imports.yaml` | `tessera-location` at `/ontology/0/tessera_imports` |
| `notes-on-dataset.yaml` | `tessera-kind` at `/tessera` and `tessera-location` at `/datasets/0/tessera_notes` |
| `notes-in-embedded-model.yaml` | `tessera-location` at `/ontology_mappings/0/semantic_model/datasets/0/tessera_notes` |
| `notes-empty.yaml` | `schema` at `/ontology/0/tessera_notes` |
| `notes-too-long.yaml` | `schema` at `/ontology/0/tessera_notes` |
| `semantic-model-marked.yaml` | `tessera-kind` at `/tessera` |
| `mapping-marked.yaml` | `tessera-kind` at `/tessera` |
| `odcs-marked.yaml` | `tessera-kind` at `/tessera` |
| `nested-marker-key.yaml` | valid; the `tessera` key inside a vendor extension payload is ordinary data |
| `lookalike-unmarked.yaml` | `schema` at `/ontology/0/tessera_notes` from the pinned schema only; no Tessera finding |
