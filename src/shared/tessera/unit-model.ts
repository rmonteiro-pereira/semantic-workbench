/** Combines an ontology without changing its source documents or their item addresses. */
import { formatAddress } from '../core/item-address';
import { addressesOfModel } from '../core/model-addresses';
import type { OntologyUnit } from './unit-structure';

/** Gives the combined ontology and the source file for each document-relative item address. */
export type CombinedUnit = {
  ontology: Record<string, unknown> & { ontology: unknown[] };
  itemFiles: ReadonlyMap<string, string>;
};

/** Appends only declared parts in include order and indexes the original source of each item. */
export function combineUnit(unit: OntologyUnit): CombinedUnit {
  const root = unit.root.data as Record<string, unknown>;
  const concepts: unknown[] = [];
  const conceptFiles: string[] = [];
  for (const file of [unit.root, ...unit.parts]) {
    const data = file.data as { ontology: unknown[] };
    for (const concept of data.ontology) {
      concepts.push(concept);
      conceptFiles.push(file.path);
    }
  }
  const ontology = { ...root, ontology: concepts };
  const itemFiles = new Map<string, string>();
  for (const { address, path, ambiguous } of addressesOfModel(ontology)) {
    // An ambiguous item must never be sent to an arbitrary source file for editing.
    if (ambiguous) continue;
    const source = path[0] === 'ontology' && typeof path[1] === 'number' ? conceptFiles[path[1]] : unit.root.path;
    itemFiles.set(formatAddress(address), source);
  }
  return { ontology, itemFiles };
}
