// Who owns which panel session, in memory only: create, find by owner, replace, end and sweep what the clock has expired.
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { OperationEffect } from '../auth/operation-inventory';
import { createEventBuffer, type EventBuffer } from './event-buffer';
import { createFrameLink, type FrameLink } from './frame-link';
import { applyEvent, endDueAt, newPanelSession, retentionOver, type EndReason, type PanelSessionState, type SessionEvent } from './panel-session';
import { createVersionRecords, type VersionRecords } from './version-records';

// Letters and digits without the ones people mistake for each other: no I, L, O, 0 or 1.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CONNECTION_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** A question the agent asked that the person has not answered yet. */
export type PendingQuestion = { id: string; agentRequestId: string | number; options: readonly string[]; askedAt: number };
/** The turn that is running, if any. */
export type RunningTurn = { id: string; startedAt: number; cancelled: boolean };

/** One panel session. The timing field changes only through the store's `apply`. */
export type PanelSession = {
  readonly id: string;
  readonly owner: string;
  readonly connection: string;
  readonly scope: readonly OperationEffect[];
  readonly buffer: EventBuffer;
  readonly link: FrameLink;
  readonly versions: VersionRecords;
  readonly pending: Map<string, PendingQuestion>;
  timing: PanelSessionState;
  /** The single-use code the relay presents; removed when used. */
  code?: string;
  agentName?: string;
  turn?: RunningTurn;
};

/** Everything the store needs from outside, so tests control time and randomness. */
export type SessionStoreOptions = {
  now: () => number;
  random?: (length: number) => Uint8Array;
  /** Called once when a session ends, with the reason. */
  onEnded?: (session: PanelSession, reason: EndReason) => void;
};

function pick(alphabet: string, length: number, random: (length: number) => Uint8Array): string {
  // Bytes at or above the largest multiple of the alphabet size are skipped so every letter is equally likely.
  const limit = 256 - (256 % alphabet.length);
  let text = '';
  while (text.length < length) {
    for (const byte of random(length * 2)) {
      if (byte < limit && text.length < length) text += alphabet[byte % alphabet.length];
    }
  }
  return text;
}

function sameText(first: string, second: string): boolean {
  const left = createHash('sha256').update(first).digest();
  const right = createHash('sha256').update(second).digest();
  return timingSafeEqual(left, right);
}

/** Creates the store. Sessions never leave memory. */
export function createSessionStore(options: SessionStoreOptions) {
  const random = options.random ?? ((length: number) => randomBytes(length));
  const sessions = new Map<string, PanelSession>();

  function liveSessionOf(owner: string): PanelSession | undefined {
    for (const session of sessions.values()) if (session.owner === owner && session.timing.state !== 'ended') return session;
    return undefined;
  }

  function end(session: PanelSession, reason: EndReason): void {
    if (session.timing.state === 'ended') return;
    session.timing = applyEvent(session.timing, { type: 'end', reason }, options.now());
    session.code = undefined;
    session.pending.clear();
    options.onEnded?.(session, reason);
  }

  return {
    /** Starts a session for a person. A person with a live session must confirm replacing it. */
    create(input: {
      owner: string;
      scope: readonly OperationEffect[];
      connection?: string;
      confirmReplace?: boolean;
    }): { ok: true; session: PanelSession } | { ok: false; reason: 'needs-confirmation' } {
      const existing = liveSessionOf(input.owner);
      if (existing && !input.confirmReplace) return { ok: false, reason: 'needs-confirmation' };
      if (existing) end(existing, 'replaced');
      const now = options.now();
      const session: PanelSession = {
        id: randomBytes(16).toString('base64url'),
        owner: input.owner,
        connection: input.connection ?? 'acp-' + pick(CONNECTION_ALPHABET, 12, random),
        scope: input.scope,
        buffer: createEventBuffer(),
        link: createFrameLink({ now: options.now }),
        versions: createVersionRecords(),
        pending: new Map(),
        timing: newPanelSession(now),
        code: pick(CODE_ALPHABET, CODE_LENGTH, random),
      };
      sessions.set(session.id, session);
      return { ok: true, session };
    },
    /** The session with this id if this person owns it. Another person's id and an unknown id give the same answer. */
    find(id: string, owner: string): PanelSession | undefined {
      const session = sessions.get(id);
      if (!session) return undefined;
      return sameText(session.owner, owner) ? session : undefined;
    },
    /** The session with this id for the relay, whose own credential decides who it is. */
    findForRelay(id: string): PanelSession | undefined {
      return sessions.get(id);
    },
    /** Uses the code once. A wrong, reused or expired code is refused and leaves the session as it was. */
    consumeCode(session: PanelSession, code: string): boolean {
      const expected = session.code;
      if (expected === undefined || session.timing.state !== 'waiting') return false;
      const matches = sameText(expected, code.toUpperCase());
      if (matches) session.code = undefined;
      return matches;
    },
    apply(session: PanelSession, event: SessionEvent): void {
      if (event.type === 'end') return end(session, event.reason);
      session.timing = applyEvent(session.timing, event, options.now());
    },
    end,
    /** Ends every live session of a person, as sign-out or deactivation does. */
    endAllOf(owner: string, reason: EndReason): void {
      for (const session of sessions.values()) if (session.owner === owner) end(session, reason);
    },
    /** Ends the session of a connection, as revocation does. */
    endConnection(connection: string, reason: EndReason): void {
      for (const session of sessions.values()) if (session.connection === connection) end(session, reason);
    },
    /** Ends what the clock has expired and forgets what was kept long enough. */
    sweep(): void {
      const now = options.now();
      for (const [id, session] of sessions) {
        const due = endDueAt(session.timing, now);
        if (due) end(session, due);
        if (retentionOver(session.timing, now)) {
          session.buffer.clear();
          sessions.delete(id);
        }
      }
    },
    get size(): number {
      return sessions.size;
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
