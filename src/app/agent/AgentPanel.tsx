// A person-controlled conversation sheet; closing it ends the connection before removing the UI.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ConnectStep } from './ConnectStep';
import { WaitingStep } from './WaitingStep';
import { SessionNotice } from './SessionNotice';
import { Transcript } from './Transcript';
import { TaskList } from './TaskList';
import { ChangeCard } from './ChangeCard';
import { QuestionCard } from './QuestionCard';
import { PromptBox } from './PromptBox';
import { useAgentSession } from './useAgentSession';
import './AgentPanel.css';

/** Displays connection instructions, agent work, guarded edits and permission questions. */
export function AgentPanel({ onClose }: { onClose(): void }) {
  const session = useAgentSession();
  const [view, busy] = [session.view, session.busy];
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => closeButton.current?.focus(), []);
  async function close() {
    if (busy) return;
    if (await session.end()) onClose();
  }
  function closeWithEscape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    void close();
  }
  const connected = view.state === 'connected' || view.state === 'working';
  return (
    <aside className="agent-panel" aria-label="Agent panel" onKeyDown={closeWithEscape}>
      <header>
        <h2>Agent panel</h2>
        <button ref={closeButton} onClick={close} disabled={busy}>
          Close agent panel
        </button>
      </header>
      {!session.id && <ConnectStep busy={busy} replace={session.replace} error={session.error} start={session.start} close={onClose} />}
      <div className="agent-scroll">
        {session.id && view.state === 'waiting' && <WaitingStep session={session.started} />}
        {connected && (
          <p role="status">
            {view.agentName} · {view.state === 'working' ? 'Working' : 'Connected'}
          </p>
        )}
        {session.disconnected && <p role="status">Disconnected from the event stream. Reconnecting…</p>}
        {session.error && session.id && <p role="alert">{session.error} Try the action again.</p>}
        {session.id && <Transcript entries={view.entries} />}
        <TaskList entries={view.tasks} />
        {view.changes.map(card => (
          <ChangeCard key={card.id} card={card} />
        ))}
        {view.state === 'ended' && (
          <>
            <SessionNotice reason={view.reason ?? 'closed'} />
            <button disabled={busy} onClick={session.start}>
              Start a new session
            </button>
          </>
        )}
        {session.id && view.state !== 'ended' && (
          <button disabled={busy} onClick={session.end}>
            End session
          </button>
        )}
      </div>
      {view.questions.map(question => (
        <QuestionCard key={question.id} question={question} busy={busy} answer={choice => void session.answer(question.id, choice)} />
      ))}
      {connected && <PromptBox disabled={busy || session.disconnected} working={view.state === 'working'} send={session.prompt} cancel={session.cancel} />}
    </aside>
  );
}
