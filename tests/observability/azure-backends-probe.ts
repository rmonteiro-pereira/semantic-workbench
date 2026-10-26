// Runs in its own process: builds the Azure exporters with every connection forbidden and reports
// the attempts it saw.
import net from 'node:net';
import tls from 'node:tls';
import { azureBackends } from '../../src/server/observability/azure-backends';

const attempts: string[] = [];
function forbid(name: string, owner: object, method: string) {
  (owner as Record<string, unknown>)[method] = () => {
    attempts.push(name);
    throw new Error(`${name} is not allowed`);
  };
}
forbid('net.Socket.connect', net.Socket.prototype, 'connect');
forbid('tls.connect', tls, 'connect');
forbid('fetch', globalThis, 'fetch');

const connectionString =
  'InstrumentationKey=4f6c2a10-8d3b-4e7a-b5c9-1a2b3c4d5e6f;' +
  'IngestionEndpoint=https://westeurope-5.in.applicationinsights.azure.com/';
const backends = await azureBackends({ enabled: true, connectionString, sampleRatio: 0.1 });
await new Promise(resolve => setTimeout(resolve, 1500));
await Promise.all([
  backends.spanExporter.shutdown(),
  backends.metricExporter.shutdown(),
  backends.logExporter.shutdown(),
]);
await new Promise(resolve => setTimeout(resolve, 1000));
console.log(JSON.stringify({ attempts }));
