/** Groups model entities into overview areas using declared or inferred structure. */
import type { Entity, Relationship } from '../../shared/core/model';
import { conceptMappingLinks, isInheritance, suggestCommunities } from './communities';
import { GROUP_PALETTE, TYPE_GROUP_COLOR, UNASSIGNED_GROUP_COLOR, paletteColorFor } from '../theme/theme-palette';

/** Selects the source of model group boundaries. */
export type GroupingMode = 'auto' | 'declared' | 'namespaces' | 'suggested' | 'types' | 'example';
/** A grouping mode other than Auto. */
export type ConcreteGroupingMode = Exclude<GroupingMode, 'auto'>;
/** Controls grouping mode and namespace depth. */
export type GroupingOptions = {
  mode?: GroupingMode;
  assignments?: Record<string, string>;
  names?: Record<string, string>;
};
/** Whether a mode is offered for a document, how many groups it yields, and why it is disabled. */
export type GroupingModeState = { offered: boolean; groups: number; reason?: string };

/** The order in which Auto tries the modes; it takes the first that yields two or more groups. */
export const GROUPING_ORDER: ConcreteGroupingMode[] = ['declared', 'example', 'namespaces', 'suggested', 'types'];

// The curated UBL areas are offered only when nearly every entity carries a UBL name. A few
// shared names such as Order or Address must not turn another model into a UBL layout.
const EXAMPLE_AREA_SHARE = 0.8;

const areas = [
  {
    id: 'documents',
    name: 'Business documents',
    description: 'Procurement, invoicing and evidence',
    color: GROUP_PALETTE[0],
    names: ['Order', 'Invoice', 'DespatchAdvice', 'ReceiptAdvice', 'CreditNote', 'OrderReference', 'BillingReference', 'DocumentReference', 'Contract'],
  },
  {
    id: 'parties',
    name: 'Trading parties',
    description: 'Buyers, suppliers and people',
    color: GROUP_PALETTE[1],
    names: ['Party', 'CustomerParty', 'SupplierParty', 'Person', 'Contact'],
  },
  {
    id: 'lines',
    name: 'Document lines',
    description: 'Line-level commitments and quantities',
    color: GROUP_PALETTE[2],
    names: ['OrderLine', 'LineItem', 'InvoiceLine', 'CreditNoteLine', 'ReceiptLine', 'DespatchLine'],
  },
  {
    id: 'products',
    name: 'Products & pricing',
    description: 'What is traded and how it is priced',
    color: GROUP_PALETTE[3],
    names: ['Item', 'CommodityClassification', 'Price', 'AllowanceCharge'],
  },
  {
    id: 'fulfillment',
    name: 'Fulfillment & transport',
    description: 'Delivery, cargo and movement',
    color: GROUP_PALETTE[4],
    names: ['Delivery', 'Shipment', 'Consignment', 'TransportHandlingUnit', 'TransportEquipment', 'GoodsItem', 'TransportationService', 'TransportMeans'],
  },
  {
    id: 'tax',
    name: 'Tax & totals',
    description: 'Tax calculation and monetary totals',
    color: GROUP_PALETTE[5],
    names: ['TaxTotal', 'TaxSubtotal', 'TaxCategory', 'TaxScheme', 'MonetaryTotal'],
  },
  {
    id: 'payment',
    name: 'Payment & finance',
    description: 'Settlement, terms and banking',
    color: GROUP_PALETTE[6],
    names: ['PaymentMeans', 'PaymentTerms', 'FinancialAccount', 'FinancialInstitution', 'Branch'],
  },
  {
    id: 'places',
    name: 'Places',
    description: 'Addresses and geographical context',
    color: GROUP_PALETTE[7],
    names: ['Address', 'Location', 'Country'],
  },
];
const normalize = (name: string) => name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const byName = new Map(areas.flatMap(area => area.names.map(name => [normalize(name), area] as const)));

type Group = {
  id: string;
  name: string;
  description: string;
  color: string;
  provenance: string;
};
type Counts = { declared: number; suggested: number; corrected: number; unassigned: number };

const BUILTINS: Group = {
  id: 'builtins',
  name: 'Built-in concepts',
  description: 'Standard primitive concepts',
  color: UNASSIGNED_GROUP_COLOR,
  provenance: 'Definition type',
};

const typeGroup = (entity: Entity): Group => ({
  id: entity.kind,
  name: entity.kind,
  description: 'Grouped by definition type',
  color: TYPE_GROUP_COLOR,
  provenance: 'Definition type',
});

const exampleArea = (entity: Entity) => {
  let key = normalize(entity.name.split('__')[0]);
  if (key === 'purchaseorder') key = 'order';
  return byName.get(key);
};

const textValues = (values: unknown[]) => values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map(v => v.trim());

// An entity's own domains come first; a contract-level domain copied onto every object is last,
// so it only decides the group of objects that declare nothing themselves.
const ownDomains = (entity: Entity) => textValues([entity.definition?.domain, ...(Array.isArray(entity.definition?.domains) ? entity.definition.domains : [])]);
const declaredDomains = (entity: Entity) => [...new Set([...ownDomains(entity), ...textValues(entity.declaredDomains ?? [])])];

// Everything the per-entity grouping needs that is computed once per document.
type GroupingContext = {
  suggested: ReturnType<typeof suggestCommunities>;
  byId: Map<string, Entity>;
  valueOwners: Map<string, Set<string>>;
};

// A value type belongs to the community of the business entities that use it, when they agree.
function valueOwnersOf(links: Relationship[], context: Omit<GroupingContext, 'valueOwners'>) {
  const owners = new Map<string, Set<string>>();
  for (const edge of links) {
    if (isInheritance(edge)) continue;
    for (const [value, business] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      if (context.byId.get(value)?.kind !== 'ValueType') continue;
      const anchor = context.suggested.membership.get(business);
      if (!anchor) continue;
      const set = owners.get(value) ?? new Set<string>();
      set.add(anchor);
      owners.set(value, set);
    }
  }
  return owners;
}

function declaredGroup(entity: Entity, counts: Counts): Group {
  const domains = declaredDomains(entity);
  if (!domains.length) {
    counts.unassigned++;
    return {
      id: 'unassigned',
      name: 'Unassigned',
      description: 'No domain declared in this entity definition',
      color: UNASSIGNED_GROUP_COLOR,
      provenance: 'No declaration',
    };
  }
  counts.declared++;
  return {
    id: 'domain:' + domains[0],
    name: domains[0],
    description: domains.length > 1 ? 'Primary declared domain; additional affiliations retained' : 'Declared in this entity definition',
    color: paletteColorFor('domain:' + domains[0]),
    provenance: 'Declared domain',
  };
}

function namespaceGroup(entity: Entity, counts: Counts): Group {
  const ns = entity.namespace;
  if (ns) {
    const id = 'namespace:' + ns.iri;
    return {
      id,
      name: ns.prefix !== undefined ? (ns.prefix || '(default)') + ':' : ns.iri,
      description: ns.iri,
      color: paletteColorFor(id),
      provenance: ns.prefix !== undefined ? 'Declared prefix' : 'IRI namespace',
    };
  }
  if (entity.kind === 'Built-in concept') return BUILTINS;
  counts.unassigned++;
  return {
    id: 'no-namespace',
    name: 'No IRI',
    description: 'No global identifier declared on this definition',
    color: UNASSIGNED_GROUP_COLOR,
    provenance: 'No declaration',
  };
}

function communityGroup(entity: Entity, context: GroupingContext, counts: Counts): Group {
  let anchor = context.suggested.membership.get(entity.id);
  if (!anchor && entity.kind === 'ValueType') {
    const users = context.valueOwners.get(entity.id) ?? new Set<string>();
    if (users.size === 1) anchor = [...users][0];
    else
      return {
        id: users.size ? 'shared-values' : 'unassigned-values',
        name: users.size ? 'Shared values' : 'Unassigned values',
        description: users.size ? 'Value types used by multiple suggested communities' : 'No business owner can be inferred',
        color: UNASSIGNED_GROUP_COLOR,
        provenance: 'Structural suggestion',
      };
  }
  if (anchor) {
    counts.suggested++;
    return {
      id: 'community:' + anchor,
      name: context.byId.get(anchor)?.name ?? anchor,
      description: 'Suggested from business relationships; named after an anchor entity',
      color: paletteColorFor('community:' + anchor),
      provenance: 'Structural suggestion',
    };
  }
  if (entity.kind === 'Built-in concept') return BUILTINS;
  return typeGroup(entity);
}

function groupFor(mode: ConcreteGroupingMode, entity: Entity, context: GroupingContext, counts: Counts): Group {
  if (mode === 'example') {
    const area = exampleArea(entity);
    return area ? { ...area, provenance: 'Curated UBL example' } : typeGroup(entity);
  }
  if (mode === 'declared') return declaredGroup(entity, counts);
  if (mode === 'namespaces') return namespaceGroup(entity, counts);
  if (mode === 'suggested') return communityGroup(entity, context, counts);
  return typeGroup(entity);
}

const own = (record: Record<string, string> | undefined, key: string) => (record && Object.hasOwn(record, key) ? record[key] : undefined);

// Places every entity in its group for one mode, then applies the user's corrections.
function assignGroups(mode: ConcreteGroupingMode, visible: Entity[], context: GroupingContext, grouping: GroupingOptions = {}) {
  const groups = new Map<string, Group & { entities: Entity[] }>();
  const memberships = new Map<string, string[]>();
  const counts: Counts = { declared: 0, suggested: 0, corrected: 0, unassigned: 0 };
  for (const entity of visible) {
    let group = groupFor(mode, entity, context, counts);
    if (mode === 'declared')
      memberships.set(
        entity.id,
        declaredDomains(entity).map(d => 'domain:' + d),
      );
    const correction = own(grouping.assignments, entity.id);
    if (correction) {
      counts.corrected++;
      group = {
        id: correction,
        name: own(grouping.names, correction) ?? groups.get(correction)?.name ?? correction,
        description: 'Workspace grouping correction',
        color: groups.get(correction)?.color ?? areas.find(a => a.id === correction)?.color ?? paletteColorFor(correction),
        provenance: 'User correction',
      };
    }
    const renamed = own(grouping.names, group.id);
    if (renamed) group = { ...group, name: renamed };
    if (!memberships.has(entity.id)) memberships.set(entity.id, [group.id]);
    if (!groups.has(group.id)) groups.set(group.id, { ...group, entities: [] });
    groups.get(group.id)!.entities.push(entity);
  }
  return { groups, memberships, counts };
}

// Why a mode that yields fewer than two groups has nothing to offer for this document.
function disabledReason(mode: ConcreteGroupingMode, visible: Entity[], context: GroupingContext): string {
  if (mode === 'declared') {
    if (!visible.some(e => declaredDomains(e).length)) return 'No domains declared';
    if (!visible.some(e => ownDomains(e).length)) return 'Only the contract-level domain is declared';
    return 'Every entity declares the same domain';
  }
  if (mode === 'namespaces') return visible.some(e => e.namespace) ? 'Every IRI is in one namespace' : 'No IRIs declared';
  if (mode === 'suggested') return context.suggested.backboneEdges ? 'The relationships form a single community' : 'No relationships to group by';
  if (mode === 'example') return 'Fewer than two example areas match';
  return 'Every entity has the same type';
}

// How many real groups a mode finds: distinct domains, namespaces, communities, areas or types.
// Catch-all groups such as Unassigned or No IRI do not count, so a mode that sorts everything
// into one real group plus a catch-all is still disabled.
function basisCount(mode: ConcreteGroupingMode, visible: Entity[], context: GroupingContext) {
  const distinct = (values: (string | undefined)[]) => new Set(values.filter((v): v is string => v !== undefined)).size;
  if (mode === 'declared') return distinct(visible.map(e => declaredDomains(e)[0]));
  if (mode === 'namespaces') return distinct(visible.map(e => e.namespace?.iri));
  if (mode === 'example') return distinct(visible.map(e => exampleArea(e)?.id));
  if (mode === 'suggested') return context.suggested.backboneEdges ? distinct([...context.suggested.membership.values()]) : 0;
  return distinct(visible.map(e => e.kind));
}

/** Reports, for each concrete mode, whether it is offered, its group count and any reason it is
 * disabled. Corrections are left out: they are the user's edits, not the mode's basis. */
export function groupingModes(visible: Entity[], context: GroupingContext) {
  const matched = visible.filter(e => exampleArea(e)).length;
  const exampleOffered = visible.length > 0 && matched / visible.length >= EXAMPLE_AREA_SHARE;
  const states = {} as Record<ConcreteGroupingMode, GroupingModeState>;
  for (const mode of GROUPING_ORDER) {
    const offered = mode !== 'example' || exampleOffered;
    const groups = offered ? assignGroups(mode, visible, context).groups.size : 0;
    const usable = offered && basisCount(mode, visible, context) >= 2;
    states[mode] = usable ? { offered, groups } : { offered, groups, reason: disabledReason(mode, visible, context) };
  }
  return states;
}

const enabled = (state: GroupingModeState) => state.offered && !state.reason;

/** Groups entities and relationships into overview areas. */
export function modelOverview(entities: Entity[], edges: Relationship[], _name: string, technical = false, grouping: GroupingOptions = {}) {
  const hasClasses = entities.some(e => e.kind === 'OWL class');
  const visible = hasClasses && !technical ? entities.filter(e => e.kind === 'OWL class') : entities;
  const ids = new Set(visible.map(e => e.id));
  const links = edges.filter(e => ids.has(e.source) && ids.has(e.target));
  const suggested = suggestCommunities(visible, [...links, ...conceptMappingLinks(visible)]);
  const byId = new Map(visible.map(e => [e.id, e]));
  const context: GroupingContext = {
    suggested,
    byId,
    valueOwners: valueOwnersOf(links, { suggested, byId }),
  };
  const modes = groupingModes(visible, context);
  const autoMode = GROUPING_ORDER.find(m => enabled(modes[m])) ?? 'types';
  const requested = grouping.mode ?? 'auto';
  // A stored choice of a mode this document cannot use falls back to Auto.
  const mode: ConcreteGroupingMode = requested !== 'auto' && enabled(modes[requested]) ? requested : autoMode;
  const { groups, memberships, counts } = assignGroups(mode, visible, context, grouping);
  const order = areas.map(a => a.id);
  const ordered = [...groups.values()].sort((first, second) => {
    const ai = order.indexOf(first.id);
    const bi = order.indexOf(second.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || first.name.localeCompare(second.name);
  });
  const groupOf = new Map(ordered.flatMap(g => g.entities.map(e => [e.id, g.id] as const)));
  const degree = new Map(visible.map(e => [e.id, 0]));
  const matrix = new Map<string, Relationship[]>();
  for (const edge of links) {
    degree.set(edge.source, degree.get(edge.source)! + 1);
    if (edge.target !== edge.source) degree.set(edge.target, degree.get(edge.target)! + 1);
    const key = JSON.stringify([groupOf.get(edge.source), groupOf.get(edge.target)]);
    const group = matrix.get(key) ?? [];
    group.push(edge);
    matrix.set(key, group);
  }
  return {
    mode,
    autoMode,
    modes,
    groupingLabel: GROUPING_LABELS[mode],
    explanation: EXPLANATIONS[mode],
    provenance: {
      kind: mode,
      counts,
      algorithm: mode === 'suggested' ? 'Louvain modularity' : undefined,
    },
    memberships,
    groups: ordered,
    entities: visible,
    links,
    matrix,
    degree,
    groupOf,
    technicalCount: entities.length - visible.length,
  };
}

/** Names each concrete grouping mode as the overview headings show it. */
export const GROUPING_LABELS: Record<ConcreteGroupingMode, string> = {
  example: 'Curated example areas',
  declared: 'Declared domains',
  namespaces: 'IRI namespaces',
  suggested: 'Suggested communities',
  types: 'Definition types',
};

const EXPLANATIONS: Record<ConcreteGroupingMode, string> = {
  example: 'Curated UBL example display areas; these are not source-declared domains.',
  declared: 'Uses only domain/domains declarations. Multiple affiliations are retained; the first determines placement.',
  suggested:
    'Deterministic suggestions from undirected business relationships (foreign keys, joins, metric references and mapped links), excluding inheritance and primitive hubs. Review and correct these groups.',
  types: 'Groups by definition type without inferring business domains.',
  namespaces: 'Groups by the namespace of each definition IRI, using the declared prefix with the longest matching namespace. Definitions without an IRI are listed separately.',
};
