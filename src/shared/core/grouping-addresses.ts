/** Translates stable grouping assignment keys at the renderer and durable-state boundary. */
import { isStructuredEntity, type Entity } from './model';
import { absoluteItemAddress, type AddressDocument } from './model-addresses';
import { formatAddress, parseAddress } from './item-address';

/** Contains the item-keyed part of an existing grouping preference. */
export type GroupingAssignments = { assignments?: Record<string, string> };

function stableKeys(entities: Entity[], document: AddressDocument): Map<string, string> {
  const candidates = entities.flatMap(entity => {
    if (!isStructuredEntity(entity) || entity.address.chain.some(segment => 'position' in segment)) return [];
    return [[entity.id, formatAddress(absoluteItemAddress(entity.address, document))] as const];
  });
  const counts = new Map<string, number>();
  for (const [, address] of candidates) counts.set(address, (counts.get(address) ?? 0) + 1);
  return new Map(candidates.filter(([, address]) => counts.get(address) === 1));
}

/** Converts known assignments while keeping and reporting every unconvertible key. */
export function encodeGrouping<T extends GroupingAssignments>(value: T, entities: Entity[], document: AddressDocument): { value: T; unconverted: string[] } {
  if (!value.assignments) return { value, unconverted: [] };
  const keys = stableKeys(entities, document);
  const unconverted: string[] = [];
  const assignments: Record<string, string> = {};
  const existing = new Set(Object.keys(value.assignments));
  for (const [key, group] of Object.entries(value.assignments)) {
    const target = keys.get(key);
    if (target && !existing.has(target)) assignments[target] = group;
    else {
      assignments[key] = group;
      if (!parseAddress(key).ok) unconverted.push(key);
    }
  }
  return { value: { ...value, assignments }, unconverted };
}

/** Restores renderer keys for known canonical assignments without changing durable bytes. */
export function decodeGrouping<T extends GroupingAssignments>(value: T, entities: Entity[], document: AddressDocument): T {
  if (!value.assignments) return value;
  const keys = new Map([...stableKeys(entities, document)].map(([id, address]) => [address, id]));
  return { ...value, assignments: Object.fromEntries(Object.entries(value.assignments).map(([key, group]) => [keys.get(key) ?? key, group])) };
}
