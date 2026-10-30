/** Runs SHACL shapes off the main thread so a slow or runaway constraint cannot freeze the page. */
import { runShaclShapes, type RdfSource } from '../../shared/validation/shacl';

type ShaclRequest = { shapes: RdfSource; data: RdfSource };

self.onmessage = async (event: MessageEvent<ShaclRequest>) => {
  try {
    const report = await runShaclShapes(event.data.shapes, event.data.data);
    self.postMessage({ report });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
