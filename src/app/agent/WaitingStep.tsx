// Connection instructions stay selectable and wrap at the sheet edge.
import { useEffect, useState } from 'react';
import type { StartedSession } from './agent-api';

/** Shows the person-run command while waiting for the relay to connect. */
export function WaitingStep({ session }: { session?: StartedSession }) {
  const [now, setNow] = useState(Date.now);
  const [copy, setCopy] = useState('');
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(session!.command);
      setCopy('Command copied.');
    } catch {
      setCopy('Select and copy the command below.');
    }
  }
  return (
    <section aria-label="Connection instructions">
      <p role="status">Waiting for your agent. The conversation starts when your relay connects.</p>
      {session ? (
        <>
          <p>Run this on your machine, replacing the agent command with the one you choose.</p>
          <pre>{session.command}</pre>
          <button onClick={copyCommand}>Copy command</button>
          <p role="status">{copy}</p>
          <p>
            Code: {session.code}. Expires in {Math.max(0, Math.ceil((session.expiresAt - now) / 60_000))} minutes.
          </p>
        </>
      ) : (
        <p>Connection instructions are shown once. End this session and start another if your relay has not connected.</p>
      )}
    </section>
  );
}
