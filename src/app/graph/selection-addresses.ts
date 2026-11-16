/** Translates renderer keys at the boundary of address-based selection and navigation state. */
import { isStructuredEntity, type Entity } from '../../shared/core/model';
import { absoluteItemAddress, type AddressDocument } from '../../shared/core/model-addresses';
import { formatAddress, parseAddress } from '../../shared/core/item-address';
import type { Walk } from './walk';

/** Supplies the current definition items and their file location to graph navigation. */
export type SelectionDocument = AddressDocument & { entities: Entity[] };

/** Uses a structured locator, keeping unaddressable RDF and built-in keys explicit. */
export function selectionAddress(document: SelectionDocument, id: string): string {
  const entity = document.entities.find(entity => entity.id === id);
  if (!entity || !isStructuredEntity(entity)) return id;
  return formatAddress(absoluteItemAddress(entity.address, document));
}

/** Finds the renderer key for one unambiguous structured locator or an unaddressable item. */
export function selectionId(document: SelectionDocument, key: string): string {
  if (!key.startsWith('sw1:')) return key;
  const parsed = parseAddress(key);
  if (!parsed.ok || parsed.address.project !== document.project || JSON.stringify(parsed.address.document) !== JSON.stringify(document.document)) return '';
  const chain = JSON.stringify(parsed.address.chain);
  const matches = document.entities.filter(entity => isStructuredEntity(entity) && JSON.stringify(entity.address.chain) === chain);
  return matches.length === 1 ? matches[0].id : '';
}

/** Translates only navigation centers; document keys and expansion-set keys retain their roles. */
export function translateWalk(walk: Walk, documentOf: (id: string) => SelectionDocument | null, direction: 'address' | 'renderer', previous?: Walk): Walk {
  return {
    ...walk,
    steps: walk.steps.map((step, index) => {
      const document = documentOf(step.doc);
      if (!document) return step;
      const center = direction === 'address' ? selectionAddress(document, step.center) : selectionId(document, step.center);
      const next = center === step.center ? step : { ...step, center };
      const prior = previous?.steps[index];
      return prior && JSON.stringify(prior) === JSON.stringify(next) ? prior : next;
    }),
  };
}
