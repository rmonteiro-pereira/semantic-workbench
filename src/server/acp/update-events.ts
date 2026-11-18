// Turns the agent's session updates into panel events. Pure: it holds no state beyond the message counter it is handed.
import { plainText, viewContent, type PanelEventBody, type TaskEntry, type TaskStatus } from './panel-events';

/** Carries the id of the message being written, so pieces of one answer share an id. */
export type MessageCursor = { current: string | undefined; counter: number };

/** A cursor with no message started. */
export function newMessageCursor(): MessageCursor {
  return { current: undefined, counter: 0 };
}

/** Ends the current message, so the next piece starts a new one. */
export function finishMessage(cursor: MessageCursor): PanelEventBody[] {
  if (!cursor.current) return [];
  const finished: PanelEventBody = { type: 'message', id: cursor.current, role: 'agent', text: '', done: true };
  cursor.current = undefined;
  return [finished];
}

const TASK_STATUSES: readonly string[] = ['pending', 'in_progress', 'completed'];

function taskEntry(value: unknown): TaskEntry {
  const entry = (value ?? {}) as { content?: unknown; status?: unknown; priority?: unknown };
  const status = typeof entry.status === 'string' && TASK_STATUSES.includes(entry.status) ? (entry.status as TaskStatus) : 'pending';
  return { content: plainText(typeof entry.content === 'string' ? entry.content : ''), status, priority: typeof entry.priority === 'string' ? entry.priority : 'medium' };
}

function textPiece(chunk: { content?: unknown; messageId?: unknown }, kind: 'message' | 'reasoning', cursor: MessageCursor): PanelEventBody[] {
  const view = viewContent(chunk.content);
  if (view.kind === 'other') return [{ type: 'notice', text: view.notice }];
  if (kind === 'reasoning') return [{ type: 'reasoning', id: 'reasoning', text: view.text }];
  if (typeof chunk.messageId === 'string' && chunk.messageId !== cursor.current) {
    const closing = finishMessage(cursor);
    cursor.current = `a-${chunk.messageId.slice(0, 64)}`;
    return [...closing, { type: 'message', id: cursor.current, role: 'agent', text: view.text, done: false }];
  }
  if (!cursor.current) {
    cursor.counter += 1;
    cursor.current = `m${cursor.counter}`;
  }
  return [{ type: 'message', id: cursor.current, role: 'agent', text: view.text, done: false }];
}

/** The panel events for one `session/update` payload. Kinds the panel does not show produce nothing. */
export function eventsForUpdate(update: unknown, cursor: MessageCursor): PanelEventBody[] {
  const body = (update ?? {}) as Record<string, unknown>;
  switch (body.sessionUpdate) {
    case 'agent_message_chunk':
      return textPiece(body, 'message', cursor);
    case 'agent_thought_chunk':
      return textPiece(body, 'reasoning', cursor);
    case 'tool_call':
    case 'tool_call_update': {
      const title = typeof body.title === 'string' ? plainText(body.title) : undefined;
      const status = typeof body.status === 'string' ? body.status : undefined;
      return [{ type: 'tool', id: String(body.toolCallId).slice(0, 128), ...(title !== undefined ? { title } : {}), ...(status !== undefined ? { status } : {}) }];
    }
    case 'plan':
      return [{ type: 'tasks', entries: (Array.isArray(body.entries) ? body.entries : []).map(taskEntry) }];
    default:
      return [];
  }
}
