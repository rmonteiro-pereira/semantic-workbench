import type { Entity, Relationship } from './model';
import { isBusinessEntity, isInheritance, suggestCommunities } from './communities';
export type GroupingMode = 'auto' | 'declared' | 'namespaces' | 'suggested' | 'types' | 'example';
export type GroupingOptions = {
  mode?: GroupingMode;
  assignments?: Record<string, string>;
  names?: Record<string, string>;
};
const areas = [
  {
    id: 'documents',
    name: 'Business documents',
    description: 'Procurement, invoicing and evidence',
    color: '#417fa8',
    names: [
      'Order',
      'Invoice',
      'DespatchAdvice',
      'ReceiptAdvice',
      'CreditNote',
      'OrderReference',
      'BillingReference',
      'DocumentReference',
      'Contract',
    ],
  },
  {
    id: 'parties',
    name: 'Trading parties',
    description: 'Buyers, suppliers and people',
    color: '#9165ad',
    names: ['Party', 'CustomerParty', 'SupplierParty', 'Person', 'Contact'],
  },
  {
    id: 'lines',
    name: 'Document lines',
    description: 'Line-level commitments and quantities',
    color: '#478a87',
    names: [
      'OrderLine',
      'LineItem',
      'InvoiceLine',
      'CreditNoteLine',
      'ReceiptLine',
      'DespatchLine',
    ],
  },
  {
    id: 'products',
    name: 'Products & pricing',
    description: 'What is traded and how it is priced',
    color: '#b28546',
    names: ['Item', 'CommodityClassification', 'Price', 'AllowanceCharge'],
  },
  {
    id: 'fulfillment',
    name: 'Fulfillment & transport',
    description: 'Delivery, cargo and movement',
    color: '#568866',
    names: [
      'Delivery',
      'Shipment',
      'Consignment',
      'TransportHandlingUnit',
      'TransportEquipment',
      'GoodsItem',
      'TransportationService',
      'TransportMeans',
    ],
  },
  {
    id: 'tax',
    name: 'Tax & totals',
    description: 'Tax calculation and monetary totals',
    color: '#ab6d64',
    names: ['TaxTotal', 'TaxSubtotal', 'TaxCategory', 'TaxScheme', 'MonetaryTotal'],
  },
  {
    id: 'payment',
    name: 'Payment & finance',
    description: 'Settlement, terms and banking',
    color: '#6884ad',
    names: ['PaymentMeans', 'PaymentTerms', 'FinancialAccount', 'FinancialInstitution', 'Branch'],
  },
  {
    id: 'places',
    name: 'Places',
    description: 'Addresses and geographical context',
    color: '#9a8870',
    names: ['Address', 'Location', 'Country'],
  },
];
const groupColor = (id: string) => {
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return ['#417fa8', '#9165ad', '#478a87', '#b28546', '#568866', '#ab6d64', '#6884ad', '#9a8870'][
    hash % 8
  ];
};
const normalize = (name: string) => name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const byName = new Map(
  areas.flatMap(area => area.names.map(name => [normalize(name), area] as const)),
);
export function modelOverview(
  entities: Entity[],
  edges: Relationship[],
  name: string,
  technical = false,
  grouping: GroupingOptions = {},
) {
  const hasClasses = entities.some(e => e.kind === 'OWL class');
  const visible =
    hasClasses && !technical ? entities.filter(e => e.kind === 'OWL class') : entities;
  const ids = new Set(visible.map(e => e.id));
  const links = edges.filter(e => ids.has(e.source) && ids.has(e.target));
  const suggested = suggestCommunities(visible, links);
  const declared = (entity: Entity) => [
    ...new Set(
      [
        ...(entity.declaredDomains ?? []),
        entity.definition?.domain,
        ...(Array.isArray(entity.definition?.domains) ? entity.definition.domains : []),
      ]
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map(v => v.trim()),
    ),
  ];
  const requested = grouping.mode ?? 'auto';
  const namespaces = new Set(
    visible
      .filter(isBusinessEntity)
      .flatMap(e => (e.namespace?.prefix !== undefined ? [e.namespace.iri] : [])),
  );
  const mode: Exclude<GroupingMode, 'auto'> =
    requested === 'auto'
      ? visible.some(e => declared(e).length)
        ? 'declared'
        : name.includes('UBL')
          ? 'example'
          : namespaces.size >= 2
            ? 'namespaces'
            : suggested.membership.size >= 2 && suggested.backboneEdges > 0
              ? 'suggested'
              : 'types'
      : requested;
  const groups = new Map<
    string,
    {
      id: string;
      name: string;
      description: string;
      color: string;
      entities: Entity[];
      provenance: string;
    }
  >();
  const memberships = new Map<string, string[]>();
  const counts = { declared: 0, suggested: 0, corrected: 0, unassigned: 0 };
  const byId = new Map(visible.map(e => [e.id, e]));
  const valueOwners = new Map<string, Set<string>>();
  for (const edge of links)
    if (!isInheritance(edge))
      for (const [value, business] of [
        [edge.source, edge.target],
        [edge.target, edge.source],
      ]) {
        if (byId.get(value)?.kind !== 'ValueType') continue;
        const anchor = suggested.membership.get(business);
        if (anchor) {
          const owners = valueOwners.get(value) ?? new Set<string>();
          owners.add(anchor);
          valueOwners.set(value, owners);
        }
      }

  for (const entity of visible) {
    let group = {
      id: entity.kind,
      name: entity.kind,
      description: 'Grouped by definition type',
      color: '#658b80',
      provenance: 'Definition type',
    };
    if (mode === 'example') {
      let key = normalize(entity.name.split('__')[0]);
      if (key === 'purchaseorder') key = 'order';
      const area = byName.get(key);
      if (area) group = { ...area, provenance: 'Curated UBL example' };
    } else if (mode === 'declared') {
      const domains = declared(entity);
      memberships.set(
        entity.id,
        domains.map(d => 'domain:' + d),
      );
      if (domains.length) {
        counts.declared++;
        group = {
          id: 'domain:' + domains[0],
          name: domains[0],
          description:
            domains.length > 1
              ? 'Primary declared domain; additional affiliations retained'
              : 'Declared in this entity definition',
          color: groupColor('domain:' + domains[0]),
          provenance: 'Declared domain',
        };
      } else {
        counts.unassigned++;
        group = {
          id: 'unassigned',
          name: 'Unassigned',
          description: 'No domain declared in this entity definition',
          color: '#85958e',
          provenance: 'No declaration',
        };
      }
    } else if (mode === 'namespaces') {
      const ns = entity.namespace;
      if (ns) {
        const id = 'namespace:' + ns.iri;
        group = {
          id,
          name: ns.prefix !== undefined ? (ns.prefix || '(default)') + ':' : ns.iri,
          description: ns.iri,
          color: groupColor(id),
          provenance: ns.prefix !== undefined ? 'Declared prefix' : 'IRI namespace',
        };
      } else if (entity.kind === 'Built-in concept')
        group = {
          id: 'builtins',
          name: 'Built-in concepts',
          description: 'Standard primitive concepts',
          color: '#85958e',
          provenance: 'Definition type',
        };
      else {
        counts.unassigned++;
        group = {
          id: 'no-namespace',
          name: 'No IRI',
          description: 'No global identifier declared on this definition',
          color: '#85958e',
          provenance: 'No declaration',
        };
      }
    } else if (mode === 'suggested') {
      let anchor = suggested.membership.get(entity.id);
      if (!anchor && entity.kind === 'ValueType') {
        const users = valueOwners.get(entity.id) ?? new Set<string>();
        if (users.size === 1) anchor = [...users][0];
        else
          group = {
            id: users.size ? 'shared-values' : 'unassigned-values',
            name: users.size ? 'Shared values' : 'Unassigned values',
            description: users.size
              ? 'Value types used by multiple suggested communities'
              : 'No business owner can be inferred',
            color: '#85958e',
            provenance: 'Structural suggestion',
          };
      }
      if (anchor) {
        counts.suggested++;
        group = {
          id: 'community:' + anchor,
          name: byId.get(anchor)?.name ?? anchor,
          description: 'Suggested from business relationships; named after an anchor entity',
          color: groupColor('community:' + anchor),
          provenance: 'Structural suggestion',
        };
      } else if (entity.kind === 'Built-in concept')
        group = {
          id: 'builtins',
          name: 'Built-in concepts',
          description: 'Standard primitive concepts',
          color: '#85958e',
          provenance: 'Definition type',
        };
    }
    const own = (record: Record<string, string> | undefined, key: string) =>
      record && Object.hasOwn(record, key) ? record[key] : undefined;
    const correction = own(grouping.assignments, entity.id);
    if (correction) {
      counts.corrected++;
      group = {
        id: correction,
        name: own(grouping.names, correction) ?? groups.get(correction)?.name ?? correction,
        description: 'Workspace grouping correction',
        color:
          groups.get(correction)?.color ??
          areas.find(a => a.id === correction)?.color ??
          groupColor(correction),
        provenance: 'User correction',
      };
    }
    if (own(grouping.names, group.id)) group.name = own(grouping.names, group.id)!;
    if (!memberships.has(entity.id)) memberships.set(entity.id, [group.id]);
    if (!groups.has(group.id)) groups.set(group.id, { ...group, entities: [] });
    groups.get(group.id)!.entities.push(entity);
  }
  const order = areas.map(a => a.id);
  const ordered = [...groups.values()].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.name.localeCompare(b.name);
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
  const groupingLabel = {
    example: 'Curated example areas',
    declared: 'Declared domains',
    namespaces: 'IRI namespaces',
    suggested: 'Suggested communities',
    types: 'Definition types',
  }[mode];
  const explanation = {
    example: 'Curated UBL example display areas; these are not source-declared domains.',
    declared:
      'Uses only domain/domains declarations. Multiple affiliations are retained; the first determines placement.',
    suggested:
      'Deterministic suggestions from undirected business relationships, excluding inheritance and primitive hubs. Review and correct these groups.',
    types: 'Groups by definition type without inferring business domains.',
    namespaces:
      'Groups by the namespace of each definition IRI, using the declared prefix with the longest matching namespace. Definitions without an IRI are listed separately.',
  }[mode];
  return {
    mode,
    groupingLabel,
    explanation,
    provenance: {
      kind: mode,
      counts,
      algorithm: mode === 'suggested' ? 'bounded modularity local moving' : undefined,
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
