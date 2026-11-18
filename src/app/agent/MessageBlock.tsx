// Agent output is always text; markup never becomes a link, image or script.
/** Displays one growing message and announces it only when complete. */
export function MessageBlock({ role, text, done }: { role: 'user' | 'agent'; text: string; done: boolean }) {
  return (
    <article className="agent-message" aria-label={role === 'agent' ? 'Agent message' : 'Your message'}>
      <strong>{role === 'agent' ? 'Agent' : 'You'}</strong>
      <div className="agent-text" role={role === 'agent' && done ? 'status' : undefined} aria-live={role === 'agent' && done ? 'polite' : 'off'}>
        {text}
      </div>
    </article>
  );
}
