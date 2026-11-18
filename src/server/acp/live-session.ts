// The running side of one session: the conversation, the open browser tabs and the relay's event stream. It moves numbered frames and numbered events to whoever is listening.
import { createConversation, type ConversationDependencies } from './conversation';
import type { NumberedFrame } from './frame-link';
import type { PanelEvent } from './panel-events';
import type { EndReason } from './panel-session';

/** Someone listening for panel events, such as one browser tab. */
export type EventListener = { send(events: PanelEvent[]): void; close(): void };
/** The relay's stream of frames for the agent. */
export type FrameListener = { send(frame: NumberedFrame): void; close(): void };

/** What happened to frames the relay posted. */
export type FrameDelivery = { ok: true; received: number } | { ok: false; reason: 'gap'; received: number };

/** Creates the running side of a session. The session store keeps the facts; this keeps the connections. */
export function createLiveSession(dependencies: Omit<ConversationDependencies, 'publish' | 'sendToAgent'>) {
  const { session } = dependencies;
  const browsers = new Set<EventListener>();
  const relays = new Set<FrameListener>();

  const conversation = createConversation({
    ...dependencies,
    publish: events => {
      for (const listener of browsers) listener.send(events);
    },
    sendToAgent: line => {
      const sent = session.link.send(line);
      if (!sent.ok) return false;
      for (const listener of relays) listener.send(sent.frame);
      return true;
    },
  });

  function relayHeard(): void {
    session.link.heard();
    dependencies.store.apply(session, { type: 'link-restored' });
  }

  return {
    conversation,
    /** Lets a browser tab listen. It first receives what it missed after `lastSeq`. */
    watch(listener: EventListener, lastSeq: number): { unwatch(): void; gap: boolean } {
      const caught = session.buffer.since(lastSeq);
      if (caught.events.length > 0) listener.send(caught.events);
      browsers.add(listener);
      return { unwatch: () => browsers.delete(listener), gap: caught.gap };
    },
    /** Lets the relay listen for frames after the last one it saw, and counts the request as proof of life. */
    attachRelay(listener: FrameListener, lastSeen: number): () => void {
      relayHeard();
      session.link.acknowledge(lastSeen);
      for (const frame of session.link.replayAfter(lastSeen)) listener.send(frame);
      relays.add(listener);
      return () => relays.delete(listener);
    },
    /** Takes the frames the relay posted, in order. A repeated frame is dropped and a skipped one is reported with the number the workbench has. */
    deliver(frames: readonly NumberedFrame[], acknowledged: number): FrameDelivery {
      relayHeard();
      session.link.acknowledge(acknowledged);
      for (const frame of frames) {
        const result = session.link.accept(frame.seq);
        if (result === 'gap') return { ok: false, reason: 'gap', received: session.link.lastReceived };
        if (result === 'accepted') conversation.receive(frame.payload);
      }
      return { ok: true, received: session.link.lastReceived };
    },
    /** Notes a ping from the relay. */
    ping(): number {
      relayHeard();
      return session.link.lastReceived;
    },
    /** Marks the link lost when the relay has been silent too long. The session ends later if the relay does not return. */
    checkLink(): void {
      if (session.timing.state !== 'waiting' && session.link.lost()) dependencies.store.apply(session, { type: 'link-lost' });
    },
    /** Ends the conversation and closes every listener. */
    close(reason: EndReason): void {
      conversation.close(reason);
      for (const listener of [...browsers, ...relays]) listener.close();
      browsers.clear();
      relays.clear();
    },
  };
}

export type LiveSession = ReturnType<typeof createLiveSession>;
