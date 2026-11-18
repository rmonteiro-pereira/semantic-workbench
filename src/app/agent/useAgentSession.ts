// Owns the panel's in-memory connection and stops its stream when the sheet closes.
import { useEffect, useRef, useState } from 'react';
import { emptyAgentView, reduceAgentEvent, streamEndReason } from './agent-events';
import { followPanel, panelAction, startPanelSession, type StartedSession } from './agent-api';

const SESSION_KEY = 'workbench-agent-session';

/** Keeps only the session id across a page reload; transcript text never enters browser storage. */
export function useAgentSession() {
  const [id, setId] = useState(() => sessionStorage.getItem(SESSION_KEY) ?? '');
  const [started, setStarted] = useState<StartedSession>();
  const [view, setView] = useState(emptyAgentView);
  const latest = useRef(view);
  latest.current = view;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [replace, setReplace] = useState(false);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    async function follow() {
      try {
        const status = await followPanel(id, latest.current.sequence, controller.signal, event => {
          setDisconnected(false);
          setView(previous => reduceAgentEvent(previous, event));
        });
        if (controller.signal.aborted) return;
        const reason = streamEndReason(status);
        if (reason) {
          setView(previous => ({ ...previous, state: 'ended', reason, questions: [] }));
          sessionStorage.removeItem(SESSION_KEY);
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (latest.current.state === 'ended') return;
      setDisconnected(true);
      retry = setTimeout(() => void follow(), 1000);
    }
    void follow();
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [id]);

  async function act(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'The connection failed. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    await act(async () => {
      try {
        const result = await startPanelSession(replace);
        setView(emptyAgentView());
        setStarted(result);
        setId(result.id);
        sessionStorage.setItem(SESSION_KEY, result.id);
        setReplace(false);
      } catch (problem) {
        if ((problem as { status?: number }).status === 409) setReplace(true);
        throw problem;
      }
    });
  }
  async function end(): Promise<boolean> {
    if (!id || view.state === 'ended') {
      sessionStorage.removeItem(SESSION_KEY);
      return true;
    }
    return act(async () => {
      await panelAction(`/${id}`, undefined, 'DELETE');
      sessionStorage.removeItem(SESSION_KEY);
    });
  }
  return {
    id,
    started,
    view,
    error,
    busy,
    disconnected,
    replace,
    start,
    end,
    act,
    prompt: (text: string, files: string[]) => act(() => panelAction(`/${id}/prompt`, { text, files })),
    cancel: () => act(() => panelAction(`/${id}/cancel`, {})),
    answer: (question: string, choice: { option: string } | { cancel: true }) => act(() => panelAction(`/${id}/questions/${encodeURIComponent(question)}`, choice)),
  };
}
