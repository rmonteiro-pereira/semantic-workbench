import { useEffect, useMemo, useState } from 'react';
import { documentAddress, formatAddress, parseAddress, type ItemSegment } from '../../shared/core/item-address';
import { inspect, type Entity, type Relationship, type StructuredEntity, type StructuredRelationship } from '../../shared/core/model';
import type { ItemChange } from '../../shared/item-diff/item-change';
import { scm, type Doc } from '../projects/api';
import { useItemDiffContext, useVisibleItemChanges } from './ItemDiffContext';

type GraphModel = { entities: Entity[]; edges: Relationship[] };
type GraphItem = Entity | Relationship;
type Scope = Pick<Doc, 'project' | 'path'>;
type AddressedGraphItem = StructuredEntity | StructuredRelationship;

function addressOf(item: GraphItem, scope: Scope) {
  if (!('address' in item)) return undefined;
  const { address } = item as AddressedGraphItem;
  return formatAddress({ ...address, form: 'absolute', project: scope.project, document: scope.path.split('/') });
}

function itemsByAddress(items: GraphItem[], scope: Scope) {
  return new Map(
    items.flatMap(item => {
      const address = addressOf(item, scope);
      return address ? [[address, item.id] as const] : [];
    }),
  );
}

function addRemovedEntities(current: Entity[], published: Entity[], changes: Map<string, ItemChange>, removed: Map<string, ItemChange>, scope: Scope) {
  const entities = current.slice();
  const destinationIds = itemsByAddress(current, scope);
  const endpoints = new Map<string, string>();
  for (const change of changes.values()) {
    const destination = destinationIds.get(change.address);
    if (change.previousAddress && destination) destinationIds.set(change.previousAddress, destination);
  }
  for (const entity of published) {
    const address = addressOf(entity, scope);
    if (!address) continue;
    const destination = destinationIds.get(address);
    if (destination) endpoints.set(entity.id, destination);
    if (!removed.has(address)) continue;
    const id = 'removed:' + address;
    endpoints.set(entity.id, id);
    entities.push({ ...entity, id, readOnlyForm: true });
  }
  return { entities, endpoints };
}

function addRemovedEdges(current: Relationship[], published: Relationship[], changes: Map<string, ItemChange>, endpoints: Map<string, string>, scope: Scope) {
  const edges = current.slice();
  for (const edge of published) {
    const address = addressOf(edge, scope);
    const source = endpoints.get(edge.source);
    const target = endpoints.get(edge.target);
    if (!address || !source || !target || changes.get(address)?.state !== 'removed') continue;
    edges.push({ ...edge, id: 'removed:' + address, source, target, data: { ...edge.data, readOnlyForm: true } });
  }
  return edges;
}

function leafKey(leaf: ItemSegment | undefined): string | undefined {
  if (!leaf) return undefined;
  return 'name' in leaf ? leaf.name : '#' + leaf.position;
}

function changesForDocument(changes: readonly ItemChange[], scope: Scope) {
  const prefix = documentAddress(scope.project, scope.path) + '#';
  const current = new Map<string, ItemChange>();
  const removed = new Map<string, ItemChange>();
  const leaves = new Set<string | undefined>();
  for (const change of changes) {
    if (!change.address.startsWith(prefix)) continue;
    const parsed = parseAddress(change.address);
    if (!parsed.ok) continue;
    leaves.add(leafKey(parsed.address.chain.at(-1)));
    (change.state === 'removed' ? removed : current).set(change.address, change);
  }
  return { current, removed, leaves };
}

/** Annotates current graph items and restores removed nodes and links using published addresses. */
export function graphChanges(working: GraphModel, changes: readonly ItemChange[], scope: Scope, published?: GraphModel): GraphModel {
  if (!changes.length) return working;
  const { current, removed, leaves } = changesForDocument(changes, scope);
  if (!leaves.size) return working;
  const restored = published && removed.size ? addRemovedEntities(working.entities, published.entities, current, removed, scope) : undefined;
  const currentEdges = restored && published ? addRemovedEdges(working.edges, published.edges, removed, restored.endpoints, scope) : working.edges;

  function mark(item: GraphItem) {
    if (!('address' in item)) return undefined;
    const { address } = item as AddressedGraphItem;
    if (!leaves.has(leafKey(address.chain.at(-1)))) return undefined;
    const absolute = addressOf(item, scope) ?? '';
    return item.id.startsWith('removed:') ? removed.get(absolute)?.state : current.get(absolute)?.state;
  }

  const entities = (restored?.entities ?? working.entities).map(entity => {
    const change = mark(entity);
    return change ? { ...entity, change } : entity;
  });
  const edges = currentEdges.map(edge => {
    const change = mark(edge);
    return change ? { ...edge, data: { ...edge.data, change } } : edge;
  });
  return { entities, edges };
}

function wasRemoved(change: ItemChange, path: string) {
  if (change.state !== 'removed') return false;
  const address = parseAddress(change.address);
  return address.ok && address.address.document?.join('/') === path;
}

/** Loads a visible published file only when its graph needs removed items. */
export function useGraphChanges(working: GraphModel | null, document: Doc | null) {
  const overlay = useItemDiffContext();
  const changes = useVisibleItemChanges();
  const commit = overlay && 'diff' in overlay.result ? overlay.result.diff.from.version : '';
  const project = document?.project;
  const path = document?.path;
  const needsPublished = Boolean(project && path && commit && changes.some(change => wasRemoved(change, path)));
  const key = JSON.stringify([project, path, commit]);
  const [previous, setPrevious] = useState<{ key: string; graph: GraphModel }>();
  useEffect(() => {
    if (!project || !path || !needsPublished) return;
    let cancelled = false;
    void scm
      .diff(project, path, commit, commit)
      .then(comparison => {
        if (cancelled || !comparison.beforeExists || comparison.binary) return;
        setPrevious({ key, graph: inspect(comparison.before, path) });
      })
      .catch(error => {
        if (!cancelled) console.warn('Could not draw removed items from the published file.', error);
      });
    return () => {
      cancelled = true;
    };
  }, [project, path, commit, needsPublished, key]);
  const published = needsPublished && previous?.key === key ? previous.graph : undefined;
  return useMemo(() => (working && document ? graphChanges(working, changes, document, published) : working), [working, document, changes, published]);
}
