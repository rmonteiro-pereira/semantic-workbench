import { boundedClosure, type PierceNode, type PierceOptions } from './pierce';
import type { Link } from './expansion';
// Full pierce off the main thread (FR-022). Stop terminates the worker.
self.onmessage = (
  e: MessageEvent<{
    id: number;
    nodes: PierceNode[];
    edges: Link[];
    start: string[];
    options: PierceOptions;
  }>,
) => {
  const { id, nodes, edges, start, options } = e.data;
  (self as unknown as Worker).postMessage({
    id,
    result: boundedClosure(nodes, edges, start, options),
  });
};
