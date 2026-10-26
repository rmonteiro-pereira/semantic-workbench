/** Computes compound network layouts off the main thread. */
import { layoutNetwork } from './network-layout';
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      result: layoutNetwork(data.entities, data.edges, data.name, {}, data.grouping),
    });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
