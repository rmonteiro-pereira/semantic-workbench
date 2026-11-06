/** Runs the lineage layout in ELK's worker and keeps React Flow's card measurements. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStoreApi, useUpdateNodeInternals, type NodeChange } from '@xyflow/react';
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { elkGraph, positionsOf, type LayoutCard, type LayoutEdge, type LayoutResult } from './lineage-layout';

type NodeSize = { width: number; height: number };
// Preserve measurements while a card keeps its rows. Changed rows invalidate the size so React
// Flow measures their new handles before trying to connect edges to them.
export function useMeasuredNodeSizes() {
  const sizes = useRef(new Map<string, NodeSize>());
  const shapes = useRef(new Map<string, string>());
  const sizeFor = useCallback((id: string, shape: string) => {
    if (shapes.current.get(id) !== shape) {
      shapes.current.set(id, shape);
      sizes.current.delete(id);
    }
    return sizes.current.get(id);
  }, []);
  const recordSizes = useCallback((changes: NodeChange[]) => {
    for (const change of changes) {
      if (change.type === 'dimensions' && change.dimensions) {
        sizes.current.set(change.id, change.dimensions);
      }
    }
  }, []);
  return { sizeFor, recordSizes };
}
const MEASURE_CHECK_MS = 500;

// React Flow keeps a card hidden until it has measured it. Under load a measurement can be lost
// for good, and then nothing retries it: the card stays hidden and the canvas looks empty. This
// watches the cards on screen and asks React Flow to measure again any that are still hidden.
export function MeasurementWatchdog() {
  const store = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    const timer = setInterval(() => {
      const canvas = store.getState().domNode;
      if (!canvas) return;
      const renderedCards = canvas.querySelectorAll<HTMLElement>('.react-flow__node');
      const unmeasured = [...renderedCards].filter(card => card.style.visibility === 'hidden').map(card => card.dataset.id ?? '');
      if (unmeasured.length) updateNodeInternals(unmeasured.filter(Boolean));
    }, MEASURE_CHECK_MS);
    return () => clearInterval(timer);
  }, [store, updateNodeInternals]);
  return null;
}

// Lays out in ELK's worker (elk-api + elk-worker, as the Graph view does); returns the latest
// positions (the previous ones stay while a new layout runs).
export function useLayout(cards: LayoutCard[], edges: LayoutEdge[], key: string) {
  const elk = useRef<{ layout: (graph: any) => Promise<any>; terminateWorker: () => void } | null>(null);
  const seq = useRef(0);
  const [result, setResult] = useState<{ key: string; layout: LayoutResult } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    elk.current = new ELK({ workerFactory: () => new Worker(elkWorkerUrl) }) as any;
    return () => elk.current?.terminateWorker();
  }, []);
  useEffect(() => {
    const elkInstance = elk.current;
    if (!elkInstance) return;
    const id = ++seq.current;
    setBusy(true);
    elkInstance
      .layout(elkGraph(cards, edges))
      .then(layoutOutput => {
        if (id !== seq.current) return;
        setBusy(false);
        setResult({ key, layout: positionsOf(layoutOutput) });
      })
      .catch(() => {
        if (id === seq.current) setBusy(false);
      });
  }, [key]);
  return { result, busy };
}
