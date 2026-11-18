// What the browser receives: the event types of the panel, and the conversion of agent content into plain text that is safe to show.

/** Whether a task entry is waiting, running or done, as the agent reports it. */
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
/** One entry of the agent's own task list. */
export type TaskEntry = Readonly<{ content: string; status: TaskStatus; priority: string }>;
/** Why a change was not applied. */
export type RefusalReason = 'changed' | 'unread' | 'invalid' | 'not-available' | 'guard' | 'rate-limited';
/** One change the agent made or tried to make, shown as a diff with an Undo when accepted. */
export type ChangeCard = Readonly<{
  id: number;
  path: string;
  outcome: 'accepted' | 'refused';
  reason?: RefusalReason;
  before?: string;
  after?: string;
  version?: string;
  findings?: readonly string[];
  /** The text the guard stored when it rewrote the agent's text. */
  rewritten?: boolean;
}>;
/** A permission question the agent asked. */
export type QuestionCard = Readonly<{ id: string; text: string; options: readonly { id: string; label: string }[] }>;

/** The content of one event, before the buffer numbers it. */
export type PanelEventBody =
  | { type: 'session'; state: 'waiting' | 'connected' | 'working'; agentName?: string; scopes: readonly string[] }
  | { type: 'message'; id: string; role: 'agent' | 'user'; text: string; done: boolean }
  | { type: 'reasoning'; id: string; text: string }
  | { type: 'tool'; id: string; title: string; status: string }
  | { type: 'tasks'; entries: readonly TaskEntry[] }
  | { type: 'change'; card: ChangeCard }
  | { type: 'question'; question: QuestionCard; settled?: boolean }
  | { type: 'notice'; text: string }
  | { type: 'turn'; phase: 'started' | 'finished' | 'cancelled'; stopReason?: string }
  | { type: 'ended'; reason: string };

/** An event as the browser sees it: numbered in the session. */
export type PanelEvent = PanelEventBody & { seq: number };

// Direction and invisible-character controls can make a path or command read differently from what it is, so they are shown as visible markers.
const REVEALED = /[​-‏‪-‮⁠-⁤⁦-⁩﻿\u{e0000}-\u{e007f}]/gu;
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

function marker(character: string): string {
  const codePoint = character.codePointAt(0) ?? 0;
  return `<U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}>`;
}

/** Text as the panel may show it: markup stays text, control characters vanish and hidden direction marks become visible. */
export function plainText(text: string): string {
  return text.replace(CONTROL, '').replace(REVEALED, marker);
}

/** Text of a content block, or a notice that names what could not be shown. */
export type ContentView = { kind: 'text'; text: string } | { kind: 'other'; notice: string };

function describeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** Turns one protocol content block into plain text, or into a notice for any other kind. */
export function viewContent(block: unknown): ContentView {
  if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
    return { kind: 'text', text: plainText((block as { text: string }).text) };
  }
  const rawKind = block && typeof block === 'object' ? (block as { type?: unknown }).type : undefined;
  const kind = typeof rawKind === 'string' && /^[a-z_]{1,32}$/.test(rawKind) ? rawKind : 'unknown';
  const size = Buffer.byteLength(JSON.stringify(block) ?? '');
  return { kind: 'other', notice: `The agent sent content of kind ${kind} (${describeSize(size)}), which this panel does not show.` };
}
