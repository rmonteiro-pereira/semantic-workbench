/** Maps the original address of each merged or imported item to its emitted item. */
import { formatAddress, type Address, type ItemSegment } from '../core/item-address';
import { addressesOfModel } from '../core/model-addresses';
import { compareText } from './canonical-json';
import type { PublicConceptOrigin } from './public-concepts';
import { combineUnit } from './unit-model';
import type { OntologyUnit } from './unit-structure';

/** Pairs a source item address with its compiled address. */
export type CompiledAddress = { from: string; to: string };

function at(project: string | undefined, path: string, chain: ItemSegment[]): string {
  const address: Address = project ? { grammar: 1, form: 'absolute', project, document: path.split('/'), chain } : { grammar: 1, form: 'project-relative', document: path.split('/'), chain };
  return formatAddress(address);
}

function originalImported(origin: PublicConceptOrigin, chain: ItemSegment[]) {
  const root = chain[0];
  const sourceChain: ItemSegment[] = [origin.ontologyName ? { kind: 'ontology', name: origin.ontologyName } : root, { kind: 'concept', name: origin.concept }, ...chain.slice(2)];
  const relative = formatAddress({ grammar: 1, form: 'document-relative', chain: sourceChain });
  return at(origin.project, origin.sourceItems?.get(relative) ?? origin.ontology, sourceChain);
}

/** Uses the emitted addresses and the source file ownership of each item to build the map. */
export function meshAddressMap(unit: OntologyUnit, compiled: unknown, project: string | undefined, origins: ReadonlyMap<string, PublicConceptOrigin>): CompiledAddress[] {
  const source = combineUnit(unit);
  return addressesOfModel(compiled)
    .map(item => {
      const chain = item.address.chain;
      const concept = chain[1];
      const imported = concept && concept.kind === 'concept' && 'name' in concept ? origins.get(concept.name) : undefined;
      const sourceFile = source.itemSources.get(item.path.join('/'))?.file ?? unit.root.path;
      return { from: imported ? originalImported(imported, chain) : at(project, sourceFile, chain), to: at(project, unit.root.path, chain) };
    })
    .sort((first, second) => compareText(first.from, second.from) || compareText(first.to, second.to));
}
