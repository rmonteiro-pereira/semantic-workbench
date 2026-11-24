// Reduces numbered panel events without retaining a second copy of streamed message pieces.
import type { PanelEvent, TaskEntry, QuestionCard, ChangeCard } from '../../shared/agent-panel/events';

/** A transcript entry, including whether it arrived after cancellation. */
export type TranscriptEntry = { key: string; event: PanelEvent; afterCancel: boolean };
/** In-memory view of one panel session. */
export type AgentView = {
  sequence: number;
  state: 'waiting' | 'connected' | 'working' | 'ended';
  agentName: string;
  reason?: string;
  cancelled: boolean;
  entries: TranscriptEntry[];
  tasks: readonly TaskEntry[];
  questions: readonly QuestionCard[];
  changes: readonly ChangeCard[];
};

/** Starts the view before any event has arrived. */
export function emptyAgentView(): AgentView {
  return { sequence: 0, state: 'waiting', agentName: 'Your agent', cancelled: false, entries: [], tasks: [], questions: [], changes: [] };
}

function transcript(view: AgentView, event: PanelEvent): TranscriptEntry[] {
  const key = 'id' in event ? `${event.type}-${event.id}` : `${event.type}-${event.seq}`;
  const previous = view.entries.find(entry => entry.key === key);
  let combined = event;
  if (previous && event.type === 'message' && previous.event.type === 'message') combined = { ...event, text: previous.event.text + event.text };
  if (previous && event.type === 'reasoning' && previous.event.type === 'reasoning') combined = { ...event, text: previous.event.text + event.text };
  if (previous && event.type === 'tool' && previous.event.type === 'tool') combined = { ...previous.event, ...event };
  const entry = { key, event: combined, afterCancel: previous?.afterCancel || view.cancelled };
  return previous ? view.entries.map(item => (item.key === key ? entry : item)) : [...view.entries, entry];
}

/** Applies each event once, preserving order across a stream reconnect. */
export function reduceAgentEvent(view: AgentView, event: PanelEvent): AgentView {
  if (event.seq <= view.sequence) return view;
  const next = { ...view, sequence: event.seq };
  if (event.type === 'session') return { ...next, state: event.state, agentName: event.agentName ?? view.agentName };
  if (event.type === 'ended') return { ...next, state: 'ended', reason: event.reason, questions: [] };
  if (event.type === 'tasks') return { ...next, tasks: event.entries };
  if (event.type === 'change') return { ...next, changes: [...view.changes, event.card] };
  if (event.type === 'question') {
    const others = view.questions.filter(question => question.id !== event.question.id);
    return { ...next, questions: event.settled ? others : [...others, event.question] };
  }
  if (event.type === 'turn') return { ...next, state: event.phase === 'started' ? 'working' : 'connected', cancelled: event.phase === 'cancelled' };
  return { ...next, entries: transcript(view, event) };
}

/** A missing session after a known connection means the server no longer holds its memory. */
export function streamEndReason(status: number): 'server-restarted' | undefined {
  return status === 404 ? 'server-restarted' : undefined;
}
