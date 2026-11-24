# Ontology read boundaries

Keep parsing and cached document findings per file. Compose complete ontology reads per unit only
where the caller needs cross-file references or a whole graph. Composition must retain each item's
source file and never insert reader-specific findings into the shared parse cache.

## Direct inspection and structured validation

| Caller | Scope | Contract |
| --- | --- | --- |
| `src/shared/core/model.ts` — `inspect` | per file | Preserve the public single-document parser and source paths. |
| `src/shared/validation/input.ts` — `validateInput` | per file | Shared browser, scan and save entry; envelope and document findings. |
| `src/shared/validation/validation.ts` — nested `validateStructured` | per file | Embedded semantic models belong to the current document. |
| `src/server/agent/context-documents.ts` — `parseDocuments` | per unit | Combine authorized published roots and parts before target selection; exclude parts as independent targets. |
| `src/server/agent/explain.ts` — ODCS discovery | per file | Discovers contract schemas; ontology context comes through the unit-aware catalog. |
| `src/server/projects/workspace.ts` — grouping entities | per unit | Root grouping must see concepts in parts while retaining source locators. |
| `src/server/projects/address-resolution.ts` — `currentResolution` | per file | Resolve a locator in its named file; a part also needs the root's ontology scope. |
| `src/server/projects/address-key-conversion.ts` — historical conversion | per file | Convert existing persisted keys against the exact original document. |

## Shared validation consumers

| Caller | Scope | Contract |
| --- | --- | --- |
| `src/server/projects/scanner.ts` — `indexBytes`, `indexedOnce` | per file | Cache parsed entities and document findings only. Unit and reader findings must remain separate. |
| `src/server/projects/workspace/import-batch.ts` | per unit | Preflight all candidate files as one set before writing. |
| `src/server/projects/workspace/document-save.ts` | per unit | Require complete-set readability before examining a proposed unit change. |
| `src/server/projects/suggestions.ts` | per file | Source evidence for suggested project/grouping changes. |
| `src/shared/tessera/document-kind.ts` — `classifyFile` | per file | Classify roots, parts and manifests without resolving them. |
| `src/shared/tessera/compile-unit.ts` — `compileUnit` | per unit | Structure, merge, dependency resolution inputs, whole-output checks. |
| `src/shared/projects/new-file.ts` | per file | Creates a document template, with set validation at save. |
| `src/shared/metrics/metric-save.ts` | per file | Semantic-model edit; no ontology assembly. |
| `src/app/editor/lint.worker.ts` | per file | Unsaved source diagnostics cannot imply a complete-set check. |
| `src/app/validation/ValidationPanel.tsx` | per file | Document findings plus a separately supplied reader/set view. |
| `src/app/workspace/hooks/useValidation.tsx` | per file | Unsaved single-document validation. |
| `src/app/workspace/hooks/useImport.tsx` | per unit | Import candidate set; server remains authoritative. |
| `src/app/workspace/hooks/useItemEditing.tsx` | per unit | Resolve the whole model, patch only the owning file. |
| `src/app/edit/DeleteItem.tsx` | per unit | Find references throughout the unit before deleting. |
| `src/app/attributes/attribute-save.ts` | per unit | Attribute type lookup spans parts and imported public concepts. |
| `src/app/governance/governance-save.ts` | per file | Patch governance in its owning file; save checks the set. |
| `src/app/agent-context/AgentContextSection.tsx` | per file | Patch item context in its owning file. |
| `src/app/metrics/MetricWizard.tsx` | per file | Semantic-model metric input. |
| `src/app/odcs/PropertyEditors.tsx` | per file | Contract property edits. |

## Browser models and graph consumers

| Caller | Scope | Contract |
| --- | --- | --- |
| `src/app/workspace/parsedDocument.ts` — `parsedDoc` | per file | Existing hash cache holds document parsing only; compose outside it. |
| `src/app/workspace/hooks/useWorkbench.tsx` | per unit | Whole ontology model, graph and catalog input. |
| `src/app/workspace/hooks/useFileNavigation.tsx` | per unit | Open a part in its owning unit while retaining file selection. |
| `src/app/workspace/hooks/useReferences.tsx` | per unit | Cross-file item/reference navigation. |
| `src/app/workspace/hooks/useLineage.tsx` | per file | Contract and semantic-model lineage; resolved ontology references use the unit model. |
| `src/app/graph/FullGraph.tsx` | per unit | Receives combined entities and relationships; no file reads. |
| `src/app/graph/NeighborhoodGraph.tsx` | per unit | Traverses the same combined graph; imported entities remain read only. |
| `src/app/graph/full-node-data.ts` | per unit | Builds display data from supplied entities, preserving imported provenance. |
| `src/app/graph/FullGraphNodes.tsx` | per unit | Renders supplied cards. |
| `src/app/workspace/DetailsPanel.tsx` | per unit | Unit summary and imports; item edits retain their physical owner. |
| `src/app/workspace/CatalogView.tsx` | per unit | Same entity list as the combined graph. |
| `src/server/agent/context-assembly.ts` — `assemble` | per unit | Resolve mapping references and field evidence against composed published definitions. |

The direct-caller audit command is `rg -n '\binspect\(|\bvalidateStructured\(' src`.
The indirect-caller audit is `rg -l 'validateInput\(|parsedDoc\(' src`.
