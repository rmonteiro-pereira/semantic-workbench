import { lineagePierce, type LineagePierceInput } from './lineage-pierce';
// Lineage Full pierce off the main thread (FR-022). Stop terminates the worker.
self.onmessage = (e: MessageEvent<{ id: number; input: LineagePierceInput }>) => {
  (self as unknown as Worker).postMessage({ id: e.data.id, result: lineagePierce(e.data.input) });
};
