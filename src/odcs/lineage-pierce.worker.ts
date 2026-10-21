/** Runs lineage traversal off the main thread; stopping a traversal terminates the worker. */
import { lineagePierce, type LineagePierceInput } from './lineage-pierce';
// Lineage Full pierce off the main thread. Stop terminates the worker.
self.onmessage = (e: MessageEvent<{ id: number; input: LineagePierceInput }>) => {
  (self as unknown as Worker).postMessage({ id: e.data.id, result: lineagePierce(e.data.input) });
};
