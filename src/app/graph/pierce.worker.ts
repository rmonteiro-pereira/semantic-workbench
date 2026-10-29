/** Runs graph traversal off the main thread; stopping a traversal terminates the worker. */
import { boundedClosure, type PierceNode, type PierceOptions } from './pierce';
import type { Link } from './expansion';
// Full pierce off the main thread. Stop terminates the worker.
self.onmessage = (
  messageEvent: MessageEvent<{
    id: number;
    nodes: PierceNode[];
    edges: Link[];
    start: string[];
    options: PierceOptions;
  }>,
) => {
  const { id, nodes, edges, start, options } = messageEvent.data;
  (self as unknown as Worker).postMessage({
    id,
    result: boundedClosure(nodes, edges, start, options),
  });
};
