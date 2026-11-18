// What the workbench answers when the agent speaks as a protocol client of it: file requests, questions and updates. Anything else is "method not found" and nothing runs.
import { JsonRpcError, RPC_ERROR } from './jsonrpc-connection';
import type { FrameDefinition } from './protocol-schema';
import type { FailureReason, FileFailure, FileRequests } from './file-requests';
import type { PanelEventBody } from './panel-events';
import type { PermissionQuestions } from './permission-questions';
import { eventsForUpdate, newMessageCursor, finishMessage } from './update-events';

/** Code used for a request the workbench understood and refused by rule. The protocol assigns -32000 and -32002 to other meanings. */
const REFUSED_CODE = -32001;
const RESOURCE_NOT_FOUND_CODE = -32002;

/** The schema each frame from the agent must match before the surface sees it. */
export const INCOMING_PARAM_SCHEMAS: Readonly<Record<string, FrameDefinition>> = {
  'fs/read_text_file': 'ReadTextFileRequest',
  'fs/write_text_file': 'WriteTextFileRequest',
  'session/request_permission': 'RequestPermissionRequest',
  'session/update': 'SessionNotification',
};

/** What the surface needs from the session around it. */
export type ClientSurfaceDependencies = {
  files: FileRequests;
  questions: PermissionQuestions;
  /** Delivers one panel event: stored in the buffer and sent to every open tab. */
  emit: (event: PanelEventBody) => void;
  /** The protocol session id the agent was given, once there is one. */
  agentSessionId: () => string | undefined;
};

function failureError(failure: FileFailure): JsonRpcError {
  const code: Partial<Record<FailureReason, number>> = { 'not-available': RESOURCE_NOT_FOUND_CODE, internal: RPC_ERROR.internal };
  return new JsonRpcError(code[failure.reason] ?? REFUSED_CODE, failure.message);
}

/** Creates the handlers for one session. */
export function createClientSurface(dependencies: ClientSurfaceDependencies) {
  const cursor = newMessageCursor();

  function requireSession(params: unknown): Record<string, unknown> {
    const record = (params ?? {}) as Record<string, unknown>;
    const expected = dependencies.agentSessionId();
    if (expected === undefined || record.sessionId !== expected) throw new JsonRpcError(RPC_ERROR.invalidParams, 'Unknown session.');
    return record;
  }

  async function readTextFile(params: unknown): Promise<unknown> {
    const request = requireSession(params);
    const outcome = await dependencies.files.read({ path: request.path, line: request.line as number | null | undefined, limit: request.limit as number | null | undefined });
    if (!outcome.ok) throw failureError(outcome.failure);
    return { content: outcome.content };
  }

  async function writeTextFile(params: unknown): Promise<unknown> {
    const request = requireSession(params);
    const outcome = await dependencies.files.write({ path: request.path, content: request.content });
    if (outcome.ok) {
      if (outcome.card) dependencies.emit({ type: 'change', card: outcome.card });
      return {};
    }
    if (outcome.failure.card) dependencies.emit({ type: 'change', card: outcome.failure.card });
    throw failureError(outcome.failure);
  }

  async function askPermission(params: unknown): Promise<unknown> {
    const outcome = await dependencies.questions.ask(requireSession(params) as Parameters<PermissionQuestions['ask']>[0]);
    return { outcome };
  }

  return {
    /** Answers one request from the agent. An unknown or unsupported method throws "method not found" and does nothing else. */
    async handleRequest(method: string, params: unknown): Promise<unknown> {
      if (method === 'fs/read_text_file') return readTextFile(params);
      if (method === 'fs/write_text_file') return writeTextFile(params);
      if (method === 'session/request_permission') return askPermission(params);
      throw new JsonRpcError(RPC_ERROR.methodNotFound, 'Method not found.');
    },
    /** Takes one notification from the agent. Only session updates are shown; every other notification is ignored. */
    handleNotification(method: string, params: unknown): void {
      if (method !== 'session/update') return;
      const record = (params ?? {}) as { sessionId?: unknown; update?: unknown };
      if (record.sessionId !== dependencies.agentSessionId()) return;
      for (const event of eventsForUpdate(record.update, cursor)) dependencies.emit(event);
    },
    /** Closes the message being written, as when a turn ends. */
    finishMessage(): void {
      for (const event of finishMessage(cursor)) dependencies.emit(event);
    },
  };
}

export type ClientSurface = ReturnType<typeof createClientSurface>;
