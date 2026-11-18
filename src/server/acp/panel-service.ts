// The agent panel as one service: it starts sessions for people, recognises a session's relay, keeps each session's live side, writes the session audit records and sweeps what the clock has ended.
import { randomUUID } from 'node:crypto';
import { activeBrand } from '../brand/bundle';
import type { AuditLog } from '../auth/audit';
import type { OperationBoundary } from '../auth/operation-boundary';
import type { Principal } from '../auth/principal';
import type { Session } from '../auth/sessions';
import { connectionStatement, NOT_OFFERED_NOTE, SCOPE_LINES } from '../../shared/agent-panel/statement';
import { mintAcpCaller, narrowToPanelEffects, PANEL_EFFECTS } from './connection-auth';
import type { ConnectionDirectory } from './connection-directory';
import { createLiveSession, type LiveSession } from './live-session';
import { WAITING_LIMIT_MS, type EndReason } from './panel-session';
import type { RelayAuthenticator } from './relay-authentication';
import { createSessionStore, type PanelSession } from './session-store';
import type { Caller } from '../auth/caller';

/** The product name of this deployment, or a neutral word when no brand is loaded. */
function productName(): string {
  try {
    return activeBrand().manifest.productName;
  } catch {
    return 'This workbench';
  }
}

/** The name the relay program is registered under in server mode. */
export const RELAY_CLIENT_ID = 'acp-relay';
/** How often the clock is checked for sessions to end. */
export const SWEEP_INTERVAL_MS = 5_000;

/** What the browser is told when a session starts. */
export type StartedSession = { id: string; code: string; command: string; statement: string; scopes: readonly string[]; notOffered: string; expiresAt: number };
export type StartResult = { ok: true; session: StartedSession } | { ok: false; status: 409 | 502; error: string };

/** What the service is built from. */
export type PanelServiceOptions = {
  mode: 'local' | 'server';
  boundary: () => OperationBoundary;
  audit: AuditLog;
  /** The address the relay should connect to, shown in the command. */
  workbenchUrl: string;
  authenticateRelay: RelayAuthenticator;
  connections?: ConnectionDirectory;
  now?: () => number;
};

function endReasonOf(reason: string): EndReason {
  if (reason === 'signed-out') return 'sign-out';
  if (reason === 'session-ended' || reason === 'expired') return 'expired';
  if (reason === 'deactivated') return 'deactivated';
  return 'revoked';
}

/** Creates the service. Nothing runs until the first session starts, except the optional sweeper. */
export function createPanelService(options: PanelServiceOptions) {
  const now = options.now ?? Date.now;
  const lives = new Map<string, LiveSession>();
  const relayCallers = new Map<string, Caller>();

  function recordSession(session: PanelSession, tool: 'agentPanel.start' | 'agentPanel.end', reason: string): void {
    // A failed audit write must not change what the person sees; the boundary reports its own failures the same way.
    try {
      options.audit.append({
        requestId: randomUUID(),
        origin: 'acp',
        connection: session.connection,
        tool,
        principal: session.principal ?? { id: session.owner, kind: 'person' },
        action: 'protocol',
        resource: { type: 'workspace' },
        decision: 'allow',
        rules: [],
        outcome: 'ok',
        reason,
      } as Parameters<AuditLog['append']>[0]);
    } catch {
      /* The record is best effort. */
    }
  }

  const store = createSessionStore({
    now,
    onEnded: (session, reason) => {
      recordSession(session, 'agentPanel.end', reason);
      lives.get(session.id)?.close(reason);
      relayCallers.delete(session.id);
    },
  });

  options.connections?.onConnectionEnded(ended => store.endConnection(ended.connectionId, endReasonOf(ended.reason)));

  function commandFor(session: PanelSession, credential?: string): string {
    const prefix = credential ? `SW_ACP_CREDENTIAL=${credential} ` : '';
    return `${prefix}bun scripts/acp-relay.ts --session ${session.id}.${session.code} --url ${options.workbenchUrl} -- <your agent command>`;
  }

  async function start(input: { principal: Principal; session?: Session | null; confirmReplace?: boolean }): Promise<StartResult> {
    const created = store.create({ owner: input.principal.id, principal: input.principal, scope: PANEL_EFFECTS, confirmReplace: input.confirmReplace });
    if (!created.ok) return { ok: false, status: 409, error: 'You already have an agent session. Confirm to replace it.' };
    const session = created.session;
    let credential: string | undefined;
    if (options.mode === 'server') {
      const issued = input.session && options.connections?.createConnectionForSession({ session: input.session, clientId: RELAY_CLIENT_ID, scopes: ['read', 'edit'], origin: 'acp' });
      if (!issued?.ok) {
        store.end(session, 'closed');
        return { ok: false, status: 502, error: 'The workbench could not prepare a connection for the relay. Ask an Admin whether the relay program is registered.' };
      }
      credential = issued.credential;
    }
    const live = createLiveSession({
      session,
      store,
      boundary: options.boundary(),
      caller: () => relayCallers.get(session.id)!,
      now,
      clientName: 'semantic-workbench',
    });
    lives.set(session.id, live);
    session.buffer.append({ type: 'session', state: 'waiting', scopes: session.scope });
    recordSession(session, 'agentPanel.start', 'started');
    return {
      ok: true,
      session: {
        id: session.id,
        code: session.code!,
        command: commandFor(session, credential),
        statement: connectionStatement(productName()),
        scopes: SCOPE_LINES,
        notOffered: NOT_OFFERED_NOTE,
        expiresAt: now() + WAITING_LIMIT_MS,
      },
    };
  }

  /** Recognises a relay request for a session. Every failure, including an ended session and another person's, gives the same undefined. */
  async function relayFor(request: Request, sessionId: string): Promise<{ session: PanelSession; live: LiveSession } | undefined> {
    const identity = await options.authenticateRelay(request);
    const session = store.findForRelay(sessionId);
    const live = lives.get(sessionId);
    if (!identity.ok || !session || !live || session.timing.state === 'ended' || identity.principal.id !== session.owner) return undefined;
    if (identity.connection && identity.connection !== session.connection && !store.bindConnection(session, identity.connection)) return undefined;
    const effects = narrowToPanelEffects(identity.scope ?? session.scope).filter(effect => session.scope.includes(effect));
    relayCallers.set(session.id, mintAcpCaller({ principal: identity.principal, connection: session.connection, scope: effects, session: identity.session }));
    return { session, live };
  }

  /** Accepts the relay's first request: the code is used once, then the handshake with the agent begins. */
  function hello(found: { session: PanelSession; live: LiveSession }, code: string): boolean {
    if (!store.consumeCode(found.session, code)) return false;
    void found.live.conversation.start();
    return true;
  }

  function sweepOnce(): void {
    store.sweep();
    for (const [id, live] of lives) {
      if (!store.findForRelay(id)) lives.delete(id);
      else live.checkLink();
    }
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  return {
    store,
    start,
    relayFor,
    hello,
    sweepOnce,
    /** The live side of a person's own session, or undefined for an unknown session and another person's alike. */
    liveFor(sessionId: string, ownerId: string): { session: PanelSession; live: LiveSession } | undefined {
      const session = store.find(sessionId, ownerId);
      const live = lives.get(sessionId);
      return session && live ? { session, live } : undefined;
    },
    /** Ends a session. The first reason wins. */
    end: (session: PanelSession, reason: EndReason) => store.end(session, reason),
    /** Ends every session of a person, as sign-out does. */
    endAllOf: (ownerId: string, reason: EndReason) => store.endAllOf(ownerId, reason),
    startSweeper(): void {
      timer ??= setInterval(sweepOnce, SWEEP_INTERVAL_MS);
      timer.unref();
    },
    stopSweeper(): void {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}

export type PanelService = ReturnType<typeof createPanelService>;
