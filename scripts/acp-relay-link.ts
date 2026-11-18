// The relay's two-way link to the workbench: it posts the agent's numbered output, follows the workbench's numbered stream, and picks up where it left off after a break. It opens no port and never prints its credential.
import { parseEventStream } from './acp-event-parser';

/** How long a silent link waits before it posts an empty frame list as proof of life. */
export const HEARTBEAT_MS = 15_000;
/** How long the relay keeps trying before it gives up on the workbench. */
export const GIVE_UP_AFTER_MS = 120_000;
const RETRY_PAUSE_MS = 1_000;

/** What the link needs: where to go, how to prove who it is, and where the agent's lines go. */
export type RelayLinkOptions = {
  baseUrl: string;
  sessionId: string;
  code: string;
  /** The bearer value for each request. Local mode reads a file every time; server mode returns the exchanged token. */
  bearer: () => string;
  /** Writes one line to the agent's input. */
  toAgent: (line: string) => void;
  /** Called once when the link ends for good, with a sentence for the person. */
  onEnded: (message: string) => void;
  fetch?: typeof fetch;
  heartbeatMs?: number;
};

type PostedFrame = { seq: number; payload: string };

/** Starts the link. `send` takes one line the agent wrote. `stop` ends the link and tells the workbench why. */
export function startRelayLink(options: RelayLinkOptions) {
  const request = options.fetch ?? fetch;
  const base = `${options.baseUrl}/api/acp/relay/${options.sessionId}`;
  const unacknowledged: PostedFrame[] = [];
  let outboundSeq = 0;
  let lastSeen = 0;
  let ended = false;
  let posting = false;
  let wake: (() => void) | undefined;
  const headers = () => ({ 'content-type': 'application/json', authorization: `Bearer ${options.bearer()}` });

  function finish(message: string): void {
    if (ended) return;
    ended = true;
    wake?.();
    options.onEnded(message);
  }

  async function post(path: string, body: unknown): Promise<Response> {
    return request(`${base}/${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  }

  async function flush(): Promise<void> {
    if (posting) return;
    posting = true;
    try {
      const deadline = Date.now() + GIVE_UP_AFTER_MS;
      while (!ended) {
        let response: Response;
        try {
          response = await post('frames', { frames: unacknowledged.slice(0, 32), ack: lastSeen });
        } catch {
          if (Date.now() > deadline) return finish('The workbench is not reachable. The session was closed.');
          await new Promise(resolve => setTimeout(resolve, RETRY_PAUSE_MS));
          continue;
        }
        if (response.status === 404) return finish('The workbench ended the session, or it was restarted.');
        const received = response.ok || response.status === 409 ? ((await response.json()) as { received: number }).received : 0;
        while (unacknowledged.length > 0 && unacknowledged[0].seq <= received) unacknowledged.shift();
        if (unacknowledged.length === 0) return;
        if (response.status === 413 || response.status === 400) return finish('The workbench refused a message from the agent.');
      }
    } finally {
      posting = false;
    }
  }

  async function follow(): Promise<void> {
    let failingSince: number | undefined;
    while (!ended) {
      try {
        const response = await request(`${base}/stream`, { headers: { ...headers(), 'last-event-id': String(lastSeen) } });
        if (response.status === 404) return finish('The workbench ended the session, or it was restarted.');
        if (!response.ok || !response.body) throw new Error('stream refused');
        failingSince = undefined;
        for await (const event of parseEventStream(response.body)) {
          if (event.id === undefined || event.id <= lastSeen) continue;
          lastSeen = event.id;
          options.toAgent(event.data);
        }
        if (ended) return;
        // The stream closing with the session still alive is a break; a 404 on the next request says if the session ended.
      } catch {
        failingSince ??= Date.now();
        if (Date.now() - failingSince > GIVE_UP_AFTER_MS) return finish('The workbench is not reachable. The session was closed.');
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_PAUSE_MS));
    }
  }

  async function heartbeat(): Promise<void> {
    while (!ended) {
      await new Promise<void>(resolve => {
        wake = resolve;
        setTimeout(resolve, options.heartbeatMs ?? HEARTBEAT_MS);
      });
      if (!ended && unacknowledged.length === 0) void flush();
    }
  }

  return {
    /** Presents the code once. Resolves true when the workbench accepted it. */
    async hello(): Promise<boolean> {
      try {
        const response = await post('hello', { code: options.code });
        if (!response.ok) return false;
        void follow();
        void heartbeat();
        return true;
      } catch {
        return false;
      }
    },
    /** Numbers one line from the agent and posts it. */
    send(line: string): void {
      outboundSeq += 1;
      unacknowledged.push({ seq: outboundSeq, payload: line });
      void flush();
    },
    /** Says goodbye and stops. The reason is `agent-exited` when the agent ended, `closed` when the person interrupted. */
    async stop(reason: 'agent-exited' | 'closed'): Promise<void> {
      if (ended) return;
      await flushQuietly(flush);
      try {
        await post('bye', { reason });
      } catch {
        /* The workbench may already be gone. */
      }
      ended = true;
      wake?.();
    },
  };
}

async function flushQuietly(flush: () => Promise<void>): Promise<void> {
  try {
    await Promise.race([flush(), new Promise(resolve => setTimeout(resolve, 3_000))]);
  } catch {
    /* A failed last post only loses the final lines. */
  }
}
