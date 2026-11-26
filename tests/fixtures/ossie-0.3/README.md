# Ossie 0.3.0 draft fixtures

Small documents that declare `version: 0.3.0.dev0` and use the forms the draft base adds:

- `sales.semantic.yaml`: `sql` expressions, a dataset-scoped metric, `AGG(dataset.metric)` in a
  model metric, a vendor dialect, and `nonportable_extensions` whose `data` is an object (one
  `SEMANTIC_WORKBENCH` entry and one other vendor);
- `sales.ontology.yaml`: `annotations` on the ontology and on a concept;
- `sales.mapping.yaml`: a mapping with `nonportable_extensions`.

Each one is valid. Tests change one thing at a time to get each finding.
