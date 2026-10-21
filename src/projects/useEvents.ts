import { useEffect, useRef } from 'react';
// Subscribe to /api/events (contracts/sse-events.md). Events only say what changed; `onChange` refetches.
// EventSource reconnects by itself and sends Last-Event-ID, so missed events are replayed; when the
// server cannot replay it sends `resync`, which also triggers a full refetch.
export const EVENT_TYPES = [
  'files',
  'projects',
  'git',
  'trash',
  'suggestions',
  'drafts',
  'recovery',
  'resync',
] as const;
export function useEvents(onChange: (event: string, data: any) => void) {
  const handler = useRef(onChange);
  handler.current = onChange;
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');
    let opened = false;
    const listeners = EVENT_TYPES.map(type => {
      const listener = (e: MessageEvent) => {
        let data: any = {};
        try {
          data = JSON.parse(e.data);
        } catch {}
        handler.current(type, data);
      };
      source.addEventListener(type, listener as EventListener);
      return [type, listener] as const;
    });
    // After a reconnect, refetch once in case the server restarted with a new event sequence.
    source.onopen = () => {
      if (opened) handler.current('resync', {});
      opened = true;
    };
    return () => {
      for (const [type, listener] of listeners)
        source.removeEventListener(type, listener as EventListener);
      source.close();
    };
  }, []);
}
