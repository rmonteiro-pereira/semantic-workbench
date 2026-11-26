# Synthetic next Ossie base

These files stand for an Ossie base later than every shipped one. They are synthetic and exist only
for tests. The shipped 0.3.0.dev0 draft base is real and lives in `schemas/`.

- `synthetic-ontology.json` is a copy of `schemas/ossie-ontology-0.2.0.dev0.json` with the version
  constant `0.4.0.dev0`, another `$id` and another title. It stands for a later base that does not
  collide with the Tessera prefix.
- `colliding-ontology.json` is the same copy with one extra `tessera_flag` property on
  `OntologyComponent`. It stands for a base that defines a name the Tessera prefix keeps.
