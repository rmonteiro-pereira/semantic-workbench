// The browser's routes for the agent panel: start a session, follow its events, send a prompt, cancel, answer a question and end it. The browser is a view; these routes never carry the agent's own file traffic.
import { readBoundedJson } from '../acp/bounded-body';
import { openEventStream } from '../acp/event-stream';
import type { PanelService } from '../acp/panel-service';
import { requestScope, requestSession, type AccessRequest } from '../auth/request-scope';
import { AGENT_PANEL_REQUEST_LIMIT } from '../request';
import type { Route } from './http';

/** Largest body any panel route reads. A prompt of 100,000 bytes can grow when its text is escaped in JSON. */
const PANEL_BODY_LIMIT = AGENT_PANEL_REQUEST_LIMIT;
const SESSION_PATH = /^\/api\/acp\/sessions(?:\/([A-Za-z0-9_-]{1,64}))?(?:\/(events|prompt|cancel)|\/questions\/([A-Za-z0-9_-]{1,64}))?$/;

const notFound = () => Response.json({ error: 'Not found.' }, { status: 404 });
const refuse = (status: number, error: string) => Response.json({ error }, { status });

/** A browser write must carry the page's own marker and must not come from another site. */
function crossSite(request: Request): boolean {
  if (request.method === 'GET') return false;
  return request.headers.get('X-SW-Request') !== '1' || request.headers.get('Sec-Fetch-Site') === 'cross-site';
}

function lastEventNumber(request: Request, url: URL): number {
  const value = Number(request.headers.get('Last-Event-ID') ?? url.searchParams.get('after') ?? 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function choiceOf(value: { option?: unknown; cancel?: unknown } | null): { option: string } | { cancel: true } | null {
  if (typeof value?.option === 'string') return { option: value.option };
  if (value?.cancel === true) return { cancel: true };
  return null;
}

/** Creates the routes. Every route answers for the signed-in person only, and another person's session as an unknown one. */
export function createAcpPanelRoutes(service: PanelService, options: { keepOpen?: (request: Request) => void } = {}): Route {
  async function start(request: Request): Promise<Response> {
    const body = await readBoundedJson(request, PANEL_BODY_LIMIT);
    const confirmReplace = body.ok && typeof body.value === 'object' && body.value !== null && (body.value as { confirmReplace?: unknown }).confirmReplace === true;
    const scope = requestScope(request);
    const started = await service.start({ principal: scope.principal, session: (request as AccessRequest)[requestSession], confirmReplace });
    return started.ok ? Response.json(started.session, { status: 201 }) : refuse(started.status, started.error);
  }

  function events(request: Request, url: URL, found: NonNullable<ReturnType<PanelService['liveFor']>>): Response {
    options.keepOpen?.(request);
    let stop = () => {};
    const stream = openEventStream(request.signal, () => stop());
    const watching = found.live.watch(
      {
        send: batch => {
          for (const event of batch) stream.send({ id: event.seq, name: 'panel', data: JSON.stringify(event) });
        },
        close: () => stream.close(),
      },
      lastEventNumber(request, url),
    );
    stop = watching.unwatch;
    if (found.session.timing.state === 'ended') stream.close();
    return stream.response;
  }

  async function prompt(request: Request, found: NonNullable<ReturnType<PanelService['liveFor']>>): Promise<Response> {
    const body = await readBoundedJson(request, PANEL_BODY_LIMIT);
    if (!body.ok) return refuse(body.status, body.status === 413 ? 'The request is too large.' : 'Send the prompt as JSON.');
    const { text, files } = (body.value ?? {}) as { text?: unknown; files?: unknown };
    const attachments = files === undefined ? [] : files;
    if (typeof text !== 'string' || !text.trim() || !Array.isArray(attachments) || attachments.some(item => typeof item !== 'string')) return refuse(400, 'Write a prompt first.');
    const result = found.live.conversation.prompt(text, attachments as string[]);
    if (result.ok) return Response.json({ accepted: true }, { status: 202 });
    if (result.reason === 'too-long') return refuse(413, 'The prompt is too long or has too many files.');
    if (result.reason === 'bad-attachment') return refuse(400, 'One of the attached files is not available.');
    return refuse(409, result.reason === 'busy' ? 'The agent is already working on a request.' : 'The agent is not connected.');
  }

  async function answer(request: Request, found: NonNullable<ReturnType<PanelService['liveFor']>>, questionId: string): Promise<Response> {
    const body = await readBoundedJson(request, PANEL_BODY_LIMIT);
    const value = body.ok ? (body.value as { option?: unknown; cancel?: unknown } | null) : null;
    const choice = choiceOf(value);
    if (!choice) return refuse(400, 'Choose one of the offered options.');
    const result = found.live.conversation.answer(questionId, choice);
    if (result === 'unknown-question') return notFound();
    return result === 'answered' ? Response.json({ answered: true }) : refuse(400, 'Choose one of the offered options.');
  }

  return async (_workspace, request, url) => {
    const match = SESSION_PATH.exec(url.pathname);
    if (!match) return null;
    const [, sessionId, action, questionId] = match;
    const isCollection = sessionId === undefined;
    if (isCollection && request.method !== 'POST') return null;
    if (crossSite(request)) return refuse(403, 'This request did not come from the workbench page.');
    if (isCollection) return start(request);
    const found = service.liveFor(sessionId, requestScope(request).principal.id);
    if (!found) return notFound();
    if (action === 'events' && request.method === 'GET') return events(request, url, found);
    if (action === 'prompt' && request.method === 'POST') return prompt(request, found);
    if (action === 'cancel' && request.method === 'POST') {
      found.live.conversation.cancel();
      return Response.json({ cancelled: true });
    }
    if (questionId && request.method === 'POST') return answer(request, found, questionId);
    if (!action && !questionId && request.method === 'DELETE') {
      service.end(found.session, 'closed');
      return Response.json({ ended: true });
    }
    return null;
  };
}
