// Normalizes agent content for plain-text presentation. Event types are shared with the browser.
export type { TaskStatus, TaskEntry, RefusalReason, ChangeCard, QuestionCard, PanelEventBody, PanelEvent } from '../../shared/agent-panel/events';

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
