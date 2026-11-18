// One session's conversation with its agent: the opening handshake, prompts, cancelling, and what to do with a frame that breaks the rules. It owns the protocol connection and reports everything the person sees as panel events.
import type { Caller } from '../auth/caller';
import type { OperationBoundary } from '../auth/operation-boundary';
import { INCOMING_PARAM_SCHEMAS, createClientSurface } from './client-surface';
import { createFileRequests } from './file-requests';
import { createFloodGuard } from './flood-guard';
import { JsonRpcError, createJsonRpcConnection, MAXIMUM_FRAME_BYTES, type Violation } from './jsonrpc-connection';
import { plainText, type PanelEventBody } from './panel-events';
import { createPermissionQuestions, type AnswerResult } from './permission-questions';
import { ACP_PROTOCOL_VERSION } from './protocol-schema';
import type { EndReason } from './panel-session';
import type { PanelSession, SessionStore } from './session-store';
import { parseVirtualPath } from './virtual-path';

/** Working directory the agent is given: the virtual root, never a server path. */
const AGENT_WORKING_DIRECTORY = '/workbench';
/** Longest agent name shown, in characters. */
export const MAXIMUM_AGENT_NAME_CHARACTERS = 200;
/** Most bytes of a prompt text and most files attached to one. */
export const MAXIMUM_PROMPT_BYTES = 100_000;
export const MAXIMUM_PROMPT_FILES = 20;
/** Frames that fail the schema before the session ends. */
const MAXIMUM_SCHEMA_VIOLATIONS = 10;
/** The code an agent answers with when it needs to sign in on its own. */
const AUTHENTICATION_REQUIRED = -32000;

/** Why a prompt was not sent. */
export type PromptRefusal = 'not-connected' | 'busy' | 'too-long' | 'bad-attachment';

/** What a conversation needs from the world. */
export type ConversationDependencies = {
  session: PanelSession;
  store: SessionStore;
  boundary: Pick<OperationBoundary, 'operate'>;
  /** The caller of every file request. It is asked for each time, so a relay that reconnects with fresher credentials is used at once. */
  caller: () => Caller;
  now: () => number;
  /** Stores nothing; delivers events already numbered by the session's buffer to the open tabs. */
  publish: (events: ReturnType<PanelSession['buffer']['append']>) => void;
  /** Sends one line toward the agent, through the relay link. Returns false when the link cannot take it. */
  sendToAgent: (line: string) => boolean;
  clientName: string;
};

function sentence(text: unknown, fallback: string): string {
  return typeof text === 'string' && text.length > 0 ? plainText(text).slice(0, 400) : fallback;
}

/** Creates the conversation for one session. Nothing happens until `start`. */
export function createConversation(dependencies: ConversationDependencies) {
  const { session, store } = dependencies;
  let agentSessionId: string | undefined;
  let schemaViolations = 0;
  let ended = false;

  function emit(event: PanelEventBody): void {
    dependencies.publish(session.buffer.append(event));
  }
  function end(reason: EndReason): void {
    store.end(session, reason);
  }
  const questions = createPermissionQuestions({ emit });
  const guard = createFloodGuard({ now: dependencies.now });
  const files = createFileRequests({
    operate: async request => (await dependencies.boundary.operate({ caller: dependencies.caller(), request })).response,
    versions: session.versions,
    admit: () => {
      const admission = guard.admit();
      if (admission.ok) return { ok: true, release: () => admission.permit.release() };
      if (admission.flood) end('flood');
      return { ok: false };
    },
  });
  const surface = createClientSurface({ files, questions, emit, agentSessionId: () => agentSessionId });

  function onViolation(violation: Violation): void {
    if (violation === 'too-large') {
      if (guard.noteFrame(true)) end('flood');
      return;
    }
    if (violation !== 'schema') return end('protocol-error');
    schemaViolations += 1;
    if (schemaViolations >= MAXIMUM_SCHEMA_VIOLATIONS) end('protocol-error');
  }

  const connection = createJsonRpcConnection({
    send: message => {
      if (!dependencies.sendToAgent(JSON.stringify(message))) end('relay-lost');
    },
    handleRequest: async (method, params) => {
      store.apply(session, { type: 'activity' });
      return surface.handleRequest(method, params);
    },
    handleNotification: (method, params) => {
      store.apply(session, { type: 'activity' });
      surface.handleNotification(method, params);
    },
    onViolation,
    paramSchemas: INCOMING_PARAM_SCHEMAS,
  });

  function protocolFailure(text: string): void {
    emit({ type: 'notice', text });
    end('protocol-error');
  }

  async function handshake(): Promise<void> {
    try {
      const initialized = await connection.request<{ protocolVersion: number; agentInfo?: { name?: string } | null }>(
        'initialize',
        {
          protocolVersion: ACP_PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
          clientInfo: { name: dependencies.clientName, version: '1' },
        },
        'InitializeResponse',
      );
      if (initialized.protocolVersion !== ACP_PROTOCOL_VERSION) return protocolFailure('The agent speaks a different version of the protocol.');
      session.agentName = plainText(initialized.agentInfo?.name ?? 'Agent').slice(0, MAXIMUM_AGENT_NAME_CHARACTERS);
      const created = await connection.request<{ sessionId: string }>('session/new', { cwd: AGENT_WORKING_DIRECTORY, mcpServers: [] }, 'NewSessionResponse');
      agentSessionId = created.sessionId.slice(0, 256);
      store.apply(session, { type: 'connect' });
      emit({ type: 'session', state: 'connected', agentName: session.agentName, scopes: session.scope });
    } catch (error) {
      if (ended) return;
      if (error instanceof JsonRpcError && error.code === AUTHENTICATION_REQUIRED)
        return protocolFailure('The agent needs to sign in on its own before it can work. Sign in in the agent, then start a new session.');
      protocolFailure('The agent did not complete the opening exchange of the protocol.');
    }
  }

  function promptBlocks(text: string, paths: readonly string[]): Record<string, unknown>[] | undefined {
    const blocks: Record<string, unknown>[] = [{ type: 'text', text }];
    for (const path of paths) {
      if (!parseVirtualPath(path).ok) return undefined;
      blocks.push({ type: 'resource_link', uri: `file://${path}`, name: path.split('/').at(-1) ?? path });
    }
    return blocks;
  }

  async function runTurn(blocks: Record<string, unknown>[]): Promise<void> {
    try {
      const result = await connection.request<{ stopReason: string }>('session/prompt', { sessionId: agentSessionId, prompt: blocks }, 'PromptResponse');
      surface.finishMessage();
      const cancelled = result.stopReason === 'cancelled' || session.turn?.cancelled === true;
      emit({ type: 'turn', phase: cancelled ? 'cancelled' : 'finished', stopReason: result.stopReason });
    } catch (error) {
      surface.finishMessage();
      if (ended) return;
      emit({ type: 'notice', text: error instanceof JsonRpcError ? `The agent reported an error: ${sentence(error.message, 'no details')}` : 'The agent did not answer the request.' });
      emit({ type: 'turn', phase: 'finished', stopReason: 'error' });
    } finally {
      session.turn = undefined;
      store.apply(session, { type: 'turn-finished' });
    }
  }

  return {
    /** Sends the opening exchange. The session becomes connected when the agent has answered both calls. */
    start(): Promise<void> {
      return handshake();
    },
    /** Takes one line the agent sent, already numbered and accepted by the link. */
    receive(line: string): void {
      if (ended) return;
      if (Buffer.byteLength(line) <= MAXIMUM_FRAME_BYTES) guard.noteFrame(false);
      connection.receive(line);
    },
    /** Sends the person's prompt, unless a turn is running or the session is not ready. */
    prompt(text: string, attachments: readonly string[]): { ok: true } | { ok: false; reason: PromptRefusal } {
      if (session.timing.state !== 'connected' || agentSessionId === undefined) return { ok: false, reason: session.timing.state === 'working' ? 'busy' : 'not-connected' };
      if (Buffer.byteLength(text) > MAXIMUM_PROMPT_BYTES || attachments.length > MAXIMUM_PROMPT_FILES) return { ok: false, reason: 'too-long' };
      const blocks = promptBlocks(text, attachments);
      if (!blocks) return { ok: false, reason: 'bad-attachment' };
      store.apply(session, { type: 'prompt' });
      session.turn = { id: crypto.randomUUID(), startedAt: dependencies.now(), cancelled: false };
      emit({ type: 'message', id: `u-${session.turn.id}`, role: 'user', text: plainText(text), done: true });
      emit({ type: 'turn', phase: 'started' });
      void runTurn(blocks);
      return { ok: true };
    },
    /** Asks the agent to stop the running turn. Every waiting question is answered "cancelled" first, as the protocol requires. */
    cancel(): void {
      if (!session.turn || session.turn.cancelled || agentSessionId === undefined) return;
      session.turn.cancelled = true;
      questions.cancelAll();
      connection.notify('session/cancel', { sessionId: agentSessionId });
    },
    answer(questionId: string, choice: { option: string } | { cancel: true }): AnswerResult {
      store.apply(session, { type: 'activity' });
      return questions.answer(questionId, choice);
    },
    /** Called when the session ends for any reason: nothing more is sent or accepted. */
    close(reason: EndReason): void {
      if (ended) return;
      ended = true;
      questions.cancelAll();
      emit({ type: 'ended', reason });
      connection.close();
    },
  };
}

export type Conversation = ReturnType<typeof createConversation>;
