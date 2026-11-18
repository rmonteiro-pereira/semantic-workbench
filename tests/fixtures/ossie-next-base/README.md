# Synthetic next Ossie base

No upstream development schema of the next Ossie version was pinned when these files were made, so
they are synthetic and exist only for tests.

- `synthetic-ontology.json` is a copy of `schemas/ossie-ontology-0.2.0.dev0.json` with the version
  constant `0.3.0.dev0`, another `$id` and another title. It stands for a later base that does not
  collide with the Tessera prefix.
- `colliding-ontology.json` is the same copy with one extra `tessera_flag` property on
  `OntologyComponent`. It stands for a base that defines a name the Tessera prefix keeps.
