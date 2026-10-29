/** Provides worker-backed graph traversal controls, cancellation and expansion summaries. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Network, Square, Undo2 } from 'lucide-react';
import type { Direction, Link } from './expansion';
import type { PierceNode, PierceOptions, PierceResult } from './pierce';
// Shared controls to show everything connected (the full pierce): the button, the Pierce direction radio group, Stop while running, Undo expansion. The closure runs in pierce.worker.ts; Stop or a new
// run terminates the previous worker.
/** Runs graph traversal in a worker and terminates superseded or stopped runs. */
export function usePierce() {
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  const [running, setRunning] = useState(false);
  const stop = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    seq.current++;
    setRunning(false);
  }, []);
  useEffect(() => () => worker.current?.terminate(), []);
  const run = useCallback((nodes: PierceNode[], edges: Link[], start: string[], options: PierceOptions): Promise<PierceResult | null> => {
    worker.current?.terminate();
    const id = ++seq.current;
    const pierceWorker = new Worker(new URL('./pierce.worker.ts', import.meta.url), { type: 'module' });
    worker.current = pierceWorker;
    setRunning(true);
    return new Promise(resolve => {
      pierceWorker.onmessage = (messageEvent: MessageEvent<{ id: number; result: PierceResult }>) => {
        if (messageEvent.data.id !== seq.current) {
          resolve(null);
          return;
        }
        pierceWorker.terminate();
        if (worker.current === pierceWorker) worker.current = null;
        setRunning(false);
        resolve(messageEvent.data.result);
      };
      pierceWorker.onerror = () => {
        pierceWorker.terminate();
        if (worker.current === pierceWorker) worker.current = null;
        setRunning(false);
        resolve(null);
      };
      pierceWorker.postMessage({ id, nodes, edges, start, options });
    });
  }, []);
  return { run, stop, running };
}
const LABELS: Record<Direction, [string, string]> = {
  out: ['Outgoing', 'Outgoing'],
  in: ['Incoming', 'Incoming'],
  both: ['Both', 'Both'],
};
/** Selects traversal direction and offers start, stop and undo actions. */
export function PierceControls({
  direction,
  onDirection,
  running,
  onPierce,
  onStop,
  canUndo,
  onUndo,
  title,
}: {
  direction: Direction;
  onDirection: (direction: Direction) => void;
  running: boolean;
  onPierce: () => void;
  onStop: () => void;
  canUndo: boolean;
  onUndo: () => void;
  title?: string;
}) {
  return (
    <span className="pierce-controls">
      <button onClick={onPierce} disabled={running} title={title ?? 'Expand everything reachable in the chosen direction'}>
        <Network size={13} />
        Show all connected
      </button>
      <span className="pierce-direction-label">Expand:</span>
      <span role="radiogroup" aria-label="Pierce direction" className="pierce-direction">
        {(['out', 'in', 'both'] as Direction[]).map(choice => (
          <button
            key={choice}
            role="radio"
            aria-checked={direction === choice}
            aria-label={LABELS[choice][1]}
            title={`Follow ${LABELS[choice][1].toLowerCase()} relationships on the next expansion`}
            onClick={() => onDirection(choice)}
          >
            {LABELS[choice][0]}
          </button>
        ))}
      </span>
      {running && (
        <button onClick={onStop} className="pierce-stop">
          <Square size={12} />
          Stop
        </button>
      )}
      <button onClick={onUndo} disabled={!canUndo} aria-label="Undo expansion" title="Undo expansion: remove the last expansion">
        <Undo2 size={13} />
      </button>
    </span>
  );
}
// The banner after a pierce: shown and reachable counts, Expand further, Stop.
/** Shows traversal coverage and controls for expanding further or stopping. */
export function PierceBanner({
  result,
  budget,
  max,
  running,
  onFurther,
  onStop,
  noun = ['entity', 'entities'],
}: {
  noun?: [string, string];
  result: { shown: number; total: number; maxStep: number };
  budget: number;
  max: number;
  running: boolean;
  onFurther: () => void;
  onStop: () => void;
}) {
  const more = result.total - result.shown;
  return (
    <div className="pierce-banner" role="status">
      <span>
        {result.shown} {result.shown === 1 ? noun[0] : noun[1]} shown in {result.maxStep} {result.maxStep === 1 ? 'step' : 'steps'}
        {more > 0 && (
          <>
            {' '}
            · <strong>{more} more reachable</strong>
          </>
        )}
      </span>
      {more > 0 && budget < max && (
        <button onClick={onFurther} disabled={running}>
          Expand further
        </button>
      )}
      {running && <button onClick={onStop}>Stop</button>}
    </div>
  );
}
