// Builds a connection service over fakes: a session map, a registration list, a temporary store and a real audit log, with a clock the test moves.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createAuditLog } from '../../src/server/auth/audit';
import type { Principal } from '../../src/server/auth/principal';
import type { Session, SessionEndListener } from '../../src/server/auth/sessions';
import { openConnectionStore } from '../../src/server/connections/connection-store';
import { createConnectionService, type ConnectionServiceDependencies } from '../../src/server/connections/connection-service';
import { createPendingGrants, type GrantBinding } from '../../src/server/connections/pending-grants';
import type { Program, ProgramsFile } from '../../src/server/connections/programs';
import { deriveConnectionKey } from '../../src/server/connections/token-keys';

export const RESOURCE = 'https://wb.example/api/mcp';
export const REDIRECT = 'http://127.0.0.1:8765/callback';
export const VERIFIER = 'v'.repeat(43);
export const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

export const program: Program = {
  clientId: 'reference-client',
  name: 'Protocol reference client',
  description: '',
  redirectUris: [REDIRECT],
  scopes: ['read', 'validate', 'edit', 'commit'],
  setupNote: '',
};

export function principalNamed(id: string, change: Partial<Principal> = {}): Principal {
  return {
    id,
    key: id,
    kind: 'person',
    name: `Name of ${id}`,
    username: id,
    verifiedEmail: null,
    groups: [],
    groupsResolved: 'token',
    groupOverage: false,
    grants: [{ roleId: 'editor' }] as never,
    deactivated: false,
    ...change,
  };
}

export function sessionFor(id: string, principal: Principal): Session {
  return { id, principal, tokens: { accessToken: 'provider-token', expiresAt: 9e15 }, csrf: 'csrf', createdAt: 0, lastSeenAt: 0 };
}

export function referenceOf(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}

/** Everything a test needs to drive the service and look at what it left behind. */
export function connectionFixture(options: { programs?: Program[] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'connection-service-'));
  let clock = 1_000_000;
  const key = deriveConnectionKey(new Uint8Array(32).fill(9));
  const sessions = new Map<string, Session>();
  const listeners = new Set<SessionEndListener>();
  const state = { programs: { formatVersion: 1, programs: options.programs ?? [program] } as ProgramsFile, principals: new Map<string, Principal>() };
  const audit = createAuditLog({ dir: join(root, 'audit'), now: () => new Date(clock) });
  const store = openConnectionStore(join(root, 'connections'));
  const grants = createPendingGrants({ key, now: () => clock });
  const dependencies: ConnectionServiceDependencies = {
    store,
    grants,
    key,
    sessions: {
      getByReference: async reference => sessions.get(reference) ?? null,
      onEnded: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    principalFor: principal => state.principals.get(principal.id) ?? principal,
    programs: () => state.programs,
    audit,
    resource: RESOURCE,
    now: () => clock,
  };
  const service = createConnectionService(dependencies);
  function signIn(sessionId: string, personId = 'alice') {
    const principal = principalNamed(personId);
    const session = sessionFor(sessionId, principal);
    sessions.set(referenceOf(sessionId), session);
    return session;
  }
  function endSession(sessionId: string, reason = 'sign-out') {
    sessions.delete(referenceOf(sessionId));
    for (const listener of listeners) listener(referenceOf(sessionId), reason);
  }
  function codeFor(session: Session, change: Partial<GrantBinding> = {}) {
    const binding: GrantBinding = {
      kind: 'code',
      clientId: program.clientId,
      redirectUri: REDIRECT,
      scopes: ['read', 'edit'],
      resource: RESOURCE,
      codeChallenge: CHALLENGE,
      person: session.principal.id,
      sessionReference: referenceOf(session.id),
      origin: 'mcp',
      ...change,
    };
    return grants.issue(binding).value;
  }
  function trade(code: string, change: Partial<Parameters<typeof service.issueFromCode>[0]> = {}) {
    return service.issueFromCode({ code, clientId: program.clientId, redirectUri: REDIRECT, codeVerifier: VERIFIER, resource: RESOURCE, ...change });
  }
  function auditText() {
    const directory = join(root, 'audit');
    return readdirSync(directory)
      .map(name => readFileSync(join(directory, name), 'utf8'))
      .join('');
  }
  function auditEntries(): Record<string, any>[] {
    return auditText()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  }
  return {
    root,
    service,
    store,
    grants,
    state,
    signIn,
    endSession,
    codeFor,
    trade,
    auditText,
    auditEntries,
    advance: (milliseconds: number) => (clock += milliseconds),
    sessions,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
