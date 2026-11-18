// Message and tool updates retain their order; cancellation labels late output explicitly.
import type { TranscriptEntry } from './agent-events';
import { MessageBlock } from './MessageBlock';

/** Displays untrusted conversation text without interpreting markup. */
export function Transcript({ entries }: { entries: readonly TranscriptEntry[] }) {
  if (!entries.length) return <p>Your conversation will appear here. Ask your agent to read or change a definition.</p>;
  return (
    <section aria-label="Conversation">
      {entries.map(({ key, event, afterCancel }) => (
        <div key={key}>
          {afterCancel && <p>Arrived after cancel</p>}
          {event.type === 'message' && <MessageBlock role={event.role} text={event.text} done={event.done} />}
          {event.type === 'tool' && (
            <p>
              Tool: {event.title ?? 'Agent tool'} — {event.status ?? 'Waiting'}
            </p>
          )}
          {event.type === 'notice' && <p role="status">{event.text}</p>}
          {event.type === 'reasoning' && (
            <details>
              <summary>Agent reasoning</summary>
              <p className="agent-text">{event.text}</p>
            </details>
          )}
        </div>
      ))}
    </section>
  );
}
