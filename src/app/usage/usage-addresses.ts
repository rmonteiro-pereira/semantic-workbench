/** Turns the addresses a graph or list holds, relative to their file, into the absolute ones counts are stored under. */
import { formatAddress, parseAddress, type Address } from '../../shared/core/item-address';
import { absoluteItemAddress, type AddressDocument } from '../../shared/core/model-addresses';
import { isStructuredEntity, type Entity, type Relationship } from '../../shared/core/model';
import type { KpiSummary } from '../../server/agent/explain';

/** The absolute address text of a stored relative or absolute address, or undefined when it cannot be formed. */
export function absoluteTrafficAddress(address: string | undefined, document: AddressDocument | null): string | undefined {
  if (!address) return undefined;
  const parsed = parseAddress(address);
  if (!parsed.ok) return undefined;
  if (parsed.address.form === 'absolute') return address;
  if (!document) return undefined;
  try {
    return formatAddress(absoluteItemAddress(parsed.address, document));
  } catch {
    return undefined;
  }
}

/** The address of an entity, relative to its file, or undefined for one without a stable address (built-in, RDF). */
export function entityAddressText(entity: Entity | undefined): string | undefined {
  return entity && isStructuredEntity(entity) ? formatAddress(entity.address) : undefined;
}

// Only these links stand for one declared item; an inheritance line or a metric reference shares the address of its source.
const COUNTED_LINK_KINDS = new Set(['Ontology relationship']);

/** The address of the relationship a line stands for, or undefined when the line is not a declared relationship. */
export function relationshipAddressText(relationship: Relationship | undefined): string | undefined {
  const address = (relationship as { address?: Address } | undefined)?.address;
  if (!relationship || !address || !COUNTED_LINK_KINDS.has(relationship.data.kind)) return undefined;
  return formatAddress(address);
}

/** The address of a named child of an entity, such as a field of a dataset. */
export function childAddressText(entity: Entity, kind: 'field', name: string): string | undefined {
  if (!isStructuredEntity(entity)) return undefined;
  return formatAddress({ ...entity.address, chain: [...entity.address.chain, { kind, name }] });
}

/** The absolute address of a project metric, or undefined for a layout that has no stable one. */
export function metricAddressText(project: string, metric: Pick<KpiSummary, 'file' | 'modelPath' | 'model' | 'name' | 'layout'>): string | undefined {
  if (metric.layout !== 'split') return undefined;
  const [first] = metric.modelPath;
  if (metric.modelPath.length && first !== 'semantic_model') return undefined;
  const address: Address = {
    grammar: 1,
    form: 'absolute',
    project,
    document: metric.file.split('/'),
    chain: [
      { kind: 'model', name: metric.model },
      { kind: 'metric', name: metric.name },
    ],
  };
  try {
    return formatAddress(address);
  } catch {
    return undefined;
  }
}
