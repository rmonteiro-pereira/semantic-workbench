// Permission options remain untrusted text and cannot widen connection authority.
import { useEffect, useRef } from 'react';
import type { QuestionCard as Question } from '../../shared/agent-panel/events';

/** Focuses the first offered option and lets the person answer or cancel the question. */
export function QuestionCard({ question, busy, answer }: { question: Question; busy: boolean; answer(choice: { option: string } | { cancel: true }): void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!busy) first.current?.focus();
  }, [question.id, busy]);
  return (
    <section className="agent-question" role="alert" aria-label="Agent permission question">
      <h3>{question.text}</h3>
      <p>Your answer does not grant extra access to the workbench.</p>
      <div className="agent-actions">
        {question.options.map((option, index) => (
          <button key={option.id} ref={index === 0 ? first : undefined} disabled={busy} onClick={() => answer({ option: option.id })}>
            {option.label}
          </button>
        ))}
        <button disabled={busy} onClick={() => answer({ cancel: true })}>
          Cancel question
        </button>
      </div>
    </section>
  );
}
