// Undo uses the ordinary guarded save with the exact version written by the agent.
import { useState } from 'react';
import { api, StaleSave } from '../projects/api';
import { DiffView } from '../scm/DiffView';
import type { ChangeCard as Change } from '../../shared/agent-panel/events';

/** Restores the earlier text through the normal browser save, preserving version conflicts. */
export async function undoAgentChange(card: Change): Promise<void> {
  const match = /^\/workbench\/([^/]+)\/(.+)$/.exec(card.path);
  if (!match || card.outcome !== 'accepted' || !card.version || card.before === undefined) throw new Error('This change cannot be undone.');
  await api.save(match[1], match[2], card.version, card.before);
}

/** Displays an accepted or refused edit, its diff and the result of an ordinary Undo save. */
export function ChangeCard({ card }: { card: Change }) {
  const [busy, setBusy] = useState(false);
  const [undone, setUndone] = useState(false);
  const [notice, setNotice] = useState('');
  async function undo() {
    setBusy(true);
    try {
      await undoAgentChange(card);
      setUndone(true);
      setNotice('Earlier text restored.');
    } catch (error) {
      setNotice(error instanceof StaleSave ? 'The file changed since this edit. Undo did not save anything.' : error instanceof Error ? error.message : 'Undo failed. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="agent-change" aria-label={`Change to ${card.path}`}>
      <h3>{card.path}</h3>
      <p>{card.outcome === 'accepted' ? 'Saved' : `Refused: ${card.reason ?? 'Not available'}`}</p>
      {card.rewritten && <p>The project guard changed the text. The diff shows what was stored.</p>}
      {card.before !== undefined && card.after !== undefined && (
        <DiffView before={card.before} after={card.after} filename={card.path} beforeLabel="Before" afterLabel="Stored" label={`Diff for ${card.path}`} />
      )}
      {card.findings?.map((finding, index) => (
        <p key={index}>{finding}</p>
      ))}
      {card.outcome === 'accepted' && (
        <button onClick={undo} disabled={busy || undone}>
          {undone ? 'Undone' : 'Undo'}
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
    </article>
  );
}
