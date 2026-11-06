/** Lays out the full model graph in a worker (Network) or ELK (Layered) and turns the result into React Flow nodes. */
import { useEffect, useRef, useState } from 'react';
import { useNodesState } from '@xyflow/react';
import type { SmartEdgeMetrics } from '@tisoap/react-flow-smart-edge';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { FALLBACK_GROUP_COLOR } from '../theme/theme-palette';
import { timeOperation } from '../observability/page-reporting';
import type { GroupingOptions, modelOverview } from './overview';
import type { collapseAreas } from './collapse';
import { layoutFullGraph, packNetwork } from './full-layout';
import { areaTileData, entityCardData } from './full-node-data';
import type { NetworkLayoutRequest, NetworkLayoutResponse } from './network-layout';
import type { Entity } from '../../shared/core/model';

type LayoutResult = Awaited<ReturnType<typeof layoutFullGraph>>;
type Overview = ReturnType<typeof modelOverview>;
type Display = ReturnType<typeof collapseAreas>;
type Group = Overview['groups'][number];
type ElkInstance = { layout: (elkGraph: any) => Promise<any>; terminateWorker: () => void };

/** The worker and ELK instance of a layout in progress, so its cleanup can stop them. */
type LayoutHandles = { worker?: Worker; elk?: ElkInstance };

const cache = new Map<string, LayoutResult>();

type LayoutInputs = {
  name: string;
  algorithm: 'network' | 'layered';
  version: number;
  paneMeasured: boolean;
  overview: Overview;
  display: Display;
  layoutGrouping: GroupingOptions;
  entityById: Map<string, Entity>;
  groupById: Map<string, Group>;
  fit: () => void;
  setRouteMetrics: (metrics: SmartEdgeMetrics | null) => void;
};

function nodeData(node: LayoutResult['nodes'][number], group: Group | undefined, entityById: Map<string, Entity>, display: Display) {
  if (node.group) {
    return areaTileData({ name: group!.name, color: group!.color, entityCount: group!.entities.length }, node.width);
  }
  const entity = entityById.get(node.id);
  const collapsedArea = entity?.definition?.collapsedArea;
  return {
    name: entity?.name,
    collapsedArea,
    internalCount: display.internal.get(collapsedArea)?.length ?? 0,
    color: group?.color ?? FALLBACK_GROUP_COLOR,
    ...entityCardData(entity!, node),
  };
}

// A node keeps the size React Flow measured when its type and size did not change.
function flowNodes(result: LayoutResult, previous: any[], overview: Overview, display: Display, groupById: Map<string, Group>, entityById: Map<string, Entity>) {
  const previousById = new Map(previous.map(node => [node.id, node]));
  return result.nodes.map(node => {
    const group = node.group ? groupById.get(node.group) : groupById.get(overview.groupOf.get(node.id)!);
    const type = node.group ? 'businessArea' : 'entity';
    const prior = previousById.get(node.id);
    const sameSize = prior?.type === type && prior.style?.width === node.width && prior.style?.height === node.height;
    return {
      id: node.id,
      type,
      measured: sameSize ? prior.measured : undefined,
      position: { x: node.x, y: node.y },
      parentId: node.parentId,
      extent: node.parentId ? 'parent' : undefined,
      draggable: true,
      selectable: !node.group,
      style: {
        width: node.width,
        height: node.height,
        ...(node.group
          ? {
              background: group!.color + '06',
              border: '1px solid ' + group!.color + '45',
              borderRadius: 16,
              zIndex: -1,
            }
          : { zIndex: 2 }),
      },
      data: nodeData(node, group, entityById, display),
    };
  });
}

// The Network layout runs in a worker, then ELK packs its components.
function arrangeNetwork(request: NetworkLayoutRequest, signal: AbortSignal, isCancelled: () => boolean, handles: LayoutHandles): Promise<LayoutResult> {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Network layout cancelled.', 'AbortError')), { once: true });
    handles.worker = new Worker(new URL('./network-layout.worker.ts', import.meta.url), { type: 'module' });
    const worker = handles.worker;
    worker.onmessage = ({ data }: MessageEvent<NetworkLayoutResponse>) => {
      worker.terminate();
      if (isCancelled()) return;
      if ('error' in data) {
        reject(new Error(data.error));
        return;
      }
      handles.elk = new ELK({ algorithms: ['box', 'sporeOverlap'], workerFactory: () => new Worker(elkWorkerUrl) });
      packNetwork(data.result, handles.elk).then(resolve, reject);
    };
    worker.onerror = event => {
      event.preventDefault();
      worker.terminate();
      reject(new Error(event.message || 'Network layout failed.'));
    };
    worker.postMessage(request);
  });
}

export function useFullGraphLayout({ name, algorithm, version, paneMeasured, overview, display, layoutGrouping, entityById, groupById, fit, setRouteMetrics }: LayoutInputs) {
  const laidOutKey = useRef('');
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [layoutRoutes, setLayoutRoutes] = useState<LayoutResult['routes']>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (!paneMeasured) return;
    const controller = new AbortController();
    const handles: LayoutHandles = {};
    const key = JSON.stringify([algorithm, layoutGrouping, name, display.entities.map(e => [e.id, e.name, e.kind]), display.edges.map(e => [e.source, e.target])]);
    setBusy(true);
    setError('');
    // A re-layout that lands on the same arrangement re-routes nothing, so its old metrics still hold.
    if (laidOutKey.current !== key) setRouteMetrics(null);
    function apply(result: LayoutResult) {
      if (cancelled) return;
      laidOutKey.current = key;
      setLayoutRoutes(result.routes ?? {});
      cache.set(key, result);
      if (cache.size > 6) cache.delete(cache.keys().next().value!);
      setNodes(previous => flowNodes(result, previous, overview, display, groupById, entityById));
      setBusy(false);
      setTimeout(fit, 150);
    }
    if (cache.has(key) && !version) {
      apply(cache.get(key)!);
    } else {
      let arranged: Promise<LayoutResult>;
      if (algorithm === 'network') {
        const request = { entities: display.entities, edges: display.edges, name, grouping: layoutGrouping } satisfies NetworkLayoutRequest;
        arranged = arrangeNetwork(request, controller.signal, () => cancelled, handles);
      } else {
        handles.elk = new ELK({
          algorithms: ['layered', 'box'],
          workerFactory: () => new Worker(elkWorkerUrl),
        });
        arranged = layoutFullGraph(display.entities, display.edges, { name, elk: handles.elk, grouping: layoutGrouping });
      }
      timeOperation('graph-layout', arranged)
        .then(apply)
        .catch(failure => {
          if (!cancelled) {
            setError(failure.message);
            setBusy(false);
          }
        })
        .finally(() => handles.elk?.terminateWorker());
    }
    return () => {
      cancelled = true;
      controller.abort();
      handles.worker?.terminate();
      handles.elk?.terminateWorker();
    };
  }, [overview, display, algorithm, version, layoutGrouping, paneMeasured]);
  return { nodes, onNodesChange, layoutRoutes, busy, error };
}
