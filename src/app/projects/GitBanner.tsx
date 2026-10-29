/** Explains Git setup problems and startup recovery results while non-Git features remain
 * available. */
import React, { useState } from 'react';
import type { WorkspaceStatus } from './api';
import { useGitSetup } from '../scm/GitSetup';
// Missing Git or a missing identity is explained, with a way to set the identity; everything that
// does not need Git keeps working.
// Migration and crash-recovery outcomes from start-up are reported once here as well.
/** Displays Git setup and startup recovery information. */
export function GitBanner({ status }: { status: WorkspaceStatus | null }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const openGitSetup = useGitSetup();
  if (!status) return null;
  // Repositories whose commits have no author yet; the identity is checked live by the API.
  const missingIdentity = (status.repositories ?? []).filter(repo => !repo.identityConfigured && repo.projects.length);
  const repositoryCount = missingIdentity.length === 1 ? 'one repository' : `${missingIdentity.length} repositories`;
  const notes: {
    id: string;
    tone: 'warning' | 'info';
    text: string;
    action?: { label: string; run: () => void };
  }[] = [];
  if (!status.gitAvailable)
    notes.push({
      id: 'git',
      tone: 'warning',
      text: 'Git 2.40 or newer was not found. Projects work, but they are not version-controlled until Git is installed and the workbench is restarted.',
    });
  else if (missingIdentity.length)
    notes.push({
      id: 'identity',
      tone: 'warning',
      text: `Git has no user.name or user.email for ${repositoryCount}, so changes there cannot be committed yet.`,
      action: {
        label: 'Set Git identity',
        run: () =>
          openGitSetup({
            kind: 'identity',
            project: missingIdentity[0].projects[0],
            everyRepository: true,
          }),
      },
    });
  const migration = status.migration;
  if (migration?.status === 'completed')
    notes.push({
      id: 'migration',
      tone: 'info',
      text:
        `Moved ${migration.verified} of ${migration.files} documents from the previous SQLite workspace into ${migration.projects.length} project folders; every file's SHA-256 matched. ` +
        `The old database is unchanged and a copy is in ${migration.backup}.`,
    });
  if (migration && migration.status !== 'completed')
    notes.push({
      id: 'migration',
      tone: 'warning',
      text: `The previous SQLite workspace was not migrated: ${migration.reason} It will be tried again on the next start.`,
    });
  for (const recovery of status.recovery ?? [])
    notes.push({
      id: 'recovery-' + recovery.opId,
      tone: 'info',
      text: `An interrupted ${recovery.kind} operation was ${recovery.outcome === 'completed' ? 'completed' : 'rolled back'} at start-up.`,
    });
  const visible = notes.filter(n => !dismissed.includes(n.id));
  if (!visible.length) return null;
  return (
    <div className="git-banners">
      {visible.map(note => (
        <div key={note.id} role={note.tone === 'warning' ? 'alert' : 'status'} className={`git-banner ${note.tone}`}>
          <span>{note.text}</span>
          {note.action && (
            <button className="git-banner-action" onClick={note.action.run}>
              {note.action.label}
            </button>
          )}
          <button aria-label="Dismiss message" onClick={() => setDismissed(d => [...d, note.id])}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
