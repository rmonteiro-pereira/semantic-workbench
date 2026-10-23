// Publishes invalidation events so clients can refetch workspace state. Increasing event IDs allow
// recent events to be replayed after reconnecting.
import { currentReaders, readableEvent, type EventAccess } from './event-access';
import type { IndexedFile } from './suggestions';
import { log } from '../observability/log';
import { recordStreamChange } from '../observability/metrics';
/** Maximum number of recent events retained for reconnecting clients. */
export const RING_SIZE = 1000;
/** Interval between keepalive messages on open event streams. */
export const HEARTBEAT_MS = 15_000;
/** An invalidation event with a monotonically increasing identifier. */
export type WorkbenchEvent = { id: number; event: string; data: unknown; tags: EventTags };
/**
 * Resource and ownership metadata retained for filtering without changing wire payloads.
 * `readers` lists, per removed project, the principals who could read it before its removal.
 */
export type EventTags = { owner?: string; copy?: string; readers?: Record<string, string[]> } & (
  | { audience: 'all'; projects?: never; paths?: never }
  | { audience?: never; projects: string[]; paths?: { project: string; path: string }[] }
  | { audience?: never; projects?: string[]; paths: { project: string; path: string }[] }
);
const frame = (e: WorkbenchEvent) =>
  `id: ${e.id}\nevent: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
/** Ring size, heartbeat and how a suggestion round indexes files and counts for local clients. */
export type EventOptions = {
  ringSize?: number;
  heartbeatMs?: number;
  /** The unrestricted file index that every count in one round narrows. */
  suggestionIndex: () => IndexedFile[];
  /** The open suggestion count shared by clients without a personal scope. */
  sharedSuggestionCount: (index: IndexedFile[]) => number;
};
/** Creates an event hub with bounded replay history and heartbeat support. */
export function createEvents(options: EventOptions) {
  const ringSize = options.ringSize ?? RING_SIZE;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const ring: WorkbenchEvent[] = [];
  let lastId = 0;
  const clients = new Map<(chunk: string) => void, EventAccess | undefined>();
  const pendingCounts = new Set<(chunk: string) => void>();
  const suggestionCounts = new Map<string, number>();
  let sharedCount: number | undefined;
  let suggestionTimer: ReturnType<typeof setTimeout> | undefined;
  // One connection per distinct principal, so each person's count is computed once.
  function distinctReaders() {
    const readers = new Map<string, EventAccess>();
    for (const access of clients.values()) if (access) readers.set(access.owner, access);
    return readers;
  }
  function sendSuggestionCount(owner: string, open: number) {
    const changed = suggestionCounts.get(owner) !== open;
    suggestionCounts.set(owner, open);
    const event: WorkbenchEvent = {
      id: ++lastId,
      event: 'suggestions',
      data: { open },
      tags: { audience: 'all', owner },
    };
    ring.push(event);
    if (ring.length > ringSize) ring.shift();
    for (const [send, receiver] of clients) {
      if (receiver?.owner !== owner || (!changed && !pendingCounts.has(send))) continue;
      send(frame(event));
      pendingCounts.delete(send);
    }
  }
  // Local clients share one count, recorded for replay and sent only when it changes.
  function sendSharedCount(open: number) {
    if (open === sharedCount) return;
    sharedCount = open;
    const event: WorkbenchEvent = {
      id: ++lastId,
      event: 'suggestions',
      data: { open },
      tags: { audience: 'all' },
    };
    ring.push(event);
    if (ring.length > ringSize) ring.shift();
    for (const [send, receiver] of clients) if (!receiver) send(frame(event));
  }
  // The shared count is also kept while nobody is connected, so a local client that reconnects
  // replays the latest one. A hub serving only people skips it.
  function needsSharedCount() {
    const connections = [...clients.values()];
    return !connections.length || connections.some(access => !access);
  }
  // Builds the unrestricted file index once per round; each person's view filters it.
  function refreshSuggestionCounts() {
    const readers = distinctReaders();
    const shared = needsSharedCount();
    if (!readers.size && !shared) return;
    let index: IndexedFile[];
    try {
      index = options.suggestionIndex();
    } catch (error) {
      log.failure('events.suggestion-index-failed', error);
      return;
    }
    if (shared) {
      try {
        sendSharedCount(options.sharedSuggestionCount(index));
      } catch (error) {
        log.failure('events.suggestion-refresh-failed', error);
      }
    }
    for (const [owner, access] of readers) {
      try {
        sendSuggestionCount(owner, access.suggestions?.(index) ?? 0);
      } catch (error) {
        log.failure('events.suggestion-refresh-failed', error, { owner });
      }
    }
  }
  function scheduleSuggestions() {
    clearTimeout(suggestionTimer);
    suggestionTimer = setTimeout(refreshSuggestionCounts, 50);
  }
  // Events after `since`, or null when they are no longer in the ring (the client must resync).
  function replay(since: number): WorkbenchEvent[] | null {
    if (since === lastId) return [];
    if (
      since > lastId ||
      (ring.length && since < ring[0].id - 1) ||
      (!ring.length && since < lastId)
    )
      return null;
    return ring.filter(e => e.id > since);
  }
  // A local client must not replay another person's count.
  function replayable(event: WorkbenchEvent, access: EventAccess | undefined) {
    if (event.event !== 'suggestions') return access ? readableEvent(event, access) : event;
    return access || event.tags.owner ? null : event;
  }
  return {
    /**
     * Publishes an event. A `suggestions` event is only a trigger: the hub counts in a debounced
     * round and sends each client its own count, so the trigger itself is not delivered.
     */
    emit(event: string, data: unknown, tags: EventTags) {
      if (event === 'suggestions') {
        scheduleSuggestions();
        return;
      }
      const e = { id: ++lastId, event, data, tags };
      ring.push(e);
      if (ring.length > ringSize) ring.shift();
      for (const [send, access] of clients) {
        const visible = access ? readableEvent(e, access) : e;
        if (visible) send(frame(visible));
      }
      return e;
    },
    get lastId() {
      return lastId;
    },
    get clientCount() {
      return clients.size;
    },
    replay,
    /** Stops a pending suggestion round, for a workspace that is shutting down. */
    close() {
      clearTimeout(suggestionTimer);
    },
    /**
     * Fixes who may hear of each tagged project before it leaves the registry. Removal events
     * carry the result, because a removed project has no grants left to evaluate on delivery.
     */
    withCurrentReaders(event: string, tags: EventTags): EventTags {
      const connections = [...clients.values()].filter(access => access !== undefined);
      return { ...tags, readers: currentReaders(event, tags, connections) };
    },
    stream(
      req: Request,
      onSessionEnd?: (listener: (reason?: 'changed' | 'session-ended') => void) => () => void,
      access?: EventAccess,
      onAccessChange?: (listener: () => void) => () => void,
    ) {
      const header = req.headers.get('last-event-id');
      const since = header !== null && /^\d+$/.test(header) ? Number(header) : null;
      let send: ((chunk: string) => void) | undefined;
      let timer: ReturnType<typeof setInterval> | undefined;
      let unsubscribe: (() => void) | undefined;
      let unsubscribeAccess: (() => void) | undefined;
      // A stream can be closed by an abort, a cancel and a failed write; it counts out once.
      let counted = false;
      const cleanup = () => {
        if (counted) {
          counted = false;
          recordStreamChange(-1);
        }
        unsubscribe?.();
        unsubscribeAccess?.();
        if (send) {
          clients.delete(send);
          pendingCounts.delete(send);
        }
        if (!clients.size) suggestionCounts.clear();
        if (timer) clearInterval(timer);
      };
      const body = new ReadableStream<Uint8Array>({
        start: controller => {
          const encoder = new TextEncoder();
          send = chunk => {
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch {
              cleanup();
            }
          };
          send(`retry: 2000\n: connected ${lastId}\n\n`);
          if (since !== null) {
            const missed = replay(since);
            if (missed === null)
              send(frame({ id: lastId, event: 'resync', data: {}, tags: { audience: 'all' } }));
            else
              for (const e of missed) {
                const visible = replayable(e, access);
                if (visible) send(frame(visible));
              }
          }
          clients.set(send, access);
          counted = true;
          recordStreamChange(1);
          if (access) {
            pendingCounts.add(send);
            scheduleSuggestions();
          }
          unsubscribeAccess = onAccessChange?.(() => {
            send?.('event: access\ndata: {"reason":"changed"}\n\n');
            cleanup();
            controller.close();
          });
          timer = setInterval(() => send!(': ping\n\n'), heartbeatMs);
          unsubscribe = onSessionEnd?.((reason = 'session-ended') => {
            send?.(`event: access\ndata: ${JSON.stringify({ reason })}\n\n`);
            cleanup();
            controller.close();
          });
          req.signal?.addEventListener('abort', () => {
            cleanup();
            try {
              controller.close();
            } catch {}
          });
        },
        cancel: cleanup,
      });
      return new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Accel-Buffering': 'no',
        },
      });
    },
  };
}
/** Workspace event publisher and server-sent event stream interface. */
export type Events = ReturnType<typeof createEvents>;
