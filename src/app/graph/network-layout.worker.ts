/** Computes network layouts off the main thread. */
import { layoutNetwork, type NetworkLayoutRequest, type NetworkLayoutResponse } from './network-layout';

self.onmessage = ({ data }: MessageEvent<NetworkLayoutRequest>) => {
  let response: NetworkLayoutResponse;
  try {
    response = { result: layoutNetwork(data.entities, data.edges, data.name, data.grouping) };
  } catch (error) {
    response = { error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(response);
};
