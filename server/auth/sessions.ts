// Holds revocable browser sessions and persists only authenticated ciphertext.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite, sha256 } from '../projects/atomic';
import { isLoopbackHost } from '../config';
import type { Principal } from './principal';

/** Provider credentials retained exclusively on the server. */
export type SessionTokens = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
};
/** A decrypted session with its browser identifier supplied separately from disk. */
export type Session = {
  id: string;
  principal: Principal;
  tokens: SessionTokens;
  csrf: string;
  createdAt: number;
  lastSeenAt: number;
};
/** Persistence, time and lifecycle dependencies of the session store. */
export type SessionOptions = {
  dir: string;
  key: Uint8Array;
  now?: () => number;
  idleHours?: number;
  absoluteHours?: number;
  ended?: (session: Session, reason: string) => void;
};

/** Selects the development cookie exception only for loopback HTTP. */
export function cookieName(publicUrl: string, kind = 'session'): string {
  const url = new URL(publicUrl);
  if (url.protocol === 'https:') return '__Host-sw-' + kind;
  if (url.protocol === 'http:' && isLoopbackHost(url.hostname)) return 'sw-' + kind;
  throw new Error('Session cookies require HTTPS or loopback HTTP.');
}

/** Serializes a host-only cookie with the same restrictions for attempts and sessions. */
export function sessionCookie(id: string, publicUrl: string, kind = 'session', maxAge?: number) {
  const name = cookieName(publicUrl, kind);
  const secure = name.startsWith('__Host-') ? '; Secure' : '';
  const age = maxAge === undefined ? '' : '; Max-Age=' + maxAge;
  return name + '=' + id + secure + '; HttpOnly; SameSite=Lax; Path=/' + age;
}

/** Reads one opaque cookie without accepting ambiguous duplicate names. */
export function readCookie(request: Request, name: string): string | null {
  const values = (request.headers.get('cookie') ?? '')
    .split(';')
    .map(value => value.trim())
    .filter(value => value.startsWith(name + '='));
  return values.length === 1 ? values[0].slice(name.length + 1) : null;
}

/** Tests both lifetime limits without extending either one. */
export function sessionExpired(session: Session, now: number, idle: number, absolute: number) {
  return now - session.lastSeenAt >= idle || now - session.createdAt >= absolute;
}

/** Creates an encrypted store with serialized mutations and explicit revocation listeners. */
export function createSessionStore(options: SessionOptions) {
  const now = options.now ?? Date.now;
  let idle = (options.idleHours ?? 8) * 3600000;
  let absolute = (options.absoluteHours ?? 24) * 3600000;
  const key = crypto.subtle.importKey('raw', new Uint8Array(options.key), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  const records = new Map<string, Session>();
  const listeners = new Map<string, Set<(reason?: 'changed' | 'session-ended') => void>>();
  const pending = new Map<string, Promise<unknown>>();
  const persistedAt = new Map<string, number>();
  function serialize<T>(hash: string, work: () => Promise<T>): Promise<T> {
    const next = (pending.get(hash) ?? Promise.resolve()).then(work);
    const settled = next
      .catch(() => undefined)
      .finally(() => {
        if (pending.get(hash) === settled) pending.delete(hash);
      });
    pending.set(hash, settled);
    return next;
  }
  const path = (hash: string) => join(options.dir, hash + '.json');

  async function persist(hash: string, session: Session) {
    const { id: _id, ...payload } = session;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(hash) },
        await key,
        bytes,
      ),
    );
    atomicWrite(
      path(hash),
      JSON.stringify({
        formatVersion: 1,
        iv: Buffer.from(iv).toString('base64'),
        ciphertext: Buffer.from(encrypted.slice(0, -16)).toString('base64'),
        tag: Buffer.from(encrypted.slice(-16)).toString('base64'),
      }),
    );
    persistedAt.set(hash, session.lastSeenAt);
    records.set(hash, structuredClone(session));
  }

  async function load(hash: string, id = ''): Promise<Session | null> {
    const cached = records.get(hash);
    if (cached) return { ...structuredClone(cached), id };
    if (!existsSync(path(hash))) return null;
    const envelope = JSON.parse(readFileSync(path(hash), 'utf8'));
    if (envelope.formatVersion !== 1) throw new Error('Unsupported session record.');
    const bytes = Buffer.concat([
      Buffer.from(envelope.ciphertext, 'base64'),
      Buffer.from(envelope.tag, 'base64'),
    ]);
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: Buffer.from(envelope.iv, 'base64'),
        additionalData: new TextEncoder().encode(hash),
      },
      await key,
      bytes,
    );
    const payload = JSON.parse(new TextDecoder().decode(decrypted));
    if (
      !Number.isFinite(payload.createdAt) ||
      !Number.isFinite(payload.lastSeenAt) ||
      typeof payload.csrf !== 'string' ||
      typeof payload.principal?.id !== 'string'
    ) {
      throw new Error('Invalid session record.');
    }
    const session = { ...payload, id } as Session;
    persistedAt.set(hash, session.lastSeenAt);
    records.set(hash, session);
    return structuredClone(session);
  }

  async function remove(hash: string, reason: string) {
    const session = await load(hash);
    if (!session) return;
    if (existsSync(path(hash))) unlinkSync(path(hash));
    records.delete(hash);
    persistedAt.delete(hash);
    for (const listener of listeners.get(hash) ?? []) listener();
    listeners.delete(hash);
    try {
      await options.ended?.(session, reason);
    } catch (error) {
      console.error(`[auth] session-ended ${(error as Error).message}`);
    }
  }
  async function get(id: string, touch = true) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return null;
    const hash = sha256(id);
    return serialize(hash, async () => {
      const session = await load(hash, id);
      if (!session) return null;
      if (sessionExpired(session, now(), idle, absolute)) {
        await remove(hash, 'expired');
        return null;
      }
      if (touch) {
        session.lastSeenAt = now();
        records.set(hash, structuredClone(session));
        if (session.lastSeenAt - (persistedAt.get(hash) ?? 0) >= Math.min(60_000, idle / 100)) {
          await persist(hash, session);
        }
      }
      return session;
    });
  }
  async function sweep(principalId?: string) {
    if (!existsSync(options.dir)) return;
    for (const filename of readdirSync(options.dir)) {
      if (!/^[a-f0-9]{64}\.json$/.test(filename)) continue;
      const hash = filename.slice(0, -5);
      await serialize(hash, async () => {
        const session = await load(hash);
        if (!session) return;
        const expired = sessionExpired(session, now(), idle, absolute);
        if (principalId ? session.principal.id === principalId : expired) {
          await remove(hash, principalId ? 'admin' : 'expired');
        }
      });
    }
  }
  // Only the streams of people whose access changed are told to reload and are closed.
  function notifyAccessChanged(principalIds: Iterable<string>) {
    const affected = new Set(principalIds);
    for (const [hash, subscribers] of listeners) {
      const session = records.get(hash);
      if (!session || !affected.has(session.principal.id)) continue;
      for (const listener of subscribers) listener('changed');
      listeners.delete(hash);
    }
  }
  async function list() {
    const result: { principal: string; name: string; createdAt: string; lastSeenAt: string }[] = [];
    if (!existsSync(options.dir)) return result;
    for (const filename of readdirSync(options.dir)) {
      if (!/^[a-f0-9]{64}\.json$/.test(filename)) continue;
      const session = await load(filename.slice(0, -5));
      if (!session || sessionExpired(session, now(), idle, absolute)) continue;
      result.push({
        principal: session.principal.id,
        name: session.principal.name,
        createdAt: new Date(session.createdAt).toISOString(),
        lastSeenAt: new Date(session.lastSeenAt).toISOString(),
      });
    }
    return result;
  }
  return {
    list,
    configure(limits: { idleHours: number; absoluteHours: number }) {
      idle = limits.idleHours * 3600000;
      absolute = limits.absoluteHours * 3600000;
    },
    notifyAccessChanged,
    get,
    sweep: () => sweep(),
    endPrincipal: (principalId: string) => sweep(principalId),
    end: (id: string, reason = 'sign-out') =>
      serialize(sha256(id), () => remove(sha256(id), reason)),
    create: async (input: Pick<Session, 'principal' | 'tokens'>) => {
      const session: Session = {
        ...input,
        id: randomBytes(32).toString('base64url'),
        csrf: randomBytes(32).toString('base64url'),
        createdAt: now(),
        lastSeenAt: now(),
      };
      await persist(sha256(session.id), session);
      return session;
    },
    update: (session: Session) =>
      serialize(sha256(session.id), async () => {
        const hash = sha256(session.id);
        const current = await load(hash);
        if (!current) return false;
        if (sessionExpired(current, now(), idle, absolute)) {
          await remove(hash, 'expired');
          return false;
        }
        session.lastSeenAt = Math.max(session.lastSeenAt, current.lastSeenAt);
        await persist(hash, session);
        return true;
      }),
    subscribe(id: string, listener: (reason?: 'changed' | 'session-ended') => void) {
      const hash = sha256(id);
      const subscribers = listeners.get(hash) ?? new Set();
      subscribers.add(listener);
      if (!records.has(hash)) queueMicrotask(listener);
      listeners.set(hash, subscribers);
      return () => {
        subscribers.delete(listener);
        if (!subscribers.size) listeners.delete(hash);
      };
    },
  };
}
/** Session lifecycle operations shared with routing and live updates. */
export type SessionStore = ReturnType<typeof createSessionStore>;
