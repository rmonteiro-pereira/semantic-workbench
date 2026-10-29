/** Subscribes to workspace change notifications and requests refreshed state after reconnects. */
import { useEffect, useRef, useState } from 'react';
import { reloadForAccessChange } from './api';
// Events describe changes, so the callback refetches state. EventSource replays missed events
// using Last-Event-ID; if replay is unavailable, resync requests a full refresh.
export const EVENT_TYPES = [
  'files',
  'projects',
  'git',
  'trash',
  'suggestions',
  'drafts',
  'recovery',
  'clone',
  'identity',
  // Server mode: the default branch moved, so the published state and branch lists changed.
  'published',
  'resync',
  'access',
] as const;
/** Subscribes to workspace events and reports whether updates can currently arrive. */
export function useEvents(onChange: (event: string, data: any) => void) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onChange);
  handler.current = onChange;
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');
    let opened = false;
    const listeners = EVENT_TYPES.map(type => {
      const listener = (messageEvent: MessageEvent) => {
        let data: any = {};
        try {
          data = JSON.parse(messageEvent.data);
        } catch {}
        if (type === 'access') {
          source.close();
          reloadForAccessChange();
          return;
        }
        handler.current(type, data);
      };
      source.addEventListener(type, listener as EventListener);
      return [type, listener] as const;
    });
    // After a reconnect, refetch once in case the server restarted with a new event sequence.
    source.onopen = () => {
      setConnected(true);
      if (opened) handler.current('resync', {});
      opened = true;
    };
    source.onerror = () => setConnected(false);
    return () => {
      for (const [type, listener] of listeners) source.removeEventListener(type, listener as EventListener);
      source.close();
    };
  }, []);
  return connected;
}
