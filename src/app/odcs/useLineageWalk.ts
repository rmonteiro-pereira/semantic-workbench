/** Holds the recorded walk through the lineage graph: the current centre, the hop count and the expansions on this centre. */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useRecordedState } from '../workspace/hooks/useRecordedState';
import { walkReducer, emptyWalk, currentStep, canvasAt, reconcileWalk, type WalkAction } from '../graph/walk';
import { setsOf } from '../graph/expansion';
import type { LineageGraph } from './lineage';

const readSteps = (key?: string) => {
  try {
    const value = key ? Number(localStorage.getItem(key)) : NaN;
    return Number.isInteger(value) && value >= 1 && value <= 3 ? value : 1;
  } catch {
    return 1;
  }
};

type WalkInputs = {
  graph: LineageGraph;
  initial: string;
  historyKey: string;
  storageKey?: string;
  onCenterChange?: (id: string) => void;
};

export function useLineageWalk({ graph, initial, historyKey, storageKey, onCenterChange }: WalkInputs) {
  const [walk, setWalk, setWalkSilently] = useRecordedState(`${historyKey}.walk`, emptyWalk, reconcileWalk);
  const dispatch = useCallback((action: WalkAction) => setWalk(previous => walkReducer(previous, action)), [setWalk]);
  // Starting a walk on a new centre is not a step the person took, so it is not recorded. A walk
  // that Back or Forward brought back is kept when the canvas appears.
  const walkStarted = useRef(false);
  useEffect(() => {
    const keepRestored = !walkStarted.current;
    walkStarted.current = true;
    setWalkSilently(previous =>
      keepRestored && previous.steps.length > 0
        ? previous
        : walkReducer(previous, {
            type: 'reset',
            step: {
              doc: graph.contract,
              center: initial,
              name: graph.cards.get(initial)?.label ?? initial,
            },
          }),
    );
  }, [initial, graph.contract]);
  // A centre that is gone from the graph (the file changed under the walk) falls back to the
  // initial one.
  const walked = currentStep(walk)?.center;
  let center: string;
  if (walked && graph.cards.has(walked)) {
    center = walked;
  } else if (graph.cards.has(initial)) {
    center = initial;
  } else {
    center = graph.cards.keys().next().value ?? '';
  }
  useEffect(() => {
    if (center) onCenterChange?.(center);
  }, [center]);
  const [steps, setSteps] = useRecordedState(`${historyKey}.hops`, () => readSteps(storageKey));
  useEffect(() => {
    try {
      if (storageKey) localStorage.setItem(storageKey, String(steps));
    } catch {}
  }, [steps, storageKey]);
  // Expansions and pierces are walk steps on this canvas: Back / Undo expansion restore it.
  const sets = useMemo(() => {
    const c = canvasAt(walk);
    return c.center && c.center.center === center ? setsOf(c.sets) : [];
  }, [walk, center]);
  const walkTo = useCallback(
    (id: string, via?: string) => {
      const lineageCard = graph.cards.get(id);
      if (!lineageCard) return;
      dispatch({
        type: 'push',
        step: {
          doc: graph.contract,
          center: id,
          name: lineageCard.label,
          ...(via ? { via: { id: via, label: via.slice(via.lastIndexOf('/') + 1) } } : {}),
        },
      });
    },
    [graph],
  );
  return { walk, dispatch, center, steps, setSteps, sets, walkTo };
}
