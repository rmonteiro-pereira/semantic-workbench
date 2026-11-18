// Memory-only stores for what is valid for minutes: authorization requests waiting for a decision, one-use codes, and one-use setup credentials. Codes and credentials are held only as keyed hashes. A restart loses all of it, which only means a program starts again.
import type { Scope } from './scopes';
import { keyedHash, sameHash, newConnectionId, newToken } from './token-keys';

/** Which transport a connection was created for. A relay of the agent panel uses `acp`. */
export type ConnectionOrigin = 'mcp' | 'acp';

/** How long an authorization request waits for the person. The same as a sign-in attempt, which lasts ten minutes. */
export const PENDING_REQUEST_LIFETIME_MS = 10 * 60_000;
/** How long a code can be traded. Assumed: the standard asks for a short code, and a minute is enough to finish a redirect. */
export const CODE_LIFETIME_MS = 60_000;
/** How long a setup credential can be traded. Assumed: enough to copy it to another machine and start the bridge. */
export const SETUP_CREDENTIAL_LIFETIME_MS = 10 * 60_000;
/** The most authorization requests held at once. Assumed; the oldest are dropped first. */
export const MAX_PENDING_REQUESTS = 1_000;
/** The most codes and setup credentials held at once, spent ones included. Assumed; the oldest are dropped first. */
export const MAX_ISSUED_GRANTS = 5_000;
/** Prefix that lets a person or a log scanner recognise a setup credential. */
export const SETUP_CREDENTIAL_PREFIX = 'swsetup_';

/** An authorization request that passed validation. */
export type PendingRequest = {
  id: string;
  clientId: string;
  redirectUri: string;
  scopes: Scope[];
  state?: string;
  codeChallenge: string;
  resource: string;
  sessionReference: string;
  expiresAt: number;
};

/** What a code or setup credential is bound to. */
export type GrantBinding = {
  kind: 'code' | 'setup';
  clientId: string;
  /** Present for a code only. */
  redirectUri?: string;
  scopes: Scope[];
  resource: string;
  /** Present for a code only. */
  codeChallenge?: string;
  person: string;
  sessionReference: string;
  origin: ConnectionOrigin;
};

type StoredGrant = { hash: string; binding: GrantBinding; expiresAt: number; spent: boolean; replayed?: boolean; connectionId?: string };

/** The result of presenting a code or setup credential. */
export type GrantPresentation =
  | { state: 'fresh'; binding: GrantBinding; attachConnection: (connectionId: string) => boolean }
  | { state: 'replayed'; binding: GrantBinding; connectionId?: string }
  | { state: 'unknown' };

/** Pure decision on a stored grant at one moment: a live unspent grant is fresh, a live spent one is a replay, anything else is unknown. */
export function presentationOf(stored: Pick<StoredGrant, 'spent' | 'expiresAt'> | undefined, now: number): 'fresh' | 'replayed' | 'unknown' {
  if (!stored || stored.expiresAt <= now) return 'unknown';
  return stored.spent ? 'replayed' : 'fresh';
}

/** Memory stores with an injected clock and key. */
export function createPendingGrants(options: { key: Uint8Array; now?: () => number }) {
  const now = options.now ?? Date.now;
  const requests = new Map<string, PendingRequest>();
  const grants = new Map<string, StoredGrant>();

  function dropExpired<Value extends { expiresAt: number }>(store: Map<string, Value>) {
    for (const [id, value] of store) if (value.expiresAt <= now()) store.delete(id);
  }
  function dropOldest(store: Map<string, unknown>, limit: number) {
    // A map keeps insertion order, so the first key is the oldest entry.
    while (store.size > limit) store.delete(store.keys().next().value!);
  }

  return {
    /** Holds a validated request and returns its id, which the consent form carries. */
    createRequest(request: Omit<PendingRequest, 'id' | 'expiresAt'>): PendingRequest {
      dropExpired(requests);
      const stored: PendingRequest = { ...request, id: newConnectionId(), expiresAt: now() + PENDING_REQUEST_LIFETIME_MS };
      requests.set(stored.id, stored);
      dropOldest(requests, MAX_PENDING_REQUESTS);
      return stored;
    },
    /** Reads a request without using it, for showing the page again. A request of another session is not shown. */
    peekRequest(id: string, sessionReference: string): PendingRequest | null {
      const found = requests.get(id);
      if (!found || found.expiresAt <= now() || found.sessionReference !== sessionReference) return null;
      return found;
    },
    /** Takes a request for a decision. It can be taken once, and only by the session that opened it. */
    takeRequest(id: string, sessionReference: string): PendingRequest | null {
      const found = this.peekRequest(id, sessionReference);
      if (found) requests.delete(id);
      return found;
    },
    /** Removes the requests of a client, for example after the Admin removed the program. */
    dropRequestsOfClient(clientId: string): void {
      for (const [id, request] of requests) if (request.clientId === clientId) requests.delete(id);
    },
    /** Issues a code or setup credential and returns its value, which only the caller ever sees. */
    issue(binding: GrantBinding): { value: string; expiresAt: number } {
      dropExpired(grants);
      const value = binding.kind === 'setup' ? newToken(SETUP_CREDENTIAL_PREFIX) : newToken();
      const lifetime = binding.kind === 'setup' ? SETUP_CREDENTIAL_LIFETIME_MS : CODE_LIFETIME_MS;
      const expiresAt = now() + lifetime;
      const hash = keyedHash(options.key, value);
      grants.set(hash, { hash, binding, expiresAt, spent: false });
      dropOldest(grants, MAX_ISSUED_GRANTS);
      return { value, expiresAt };
    },
    /** Spends a presented value. The first presentation is fresh whatever happens next, and a later one is a replay until the value would have expired anyway. */
    present(value: string): GrantPresentation {
      const hash = keyedHash(options.key, value);
      const stored = grants.get(hash);
      if (!sameHash(hash, stored?.hash ?? '')) return { state: 'unknown' };
      const state = presentationOf(stored, now());
      if (!stored || state === 'unknown') return { state: 'unknown' };
      if (state === 'replayed') {
        stored.replayed = true;
        return { state: 'replayed', binding: stored.binding, connectionId: stored.connectionId };
      }
      stored.spent = true;
      return {
        state: 'fresh',
        binding: stored.binding,
        attachConnection: connectionId => {
          stored.connectionId = connectionId;
          return !stored.replayed && grants.get(hash) === stored;
        },
      };
    },
    /** Forgets everything bound to a session that ended. */
    dropSession(sessionReference: string): void {
      for (const [id, request] of requests) if (request.sessionReference === sessionReference) requests.delete(id);
      for (const [hash, stored] of grants) if (stored.binding.sessionReference === sessionReference) grants.delete(hash);
    },
    sizes: () => ({ requests: requests.size, grants: grants.size }),
  };
}

export type PendingGrants = ReturnType<typeof createPendingGrants>;
