// Health probes remain available before workspace recovery and never inspect workspace data.
import type { InstanceState } from '../projects/instance-lock';

/** Answers public probes and blocks application traffic until the workspace is serving. */
export function healthResponse(
  request: Request,
  state: InstanceState,
  build: { version?: string | null; commit?: string | null },
): Response | null {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/healthz') {
    return Response.json({
      ok: true,
      version: build.version ?? null,
      commit: build.commit ?? null,
    });
  }
  if (request.method === 'GET' && path === '/readyz') {
    // Hand-over readiness lets the orchestrator stop the old replica while traffic gets 503.
    const ready = state === 'serving' || state === 'handover';
    return Response.json({ ready, state }, { status: ready ? 200 : 503 });
  }
  if (state !== 'serving') {
    return Response.json(
      { error: 'Workspace unavailable', state },
      {
        status: 503,
        headers: { 'Retry-After': '10' },
      },
    );
  }
  return null;
}
