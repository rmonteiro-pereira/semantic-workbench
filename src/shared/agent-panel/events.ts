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
  | { type: 'tool'; id: string; title?: string; status?: string }
  | { type: 'tasks'; entries: readonly TaskEntry[] }
  | { type: 'change'; card: ChangeCard }
  | { type: 'question'; question: QuestionCard; settled?: boolean }
  | { type: 'notice'; text: string }
  | { type: 'turn'; phase: 'started' | 'finished' | 'cancelled'; stopReason?: string }
  | { type: 'ended'; reason: string };

/** An event as the browser sees it: numbered in the session. */
export type PanelEvent = PanelEventBody & { seq: number };
