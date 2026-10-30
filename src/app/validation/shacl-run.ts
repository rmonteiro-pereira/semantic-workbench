/** Starts a SHACL run in its own worker and stops the worker if the run takes too long. */
import type { RdfSource, ShaclReport } from '../../shared/validation/shacl';

/** How long a run may take before it is stopped. */
export const SHACL_TIMEOUT_MS = 30_000;

type ShaclReply = { report: ShaclReport } | { error: string };

/** Runs the shapes on the data in a fresh worker; rejects with "Stopped after N s" when the time limit passes. */
export function runShaclInWorker(shapes: RdfSource, data: RdfSource, timeoutMs = SHACL_TIMEOUT_MS): Promise<ShaclReport> {
  // A worker per run, because the only way to stop a runaway query is to terminate its worker.
  const worker = new Worker(new URL('./shacl.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Stopped after ${Math.round(timeoutMs / 1000)} s. The shapes took too long to run on this data.`));
    }, timeoutMs);
    worker.onmessage = ({ data: reply }: MessageEvent<ShaclReply>) => {
      clearTimeout(timer);
      worker.terminate();
      if ('error' in reply) reject(new Error(reply.error));
      else resolve(reply.report);
    };
    worker.onerror = event => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message || 'The shapes check stopped unexpectedly.'));
    };
    worker.postMessage({ shapes, data });
  });
}
