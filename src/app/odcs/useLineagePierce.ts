/** Runs the full-pierce search in a worker and records its result as a step on the walk. */
import { useEffect, useRef, useState } from 'react';
import { allConnectedLabel, registerSet, type Direction } from '../graph/expansion';
import { PIERCE_BUDGET } from '../graph/pierce';
import type { useActionHistory } from '../workspace/ActionHistoryContext';
import { cardOfNode, selectionNodes, type LineageGraph } from './lineage';
import type { LineagePierceInput, LineagePierceResult } from './lineage-pierce';

type PierceInputs = {
  graph: LineageGraph;
  center: string;
  selected: string;
  pierceFromCenter: boolean;
  direction: Direction;
  actionHistory: ReturnType<typeof useActionHistory>;
  record: (set: ReturnType<typeof registerSet>, name: string) => void;
  labelOf: (id: string) => string;
};

export function useLineagePierce({ graph, center, selected, pierceFromCenter, direction, actionHistory, record, labelOf }: PierceInputs) {
  const [piercing, setPiercing] = useState(false);
  const pierceWorker = useRef<Worker | null>(null);
  const stopPierce = () => {
    pierceWorker.current?.terminate();
    pierceWorker.current = null;
    setPiercing(false);
  };
  useEffect(() => stopPierce, [center]);
  const fullPierce = (budget = PIERCE_BUDGET) => {
    const start = (pierceFromCenter ? '' : selected) || center;
    const from = cardOfNode(graph, start);
    if (!from) return;
    stopPierce();
    const worker = new Worker(new URL('./lineage-pierce.worker.ts', import.meta.url), {
      type: 'module',
    });
    pierceWorker.current = worker;
    setPiercing(true);
    const owners: Record<string, string> = {};
    for (const card of graph.cards.values()) for (const x of card.columns) owners[x.id] = card.id;
    const input: LineagePierceInput = {
      edges: graph.edges.map(e => [e.from, e.to]),
      owners,
      start: selectionNodes(graph, start),
      direction,
      budget,
    };
    worker.onmessage = (messageEvent: MessageEvent<{ id: number; result: LineagePierceResult }>) => {
      worker.terminate();
      if (pierceWorker.current !== worker) return;
      pierceWorker.current = null;
      setPiercing(false);
      const lineagePierceResult = messageEvent.data.result;
      // The result arrives after the click that asked for it, so it opens its own history step.
      actionHistory.act('pierce', () =>
        record(
          registerSet({
            kind: 'pierce',
            from,
            direction,
            nodes: lineagePierceResult.cards.filter(c => c !== from),
            edges: [],
            frontier: {},
            total: lineagePierceResult.total,
            budget,
            steps: lineagePierceResult.steps,
          }),
          allConnectedLabel(start === from ? labelOf(from) : start.slice(start.lastIndexOf('/') + 1)),
        ),
      );
    };
    worker.onerror = () => stopPierce();
    worker.postMessage({ id: 1, input });
  };
  return { piercing, stopPierce, fullPierce };
}
