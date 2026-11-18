# Mesh fixture inventory

The fixtures describe Tessera units and their refusal classes. Paths inside a case are relative to
the importing project. A refusal envelope holds `files`, the expected `code`, and optional `links`
provided by the caller; it does not follow a filesystem link while loading test data.

## Unit fixtures

| Folder | Files | Meaning |
| --- | --- | --- |
| `units/three-parts` | `ontology.yaml`, `orders.yaml`, `returns.yaml`, `customers.json` | Root and ordered parts; references cross file boundaries. |
| `units/one-file-twin` | `ontology.yaml` | Same concepts, relationships and order in one ontology. |
| `units/empty-root` | `ontology.yaml`, `concepts.yaml` | Root has no concepts; its part supplies all of them. |

## Refusal envelopes

| File under `refusals/` | Finding |
| --- | --- |
| `duplicate-owner.json` | `tessera-duplicate-owner` |
| `self-include.json` | `tessera-include-cycle` |
| `root-in-list.json` | `tessera-include-cycle` |
| `repeated-part.json` | `tessera-include-cycle` |
| `parent-path.json` | `tessera-include-escape` |
| `absolute-path.json` | `tessera-include-escape` |
| `backslash.json` | `tessera-include-escape` |
| `control-path.json` | `tessera-include-escape` |
| `link.json` | `tessera-include-escape` |
| `missing.json` | `tessera-include-missing` |
| `not-part.json` | `tessera-include-not-part` |
| `part-header.json` | `tessera-part-shape` |
| `mixed-version.json` | `tessera-mixed-version` |
| `duplicate-concept.json` | `tessera-duplicate-concept` |
| `orphan-part.json` | `tessera-orphan-part` (warning) |
| `open-export.json` | `tessera-export-open` |
| `unknown-export.json` | `tessera-export-unknown` |
| `alias-twice.json` | `tessera-import-alias` |
| `provider-twice.json` | `tessera-import-alias` |
| `empty-allow.json` | `tessera-import-allow` |
| `repeated-allow.json` | `tessera-import-allow` |
| `unexported.json` | `tessera-import-unexported` |
| `unlisted-use.json` | `tessera-import-use` |
| `bad-pin.json` | `tessera-import-pin` |
| `part-bound.json` | `tessera-import-bound` |
| `import-bound.json` | `tessera-import-bound` |

## Workspace fixtures

The planned temporary workspace helper owns repository placement, publication and cleanup. Access
fixtures will declare a project without a domain, a restricted part and the readers. Providers, dependency manifests and golden bundles will be
indexed here when their executable proofs are added.
