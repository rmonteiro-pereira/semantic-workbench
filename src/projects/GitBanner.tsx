import React, { useState } from 'react';
import type { WorkspaceStatus } from './api';
// FR-090: missing Git or a missing identity is explained; everything that does not need Git keeps
// working. Migration and crash-recovery outcomes from start-up are reported once here as well.
export function GitBanner({ status }: { status: WorkspaceStatus | null }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  if (!status) return null;
  const notes: { id: string; tone: 'warning' | 'info'; text: string }[] = [];
  if (!status.gitAvailable)
    notes.push({
      id: 'git',
      tone: 'warning',
      text: 'Git 2.40 or newer was not found. Projects work, but they are not version-controlled until Git is installed and the workbench is restarted.',
    });
  else if (!status.identityConfigured)
    notes.push({
      id: 'identity',
      tone: 'warning',
      text: 'Git has no user.name or user.email. Set them with git config --global user.name "Your Name" and git config --global user.email you@example.com, then restart; until then, imports are not committed.',
    });
  const m = status.migration;
  if (m?.status === 'completed')
    notes.push({
      id: 'migration',
      tone: 'info',
      text: `Moved ${m.verified} of ${m.files} documents from the previous SQLite workspace into ${m.projects.length} project folders; every file's SHA-256 matched. The old database is unchanged and a copy is in ${m.backup}.`,
    });
  if (m && m.status !== 'completed')
    notes.push({
      id: 'migration',
      tone: 'warning',
      text: `The previous SQLite workspace was not migrated: ${m.reason} It will be tried again on the next start.`,
    });
  for (const r of status.recovery)
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
          <button aria-label="Dismiss message" onClick={() => setDismissed(d => [...d, n.id])}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
