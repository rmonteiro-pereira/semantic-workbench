# Qualification and integration decisions

## Owner-qualified concept names

Use `<project>~<ontology>~<Concept>` in compiled output. The owner is the stable project identity
plus the exporting ontology document, never a consumer alias. Escape `%`, `.`, and `~` inside each
component as `%25`, `%2E`, and `%7E` before joining. The encoding is injective and preserves the
identity of separate exporting roots in the same project.

`relationshipMatches` in `src/shared/mappings/relationship-reference.ts` splits a relationship
reference on literal dots and treats two components as concept and relationship. A dotted owner
would introduce an extra path component. Encoding every component's dots keeps that existing
contract intact. The item-address grammar treats `~` as ordinary name content; locators are still
built through `formatAddress`, independently of the qualification encoding.

The alternative `<project>.<Concept>` conflicts with relationship paths and omits the exporting
root from the canonical owner. A raw separator without escaping permits collisions between
source names that themselves contain the separator.

## Specification files

The supplied folder contains spec.md, plan.md, tasks.md and three contracts. It has no separate
data-model.md, quickstart.md or checklists directory. The entities and scenarios in spec.md and the
contracts supply those details. The prerequisite script resolves this folder when
SPECIFY_FEATURE_DIRECTORY is set explicitly.
