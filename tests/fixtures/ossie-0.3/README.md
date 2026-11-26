# Ossie 0.3.0 draft fixtures

Small documents that declare `version: 0.3.0.dev0` and use the forms the draft base adds:

- `sales.semantic.yaml`: `sql` expressions, a dataset-scoped metric, `AGG(dataset.metric)` in a
  model metric, a vendor dialect, and `nonportable_extensions` whose `data` is an object (one
  `SEMANTIC_WORKBENCH` entry and one other vendor);
- `sales.ontology.yaml`: `annotations` on the ontology and on a concept;
- `sales.mapping.yaml`: a mapping with `nonportable_extensions`.

Each one is valid. Tests change one thing at a time to get each finding.

`references-0.2-baseline.json` holds the rename and delete reference lists for four targets in the
0.2 commerce example (a metric with bindings, a dataset, a field and a concept), recorded with the
reference finder as it was before the draft base. `tests/references-0.3.test.ts` checks that the
current finder still gives exactly these lists.

`retail.tessera.yaml` is a Tessera revision 1 ontology on the 0.3.0 draft base, with notes to drop
and `annotations` to keep. `compile-golden/` holds what compiling it with the three sales files
releases. Run the compile test with `UPDATE_GOLDEN=1` to record it again.
