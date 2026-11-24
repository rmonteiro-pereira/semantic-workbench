/** Connects React to the Traffic store: the hook every Traffic display reads, and the pieces it derives. */
import { createContext, createElement, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { AddressDocument } from '../../shared/core/model-addresses';
import type { Relationship } from '../../shared/core/model';
import { api } from '../projects/api';
import { useMe } from '../auth/useMe';
import { canOpenAdmin } from '../admin/admin-entry';
import { browserTrafficDeps, createTrafficStore, type TrafficSnapshot, type TrafficStore } from './traffic-store';
import type { KpiSummary } from '../../server/agent/explain';
import { absoluteTrafficAddress, metricAddressText, relationshipAddressText } from './usage-addresses';
import { intensityLevel } from './usage-intensity';

/** The store of the running application; it asks the server only when the option is switched on. */
export const trafficStore: TrafficStore = createTrafficStore(browserTrafficDeps(api.usage));

const StoreContext = createContext<TrafficStore>(trafficStore);

/** Gives the Traffic displays below it another store; tests use it to supply answers. */
export function TrafficStoreProvider({ store, children }: { store: TrafficStore; children: ReactNode }) {
  return createElement(StoreContext.Provider, { value: store }, children);
}

/** The store the displays below read. */
export const useTrafficStore = () => useContext(StoreContext);

/** The current Traffic state, re-read whenever it changes. */
export function useTraffic(): TrafficSnapshot {
  const store = useTrafficStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Whether the person may open Admin, who is told how to turn counters on. */
export function useTrafficAdmin(): boolean {
  return canOpenAdmin(useMe().me);
}

/** What one item shows: its total and split, its intensity and whether any count is shown at all. */
export type ItemTraffic = { level: number; total: number; byOperation: Record<string, number>; days: number };

/** The count of one item, or null while Traffic is off, still loading, or when the item has no address to count under. */
export function trafficOf(snapshot: TrafficSnapshot, address: string | undefined): ItemTraffic | null {
  if (!address || !snapshot.on || (snapshot.status !== 'ready' && snapshot.status !== 'partial' && snapshot.status !== 'empty')) return null;
  const item = snapshot.items.get(address);
  const total = item?.total ?? 0;
  return { level: intensityLevel(total, snapshot.largest), total, byOperation: item?.byOperation ?? {}, days: snapshot.days };
}

/** Tells the store which project, file and model are on screen; call it from the component that shows them. */
export function useTrafficScope(project: string | undefined, path: string | undefined, modelName: string | undefined): void {
  const store = useTrafficStore();
  useEffect(() => {
    if (project && path && modelName) void store.attach({ project, path, modelName });
  }, [store, project, path, modelName]);
}

/** The file whose items are on screen, or null before a graph or list has said. */
export function scopeDocument(snapshot: TrafficSnapshot): AddressDocument | null {
  return snapshot.project && snapshot.path ? { project: snapshot.project, document: snapshot.path.split('/') } : null;
}

/** The Traffic of one item, given its address relative to the file, for the component that draws it. */
export function useItemTraffic(address: string | undefined): ItemTraffic | null {
  const snapshot = useTraffic();
  if (!snapshot.on) return null;
  return trafficOf(snapshot, absoluteTrafficAddress(address, scopeDocument(snapshot)));
}

/** The traffic of a bundle of relationships drawn as one line: the sum, at the level of the busiest one. */
export function bundleTraffic(snapshot: TrafficSnapshot, relationships: readonly Relationship[] | undefined, document: AddressDocument | null): ItemTraffic | null {
  if (!snapshot.on) return null;
  const found = (relationships ?? [])
    .map(relationship => trafficOf(snapshot, absoluteTrafficAddress(relationshipAddressText(relationship), document)))
    .filter((traffic): traffic is ItemTraffic => traffic !== null);
  if (!found.length) return null;
  const byOperation: Record<string, number> = {};
  for (const traffic of found) for (const [operation, count] of Object.entries(traffic.byOperation)) byOperation[operation] = (byOperation[operation] ?? 0) + count;
  return {
    level: Math.max(...found.map(traffic => traffic.level)),
    total: found.reduce((sum, traffic) => sum + traffic.total, 0),
    byOperation,
    days: found[0].days,
  };
}

/** The traffic of the relationships a line stands for. */
export function useBundleTraffic(relationships: readonly Relationship[] | undefined): ItemTraffic | null {
  const snapshot = useTraffic();
  if (!snapshot.on) return null;
  return bundleTraffic(snapshot, relationships, scopeDocument(snapshot));
}

const zeroTraffic = () => 0;

/** The total of one item's requests, found by its address relative to the file on screen; 0 when none or while Traffic shows nothing. */
export function useTrafficTotals(): (relativeAddress: string | undefined) => number {
  const snapshot = useTraffic();
  if (!snapshot.on) return zeroTraffic;
  const document = scopeDocument(snapshot);
  return relativeAddress => trafficOf(snapshot, absoluteTrafficAddress(relativeAddress, document))?.total ?? 0;
}

/** The total of one metric's requests; 0 when none or while Traffic shows nothing. */
export function useMetricTotals(project: string | null): (metric: KpiSummary) => number {
  const snapshot = useTraffic();
  if (!snapshot.on) return zeroTraffic;
  return metric => (project ? (trafficOf(snapshot, metricAddressText(project, metric))?.total ?? 0) : 0);
}
