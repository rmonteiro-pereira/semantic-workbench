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
  const missingIdentity = (status.repositories ?? []).filter(
    repo => !repo.identityConfigured && repo.projects.length,
  );
  const repositoryCount =
    missingIdentity.length === 1 ? 'one repository' : `${missingIdentity.length} repositories`;
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
        label: 'Set Git identity…',
        run: () =>
          openGitSetup({
            kind: 'identity',
            project: missingIdentity[0].projects[0],
            everyRepository: true,
          }),
      },
    });
  const m = status.migration;
  if (m?.status === 'completed')
    notes.push({
      id: 'migration',
      tone: 'info',
      text:
        `Moved ${m.verified} of ${m.files} documents from the previous SQLite workspace into ` +
        `${m.projects.length} project folders; every file's SHA-256 matched. ` +
        `The old database is unchanged and a copy is in ${m.backup}.`,
    });
  if (m && m.status !== 'completed')
    notes.push({
      id: 'migration',
      tone: 'warning',
      text: `The previous SQLite workspace was not migrated: ${m.reason} It will be tried again on the next start.`,
    });
  for (const r of status.recovery ?? [])
    notes.push({
      id: 'recovery-' + r.opId,
      tone: 'info',
      text: `An interrupted ${r.kind} operation was ${r.outcome === 'completed' ? 'completed' : 'rolled back'} at start-up.`,
    });
  const visible = notes.filter(n => !dismissed.includes(n.id));
  if (!visible.length) return null;
  return (
    <div className="git-banners">
      {visible.map(n => (
        <div
          key={n.id}
          role={n.tone === 'warning' ? 'alert' : 'status'}
          className={`git-banner ${n.tone}`}
        >
          <span>{n.text}</span>
          {n.action && (
            <button className="git-banner-action" onClick={n.action.run}>
              {n.action.label}
            </button>
          )}
          <button aria-label="Dismiss message" onClick={() => setDismissed(d => [...d, n.id])}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
