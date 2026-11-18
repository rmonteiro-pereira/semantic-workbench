// Issues, refreshes, resolves and ends connections. This is the one place that ends them: the session end signal, the sweep, the revocation routes, a registration change and replay detection all come here. The service knows no HTTP and no MCP; the agent panel creates its own connections through the same functions.
import { mintCaller, type Caller } from '../auth/caller';
import type { Principal } from '../auth/principal';
import type { Session, SessionEndListener } from '../auth/sessions';
import { sha256 } from '../projects/atomic';
import { createConnectionEvents, type ConnectionEvents } from './connection-events';
import type { ConnectionRecord, ConnectionStore, EndReason } from './connection-store';
import { ENDED_RETENTION_MS } from './connection-store';
import {
  accessTokenLive,
  connectionCallerOrigin,
  endAuditAction,
  endConnection,
  endReasonForSession,
  registrationEndReason,
  rotateTokens,
  startConnection,
  viewOf,
  type ConnectionView,
  ACCESS_TOKEN_LIFETIME_MS,
} from './connection-transitions';
import type { ConnectionOrigin, GrantBinding, PendingGrants } from './pending-grants';
import { verifyS256 } from './pkce';
import { findProgram, type ProgramsFile } from './programs';
import { effectsOf, type Scope } from './scopes';
import { keyedHash, newConnectionId, newToken } from './token-keys';
import type { AuditLog } from '../auth/audit';

/** How many live connections one person may hold. Assumed: a few programs on a few machines, and a bound on what the store holds. */
export const MAX_LIVE_CONNECTIONS_PER_PERSON = 10;
/** The least time between two writes of a connection's last-used time. The same limit applies to a session's last-seen time. */
export const LAST_USED_WRITE_INTERVAL_MS = 60_000;

/** The connection time a token response reports, in seconds. */
export const ACCESS_TOKEN_SECONDS = ACCESS_TOKEN_LIFETIME_MS / 1000;

/** Everything the service needs from the rest of the server. */
export type ConnectionServiceDependencies = {
  store: ConnectionStore;
  grants: PendingGrants;
  /** The key of the keyed hash, derived from the session secret. */
  key: Uint8Array;
  sessions: {
    getByReference: (reference: string) => Promise<Session | null>;
    onEnded: (listener: SessionEndListener) => () => void;
  };
  /** The person's current roles and grants. It must not contact the identity provider. */
  principalFor: (principal: Principal) => Principal;
  programs: () => ProgramsFile;
  audit: AuditLog;
  /** The one resource address tokens are bound to. */
  resource: string;
  now?: () => number;
};

/** The tokens of a successful trade or refresh. The values are shown to the program once. */
export type IssuedTokens = { accessToken: string; refreshToken: string; expiresInSeconds: number; scope: string };

/** Why a request was refused. It goes to the audit log and never to the caller, who gets one answer for every reason. */
export type RefusalReason =
  | 'unknown-credential'
  | 'replayed-credential'
  | 'binding-mismatch'
  | 'verifier-mismatch'
  | 'program-not-registered'
  | 'session-ended'
  | 'no-access'
  | 'connection-limit'
  | 'connection-ended'
  | 'wrong-credential-kind';
export type TokenOutcome = { ok: true; tokens: IssuedTokens; connection: string } | { ok: false; reason: RefusalReason };

/** What the caller of `resolve` receives. */
export type ResolvedConnection = { ok: true; caller: Caller; connection: string } | { ok: false };

/** What a listener hears when a connection ends. */
export type ConnectionEnded = { connectionId: string; reason: EndReason; origin: ConnectionOrigin; person: string; clientId: string };

/** The inputs of the trade of an authorization code. */
export type CodeTrade = { code: string; clientId: string; redirectUri: string; codeVerifier: string; resource: string };
/** The inputs of the trade of a setup credential. */
export type SetupTrade = { setupCredential: string; clientId: string; resource: string };
/** The inputs of a refresh. */
export type RefreshTrade = { refreshToken: string; clientId: string; resource: string };

/** What a creator such as the agent panel asks for. */
export type SessionConnectionRequest = { session: Session; clientId: string; scopes: Scope[]; origin?: ConnectionOrigin };
export type SessionConnectionResult = { ok: true; credential: string; expiresAt: number } | { ok: false; reason: 'program-not-registered' | 'scope-not-allowed' | 'no-access' | 'connection-limit' };

/** What the Admin screen shows of a proposed registration change. */
export type ProgramChangePreview = {
  added: { clientId: string; name: string }[];
  changed: { clientId: string; name: string }[];
  removed: { clientId: string; name: string }[];
  /** Programs whose live connections the change would end, with the count. */
  endings: { clientId: string; name: string; connections: number }[];
};

/** The reference of a session: the hash of its id, which is what every other record keeps. */
export function sessionReferenceOf(sessionId: string): string {
  return sha256(sessionId);
}

export function createConnectionService(dependencies: ConnectionServiceDependencies) {
  const { store, grants, key, sessions } = dependencies;
  const now = dependencies.now ?? Date.now;
  const events = createConnectionEvents(dependencies.audit);
  const endListeners = new Set<(ended: ConnectionEnded) => void>();
  const endControllers = new Map<string, AbortController>();

  function liveConnections(person: string): number {
    return store.all().filter(record => record.person === person && record.state === 'active').length;
  }

  function announceEnd(record: ConnectionRecord, reason: EndReason) {
    endControllers.get(record.id)?.abort();
    endControllers.delete(record.id);
    const ended: ConnectionEnded = { connectionId: record.id, reason, origin: record.origin, person: record.person, clientId: record.clientId };
    for (const listener of endListeners) {
      try {
        listener(ended);
      } catch {
        // A listener that fails must not keep the others from hearing that the connection ended.
      }
    }
  }

  /** Replay is noticed at a token request, so it carries the connection's own transport; every other end is the browser's or the server's. */
  function endedByAProgram(reason: EndReason): boolean {
    return reason === 'replay' || reason === 'code-reuse';
  }

  /** Ends one connection. Ending twice does nothing, so every path may call it. */
  function end(connectionId: string, reason: EndReason): boolean {
    const record = store.get(connectionId);
    if (!record || record.state === 'ended') return false;
    const ended = endConnection(record, reason, now());
    store.save(ended);
    events.record({
      action: endAuditAction(reason),
      origin: endedByAProgram(reason) ? connectionCallerOrigin(record.origin) : 'http',
      outcome: 'ok',
      connection: record.id,
      person: { id: record.person, name: record.personName },
      program: record.clientId,
      scopes: record.scopes,
      reason,
    });
    announceEnd(ended, reason);
    return true;
  }

  function endForSession(reference: string, reason: EndReason): number {
    let count = 0;
    for (const record of store.all()) if (record.sessionReference === reference && end(record.id, reason)) count += 1;
    grants.dropSession(reference);
    return count;
  }

  sessions.onEnded((reference, sessionReason) => {
    endForSession(reference, endReasonForSession(sessionReason));
  });

  /** The person behind a session as they are now, or the reason they cannot continue. */
  function currentPerson(session: Session): { ok: true; principal: Principal } | { ok: false; reason: 'deactivated' | 'no-access' } {
    const principal = dependencies.principalFor(session.principal);
    if (principal.deactivated) return { ok: false, reason: 'deactivated' };
    if (!principal.grants.length) return { ok: false, reason: 'no-access' };
    return { ok: true, principal };
  }

  function mintTokens(record: ConnectionRecord, previous?: ConnectionRecord): { tokens: IssuedTokens; record: ConnectionRecord } {
    const accessToken = newToken();
    const refreshToken = newToken();
    const hashes = { accessHash: keyedHash(key, accessToken), refreshHash: keyedHash(key, refreshToken), now: now() };
    const next = previous ? rotateTokens(previous, hashes) : { ...record, access: { hash: hashes.accessHash, expiresAt: hashes.now + ACCESS_TOKEN_LIFETIME_MS }, refresh: hashes.refreshHash };
    return { record: next, tokens: { accessToken, refreshToken, expiresInSeconds: ACCESS_TOKEN_SECONDS, scope: next.scopes.join(' ') } };
  }

  /** Checks that the program is registered and still allows the scopes and, for a code, the redirect address. */
  function programAllows(binding: GrantBinding): boolean {
    const program = findProgram(dependencies.programs(), binding.clientId);
    if (!program) return false;
    const scopesAllowed = binding.scopes.every(scope => (program.scopes as Scope[]).includes(scope));
    const redirectAllowed = binding.redirectUri === undefined || program.redirectUris.includes(binding.redirectUri);
    return scopesAllowed && redirectAllowed;
  }

  /** Creates the connection for a grant that passed every check. */
  async function openConnection(binding: GrantBinding, attach: (connectionId: string) => void): Promise<TokenOutcome> {
    const origin = connectionCallerOrigin(binding.origin);
    const session = await sessions.getByReference(binding.sessionReference);
    if (!session) return { ok: false, reason: 'session-ended' };
    const person = currentPerson(session);
    if (!person.ok) return { ok: false, reason: 'no-access' };
    if (liveConnections(binding.person) >= MAX_LIVE_CONNECTIONS_PER_PERSON) return { ok: false, reason: 'connection-limit' };
    const program = findProgram(dependencies.programs(), binding.clientId)!;
    const started = startConnection({
      id: newConnectionId(),
      person: binding.person,
      personName: session.principal.name,
      clientId: binding.clientId,
      programName: program.name,
      scopes: binding.scopes,
      resource: binding.resource,
      redirectUri: binding.redirectUri,
      origin: binding.origin,
      sessionReference: binding.sessionReference,
      accessHash: '',
      refreshHash: '',
      now: now(),
    });
    const issued = mintTokens(started);
    store.save(issued.record);
    attach(issued.record.id);
    events.record({
      action: 'connection.issued',
      origin,
      outcome: 'ok',
      connection: issued.record.id,
      person: { id: binding.person, name: session.principal.name },
      program: binding.clientId,
      scopes: binding.scopes,
      reason: binding.kind,
    });
    return { ok: true, tokens: issued.tokens, connection: issued.record.id };
  }

  // A refusal is not audited here: the endpoint audits it through a gate that bounds anonymous records, so a loop of bad requests cannot fill the log.
  function refuse(reason: RefusalReason): TokenOutcome {
    return { ok: false, reason };
  }

  /** A second use of a code or setup credential ends what the first use produced. */
  function replayedGrant(binding: GrantBinding, connectionId: string | undefined): TokenOutcome {
    if (connectionId) end(connectionId, 'code-reuse');
    return refuse('replayed-credential');
  }

  async function issueFromCode(trade: CodeTrade): Promise<TokenOutcome> {
    const presented = grants.present(trade.code);
    if (presented.state === 'unknown') return refuse('unknown-credential');
    if (presented.state === 'replayed') return replayedGrant(presented.binding, presented.connectionId);
    const { binding } = presented;
    // Every binding is compared before any of them decides, so the answer does not depend on which one failed first.
    const verifier = binding.kind === 'code' && binding.codeChallenge !== undefined && verifyS256(trade.codeVerifier, binding.codeChallenge);
    const bound =
      binding.kind === 'code' && trade.clientId === binding.clientId && trade.redirectUri === binding.redirectUri && trade.resource === binding.resource && binding.resource === dependencies.resource;
    if (!bound) return refuse('binding-mismatch');
    if (!verifier) return refuse('verifier-mismatch');
    if (!programAllows(binding)) return refuse('program-not-registered');
    return openOrRefuse(binding, presented.attachConnection);
  }

  async function issueFromSetup(trade: SetupTrade): Promise<TokenOutcome> {
    const presented = grants.present(trade.setupCredential);
    if (presented.state === 'unknown') return refuse('unknown-credential');
    if (presented.state === 'replayed') return replayedGrant(presented.binding, presented.connectionId);
    const { binding } = presented;
    const bound = binding.kind === 'setup' && trade.clientId === binding.clientId && trade.resource === binding.resource && binding.resource === dependencies.resource;
    if (!bound) return refuse('binding-mismatch');
    if (!programAllows(binding)) return refuse('program-not-registered');
    return openOrRefuse(binding, presented.attachConnection);
  }

  async function openOrRefuse(binding: GrantBinding, attach: (connectionId: string) => void): Promise<TokenOutcome> {
    const opened = await openConnection(binding, attach);
    return opened.ok ? opened : refuse(opened.reason);
  }

  async function refresh(trade: RefreshTrade): Promise<TokenOutcome> {
    const hash = keyedHash(key, trade.refreshToken);
    const initial = store.byRefreshHash(hash) ?? store.byRetiredHash(hash);
    if (!initial) return refuse('unknown-credential');
    // The lookups that need a wait come first, and the decision is made again from the stored record afterwards, so two requests with one token cannot both rotate it.
    const session = await sessions.getByReference(initial.sessionReference);
    const current = store.byRefreshHash(hash);
    if (!current) {
      const retired = store.byRetiredHash(hash);
      if (retired) end(retired.id, 'replay');
      return refuse('replayed-credential');
    }
    if (current.state !== 'active') return refuse('connection-ended');
    if (trade.clientId !== current.clientId || trade.resource !== current.resource || current.resource !== dependencies.resource) return refuse('binding-mismatch');
    const unfit = unfitnessOf(current, session);
    if (unfit) {
      end(current.id, unfit);
      return refuse('connection-ended');
    }
    const rotated = mintTokens(current, current);
    store.save(rotated.record);
    events.record({
      action: 'connection.refreshed',
      origin: connectionCallerOrigin(current.origin),
      outcome: 'ok',
      connection: current.id,
      person: { id: current.person, name: current.personName },
      program: current.clientId,
      scopes: current.scopes,
    });
    return { ok: true, tokens: rotated.tokens, connection: current.id };
  }

  /** The reason an active connection must end now, from its session, person and registration, or null. */
  function unfitnessOf(record: ConnectionRecord, session: Session | null): EndReason | null {
    if (!session) return 'session-ended';
    const person = currentPerson(session);
    if (!person.ok) return person.reason;
    return registrationEndReason(record, findProgram(dependencies.programs(), record.clientId));
  }

  async function resolve(accessToken: string): Promise<ResolvedConnection> {
    const record = store.byAccessHash(keyedHash(key, accessToken));
    if (!record || record.state !== 'active' || record.resource !== dependencies.resource) return { ok: false };
    if (!accessTokenLive(record, now())) return { ok: false };
    const session = await sessions.getByReference(record.sessionReference);
    const unfit = unfitnessOf(record, session);
    if (unfit || !session) {
      end(record.id, unfit ?? 'session-ended');
      return { ok: false };
    }
    const person = currentPerson(session);
    if (!person.ok) return { ok: false };
    if (now() - record.lastUsedAt >= LAST_USED_WRITE_INTERVAL_MS) store.save({ ...record, lastUsedAt: now() });
    const caller = mintCaller({ principal: person.principal, origin: connectionCallerOrigin(record.origin), connection: record.id, scope: effectsOf(record.scopes), session });
    return { ok: true, caller, connection: record.id };
  }

  /** Ends connections whose session, person or registration no longer allows them, then forgets ended records past their retention. */
  async function sweep(): Promise<number> {
    let ended = 0;
    for (const record of store.all()) {
      if (record.state !== 'active') continue;
      const unfit = unfitnessOf(record, await sessions.getByReference(record.sessionReference));
      if (unfit && end(record.id, unfit)) ended += 1;
    }
    store.removeEndedBefore(now() - ENDED_RETENTION_MS);
    return ended;
  }

  /** A single-use credential for a connection created by the server itself on behalf of a signed-in person, such as the relay of the agent panel. */
  function createConnectionForSession(request: SessionConnectionRequest): SessionConnectionResult {
    const person = currentPerson(request.session);
    if (!person.ok) return { ok: false, reason: 'no-access' };
    const program = findProgram(dependencies.programs(), request.clientId);
    if (!program) return { ok: false, reason: 'program-not-registered' };
    if (!request.scopes.every(scope => (program.scopes as Scope[]).includes(scope))) return { ok: false, reason: 'scope-not-allowed' };
    if (liveConnections(request.session.principal.id) >= MAX_LIVE_CONNECTIONS_PER_PERSON) return { ok: false, reason: 'connection-limit' };
    const origin = request.origin ?? 'mcp';
    const issued = grants.issue({
      kind: 'setup',
      clientId: request.clientId,
      scopes: request.scopes,
      resource: dependencies.resource,
      person: request.session.principal.id,
      sessionReference: sessionReferenceOf(request.session.id),
      origin,
    });
    events.record({
      action: 'connection.setup-created',
      origin: 'http',
      outcome: 'ok',
      person: { id: request.session.principal.id, name: request.session.principal.name },
      program: request.clientId,
      scopes: request.scopes,
    });
    return { ok: true, credential: issued.value, expiresAt: issued.expiresAt };
  }

  function preview(proposed: ProgramsFile): ProgramChangePreview {
    const current = dependencies.programs();
    const result: ProgramChangePreview = { added: [], changed: [], removed: [], endings: [] };
    for (const program of proposed.programs) {
      const before = findProgram(current, program.clientId);
      if (!before) result.added.push({ clientId: program.clientId, name: program.name });
      else if (JSON.stringify(before) !== JSON.stringify(program)) result.changed.push({ clientId: program.clientId, name: program.name });
    }
    for (const before of current.programs) if (!findProgram(proposed, before.clientId)) result.removed.push({ clientId: before.clientId, name: before.name });
    for (const program of [...proposed.programs, ...result.removed.map(entry => findProgram(current, entry.clientId)!)]) {
      const replacement = findProgram(proposed, program.clientId);
      const connections = store.all().filter(record => record.clientId === program.clientId && record.state === 'active' && registrationEndReason(record, replacement) !== null).length;
      if (connections > 0) result.endings.push({ clientId: program.clientId, name: program.name, connections });
    }
    return result;
  }

  /** Ends the connections a confirmed registration change no longer allows. */
  function applyProgramChange(): number {
    let ended = 0;
    for (const record of store.all()) {
      if (record.state !== 'active') continue;
      const reason = registrationEndReason(record, findProgram(dependencies.programs(), record.clientId));
      if (reason && end(record.id, reason)) ended += 1;
    }
    return ended;
  }

  return {
    issueFromCode,
    issueFromSetup,
    refresh,
    resolve,
    end,
    endForSession,
    sweep,
    createConnectionForSession,
    preview,
    applyProgramChange,
    liveConnections,
    /** The connections of one person, newest first. */
    listFor: (person: string): ConnectionView[] =>
      store
        .all()
        .filter(record => record.person === person)
        .sort((left, right) => right.createdAt - left.createdAt)
        .map(viewOf),
    /** Every connection, newest first, for the Admin list. */
    listAll: (): ConnectionView[] => [...store.all()].sort((left, right) => right.createdAt - left.createdAt).map(viewOf),
    /** The person who owns a connection, so a route can answer 404 for someone else's. */
    ownerOf: (connectionId: string): string | undefined => store.get(connectionId)?.person,
    /** Aborts when the connection ends, so work opened through it stops. */
    endSignal(connectionId: string): AbortSignal {
      const record = store.get(connectionId);
      if (!record || record.state === 'ended') return AbortSignal.abort();
      let controller = endControllers.get(connectionId);
      if (!controller) {
        controller = new AbortController();
        endControllers.set(connectionId, controller);
      }
      return controller.signal;
    },
    /** Calls the listener for every connection that ends, whatever ended it. Returns a function that stops listening. */
    onConnectionEnded(listener: (ended: ConnectionEnded) => void): () => void {
      endListeners.add(listener);
      return () => endListeners.delete(listener);
    },
    events,
  };
}

export type ConnectionService = ReturnType<typeof createConnectionService>;
