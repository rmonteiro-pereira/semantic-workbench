/** Combines an ontology without changing its source documents or their item addresses. */
import { formatAddress } from '../core/item-address';
import { addressesOfModel } from '../core/model-addresses';
import type { OntologyUnit } from './unit-structure';

/** Locates an item in its original file and at its original document path. */
export type UnitItemSource = { file: string; path: (string | number)[] };

/** Gives the combined ontology and the source file for each document-relative item address. */
export type CombinedUnit = {
  ontology: Record<string, unknown> & { ontology: unknown[] };
  itemFiles: ReadonlyMap<string, string>;
  itemSources: ReadonlyMap<string, UnitItemSource>;
};

/** Appends only declared parts in include order and indexes the original source of each item. */
export function combineUnit(unit: OntologyUnit): CombinedUnit {
  const root = unit.root.data as Record<string, unknown>;
  const concepts: unknown[] = [];
  const conceptSources: { file: string; index: number }[] = [];
  for (const file of [unit.root, ...unit.parts]) {
    const data = file.data as { ontology: unknown[] };
    data.ontology.forEach((concept, index) => {
      concepts.push(concept);
      conceptSources.push({ file: file.path, index });
    });
  }
  const ontology = { ...root, ontology: concepts };
  const itemFiles = new Map<string, string>();
  const itemSources = new Map<string, UnitItemSource>();
  for (const { address, path, ambiguous } of addressesOfModel(ontology)) {
    // An ambiguous item must never be sent to an arbitrary source file for editing.
    if (ambiguous) continue;
    const concept = path[0] === 'ontology' && typeof path[1] === 'number' ? conceptSources[path[1]] : undefined;
    const source = concept ? { file: concept.file, path: ['ontology', concept.index, ...path.slice(2)] } : { file: unit.root.path, path };
    itemFiles.set(formatAddress(address), source.file);
    itemSources.set(path.join('/'), source);
  }
  return { ontology, itemFiles, itemSources };
}
