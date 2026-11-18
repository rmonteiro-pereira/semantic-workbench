// The agent's permission questions: shown to the person, answered once from the offered options, and cancelled when nobody answers, the turn is cancelled or the session ends.
import { plainText, type PanelEventBody, type QuestionCard } from './panel-events';

/** Most questions waiting at once; one more is answered "cancelled" without being shown. */
export const MAXIMUM_PENDING_QUESTIONS = 5;
/** Most options shown for one question. */
export const MAXIMUM_QUESTION_OPTIONS = 8;
/** How long a question waits for the person, in milliseconds. */
export const QUESTION_TIMEOUT_MS = 10 * 60_000;

/** The reply the protocol expects: an offered option or "cancelled". */
export type PermissionOutcome = { outcome: 'cancelled' } | { outcome: 'selected'; optionId: string };
/** What happened to an answer from the person. */
export type AnswerResult = 'answered' | 'unknown-question' | 'unknown-option';

/** What the questions need from outside. `schedule` runs a function later and returns the way to stop it. */
export type PermissionQuestionDependencies = {
  emit: (event: PanelEventBody) => void;
  schedule?: (run: () => void, afterMs: number) => () => void;
  timeoutMs?: number;
};

type Waiting = { card: QuestionCard; optionIds: Set<string>; settle: (outcome: PermissionOutcome) => void };

function defaultSchedule(run: () => void, afterMs: number): () => void {
  const timer = setTimeout(run, afterMs);
  return () => clearTimeout(timer);
}

function cardFor(id: string, params: { toolCall?: { title?: unknown }; options?: { optionId: string; name: string }[] }): QuestionCard {
  const title = typeof params.toolCall?.title === 'string' ? params.toolCall.title : 'The agent asks for permission.';
  const options = (params.options ?? []).slice(0, MAXIMUM_QUESTION_OPTIONS).map(option => ({ id: option.optionId, label: plainText(option.name) }));
  return { id, text: plainText(title), options };
}

/** Keeps the questions of one session. */
export function createPermissionQuestions(dependencies: PermissionQuestionDependencies) {
  const schedule = dependencies.schedule ?? defaultSchedule;
  const waiting = new Map<string, Waiting>();
  let counter = 0;

  function settleQuestion(id: string, outcome: PermissionOutcome): boolean {
    const question = waiting.get(id);
    if (!question) return false;
    waiting.delete(id);
    question.settle(outcome);
    dependencies.emit({ type: 'question', question: question.card, settled: true });
    return true;
  }

  return {
    /** Shows a question and waits for the outcome. A question over the limit is cancelled at once and never shown. */
    ask(params: { toolCall?: { title?: unknown }; options?: { optionId: string; name: string }[] }): Promise<PermissionOutcome> {
      if (waiting.size >= MAXIMUM_PENDING_QUESTIONS) return Promise.resolve({ outcome: 'cancelled' });
      counter += 1;
      const id = `q${counter}`;
      const card = cardFor(id, params);
      return new Promise<PermissionOutcome>(resolve => {
        const stopTimer = schedule(() => settleQuestion(id, { outcome: 'cancelled' }), dependencies.timeoutMs ?? QUESTION_TIMEOUT_MS);
        waiting.set(id, {
          card,
          optionIds: new Set(card.options.map(option => option.id)),
          settle: outcome => {
            stopTimer();
            resolve(outcome);
          },
        });
        dependencies.emit({ type: 'question', question: card });
      });
    },
    /** Records the person's choice. An unknown question or an option that was not offered changes nothing. */
    answer(id: string, choice: { option: string } | { cancel: true }): AnswerResult {
      const question = waiting.get(id);
      if (!question) return 'unknown-question';
      if ('cancel' in choice) {
        settleQuestion(id, { outcome: 'cancelled' });
        return 'answered';
      }
      if (!question.optionIds.has(choice.option)) return 'unknown-option';
      settleQuestion(id, { outcome: 'selected', optionId: choice.option });
      return 'answered';
    },
    /** Answers every waiting question "cancelled", as the protocol requires when a turn is cancelled, and as an ended session does. */
    cancelAll(): void {
      for (const id of waiting.keys()) settleQuestion(id, { outcome: 'cancelled' });
    },
    get pendingCount(): number {
      return waiting.size;
    },
  };
}

export type PermissionQuestions = ReturnType<typeof createPermissionQuestions>;
