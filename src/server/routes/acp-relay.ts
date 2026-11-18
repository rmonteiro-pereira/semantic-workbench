// The routes the person-run relay uses: hello, frames, stream and bye. They authenticate by the relay's own credential, never by a cookie, and every failure answers 404 with an empty body, so a wrong code, a reused code, an ended session and another person's session cannot be told apart.
import { readBoundedJson } from '../acp/bounded-body';
import { openEventStream } from '../acp/event-stream';
import type { NumberedFrame } from '../acp/frame-link';
import type { PanelService } from '../acp/panel-service';
import { createRateLimiter } from '../auth/rate-limit';
import { AGENT_PANEL_REQUEST_LIMIT, requestSourceIp, type AuditRequest } from '../request';
import type { Route } from './http';

/** Frames in one post. */
const MAXIMUM_FRAMES_PER_POST = 64;
const RELAY_PATH = /^\/api\/acp\/relay\/([A-Za-z0-9_-]{1,64})\/(hello|frames|stream|bye)$/;
/** Requests one source address may make: a relay needs a few a second at most. */
const RELAY_REQUEST_LIMIT = { burst: 300, perSecond: 60 } as const;
/** The only reasons a relay may give when it says goodbye. */
const BYE_REASONS = ['agent-exited', 'closed'] as const;

const missing = () => new Response(null, { status: 404 });

function framesOf(value: unknown): { frames: NumberedFrame[]; acknowledged: number } | null {
  const body = (value ?? {}) as { frames?: unknown; ack?: unknown };
  const list = body.frames === undefined ? [] : body.frames;
  const acknowledged = body.ack === undefined ? 0 : body.ack;
  if (!Array.isArray(list) || list.length > MAXIMUM_FRAMES_PER_POST || !Number.isInteger(acknowledged) || (acknowledged as number) < 0) return null;
  const frames: NumberedFrame[] = [];
  for (const item of list) {
    const { seq, payload } = (item ?? {}) as { seq?: unknown; payload?: unknown };
    if (!Number.isInteger(seq) || (seq as number) < 1 || typeof payload !== 'string') return null;
    frames.push({ seq: seq as number, payload });
  }
  return { frames, acknowledged: acknowledged as number };
}

/** Creates the routes. `now` only feeds the request limit. */
export function createAcpRelayRoutes(service: PanelService, options: { now?: () => number; keepOpen?: (request: Request) => void } = {}): Route {
  const limiter = createRateLimiter(RELAY_REQUEST_LIMIT, options.now);

  return async (_workspace, request, url) => {
    const match = RELAY_PATH.exec(url.pathname);
    if (!match) return null;
    const [, sessionId, action] = match;
    // A relay is not a browser, so any Origin header at all marks the request as foreign.
    if (request.headers.get('origin') !== null) return missing();
    const source = (request as AuditRequest)[requestSourceIp] ?? 'unknown';
    if (!limiter.take(source).allowed) return new Response(null, { status: 429, headers: { 'Retry-After': '1' } });
    const expectedMethod = action === 'stream' ? 'GET' : 'POST';
    if (request.method !== expectedMethod) return missing();
    const found = await service.relayFor(request, sessionId);
    if (!found) return missing();

    // Until the relay has presented its code, nothing but the hello is served.
    if (action !== 'hello' && found.session.code !== undefined) return missing();

    if (action === 'stream') {
      options.keepOpen?.(request);
      const lastSeen = Number(request.headers.get('Last-Event-ID') ?? url.searchParams.get('after') ?? 0);
      let detach = () => {};
      const stream = openEventStream(request.signal, () => detach());
      detach = found.live.attachRelay(
        { send: frame => stream.send({ id: frame.seq, name: 'frame', data: frame.payload }), close: () => stream.close() },
        Number.isInteger(lastSeen) && lastSeen >= 0 ? lastSeen : 0,
      );
      return stream.response;
    }

    const body = await readBoundedJson(request, AGENT_PANEL_REQUEST_LIMIT);
    if (!body.ok) return new Response(null, { status: body.status });
    if (action === 'hello') {
      const code = (body.value as { code?: unknown } | null)?.code;
      if (typeof code !== 'string' || !service.hello(found, code)) return missing();
      found.live.ping();
      return Response.json({ received: found.session.link.lastReceived });
    }
    if (action === 'bye') {
      const reason = (body.value as { reason?: unknown } | null)?.reason;
      if (!BYE_REASONS.includes(reason as (typeof BYE_REASONS)[number])) return new Response(null, { status: 400 });
      service.end(found.session, reason === 'closed' ? 'closed' : 'agent-exited');
      return Response.json({});
    }
    const posted = framesOf(body.value);
    if (!posted) return new Response(null, { status: 400 });
    const delivery = found.live.deliver(posted.frames, posted.acknowledged);
    return Response.json({ received: delivery.received }, { status: delivery.ok ? 200 : 409 });
  };
}
