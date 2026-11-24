// A bounded catch-up buffer of panel events, so a reloaded tab can continue from the last event it saw.
import type { PanelEvent, PanelEventBody } from './panel-events';

/** Most events kept, and most bytes of their text. */
export const EVENT_BUFFER_LIMITS = { events: 500, bytes: 4 * 1024 * 1024 } as const;

/** What a reader gets back: the events after its last one, and whether some it never saw were dropped. */
export type CatchUp = { events: PanelEvent[]; gap: boolean };

/** Keeps the newest events within both limits. The newest event is always kept whole, even when it alone exceeds the byte limit. */
export function createEventBuffer(limits: { events: number; bytes: number } = EVENT_BUFFER_LIMITS) {
  const kept: { event: PanelEvent; bytes: number }[] = [];
  let totalBytes = 0;
  let nextSeq = 1;
  // The overflow notice is kept apart so later drops never remove it.
  let overflowNotice: PanelEvent | undefined;

  function number(body: PanelEventBody): { event: PanelEvent; bytes: number } {
    const event = { ...body, seq: nextSeq } as PanelEvent;
    nextSeq += 1;
    return { event, bytes: Buffer.byteLength(JSON.stringify(event)) };
  }
  function push(entry: { event: PanelEvent; bytes: number }) {
    kept.push(entry);
    totalBytes += entry.bytes;
  }
  function dropOldest(): boolean {
    let dropped = false;
    while (kept.length > 1 && (kept.length > limits.events || totalBytes > limits.bytes)) {
      totalBytes -= kept.shift()!.bytes;
      dropped = true;
    }
    return dropped;
  }

  return {
    /** Numbers and stores an event. Returns every event to send live: the event, then one notice the first time anything is dropped. */
    append(body: PanelEventBody): PanelEvent[] {
      const entry = number(body);
      push(entry);
      const sent = [entry.event];
      if (dropOldest() && !overflowNotice) {
        overflowNotice = number({ type: 'notice', text: 'Earlier events were dropped to keep the conversation within its size limit.' }).event;
        sent.push(overflowNotice);
      }
      return sent;
    },
    /** The events after `lastSeq` (0 for all), with a flag when events between were dropped. */
    since(lastSeq: number): CatchUp {
      const oldest = kept[0]?.event.seq ?? nextSeq;
      const events = kept.filter(entry => entry.event.seq > lastSeq).map(entry => entry.event);
      if (overflowNotice && overflowNotice.seq > lastSeq) events.push(overflowNotice);
      events.sort((first, second) => first.seq - second.seq);
      return { events, gap: lastSeq + 1 < oldest };
    },
    /** The number of the last event, or 0. */
    get lastSeq(): number {
      return nextSeq - 1;
    },
    get size(): { events: number; bytes: number } {
      return { events: kept.length, bytes: totalBytes };
    },
    /** Forgets everything, as when an ended session's retention is over. */
    clear(): void {
      kept.length = 0;
      totalBytes = 0;
      overflowNotice = undefined;
    },
  };
}

export type EventBuffer = ReturnType<typeof createEventBuffer>;
