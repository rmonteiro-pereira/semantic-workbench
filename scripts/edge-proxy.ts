// Lets an authenticating edge reach a local-mode Workbench, which answers loopback names only.
// Requests addressed to the public name are re-addressed to loopback before they reach it.
// Any other Host or Origin passes through unchanged, so the Workbench still refuses it.

export type EdgeAddresses = {
  publicOrigin: string;
  upstreamOrigin: string;
};

export function upstreamRequest(request: Request, addresses: EdgeAddresses): Request {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, addresses.upstreamOrigin);
  const headers = new Headers(request.headers);
  if (headers.get('host') === new URL(addresses.publicOrigin).host) {
    headers.set('host', new URL(addresses.upstreamOrigin).host);
  }
  if (headers.get('origin') === addresses.publicOrigin) {
    headers.set('origin', addresses.upstreamOrigin);
  }
  return new Request(target, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
    signal: request.signal,
  });
}

// The body is passed on as sent, so a compressed response keeps its own encoding header.
// No timeout applies: the event stream stays open for as long as the page does.
async function forwardToWorkbench(request: Request, addresses: EdgeAddresses): Promise<Response> {
  try {
    return await fetch(upstreamRequest(request, addresses), { decompress: false });
  } catch {
    // The edge shows its own error page for a gateway error, which is clearer than a closed connection.
    return new Response('Workbench unavailable', { status: 502 });
  }
}

function requiredSetting(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

if (import.meta.main) {
  const addresses = {
    publicOrigin: requiredSetting('EDGE_PUBLIC_ORIGIN'),
    upstreamOrigin: requiredSetting('EDGE_UPSTREAM_ORIGIN'),
  };
  Bun.serve({
    hostname: requiredSetting('EDGE_LISTEN_HOST'),
    port: Number(requiredSetting('EDGE_LISTEN_PORT')),
    // The Workbench sends its own heartbeat on the event stream, so idle connections are not cut here.
    idleTimeout: 0,
    fetch: request => forwardToWorkbench(request, addresses),
  });
}
