/** Opens the Git setup dialogs (identity, remote, clone, credential guide, a repository's
 * projects) from anywhere. */
import React, { createContext, useContext, useState } from 'react';
import { IdentityDialog } from './IdentityDialog';
import { RemoteDialog } from './RemoteDialog';
import { CredentialGuide } from './CredentialGuide';
import { CloneDialog } from './CloneDialog';
import {
  RepositoryProjectsDialog,
  type StartingChoice,
} from '../projects/RepositoryProjectsDialog';

/** Which Git setup dialog is open, and for which project. */
export type GitSetupDialog =
  | { kind: 'identity'; project: string; everyRepository?: boolean }
  | { kind: 'remote'; project: string }
  | { kind: 'clone' }
  | { kind: 'repository-projects'; repo: string; start?: StartingChoice }
  | { kind: 'credentials'; remote?: string };

type Opener = (dialog: GitSetupDialog) => void;

const GitSetupContext = createContext<Opener>(() => {});

/** Returns the function that opens a Git setup dialog. */
export const useGitSetup = () => useContext(GitSetupContext);

/** Provides the dialog opener and renders the open dialog above the app. */
export function GitSetupProvider({
  children,
  onOpenProject,
}: {
  children: React.ReactNode;
  /** Refreshes the workspace and opens the project's first file. */
  onOpenProject: (slug: string) => void;
}) {
  const [dialog, setDialog] = useState<GitSetupDialog | null>(null);
  const close = () => setDialog(null);
  return (
    <GitSetupContext.Provider value={setDialog}>
      {children}
      {dialog?.kind === 'identity' && (
        <IdentityDialog
          project={dialog.project}
          everyRepository={dialog.everyRepository}
          onClose={close}
        />
      )}
      {dialog?.kind === 'remote' && <RemoteDialog project={dialog.project} onClose={close} />}
      {dialog?.kind === 'credentials' && <CredentialGuide remote={dialog.remote} onClose={close} />}
      {dialog?.kind === 'clone' && (
        <CloneDialog
          onClose={close}
          onOpenProject={slug => {
            close();
            onOpenProject(slug);
          }}
          onCredentials={remote => setDialog({ kind: 'credentials', remote })}
          onChooseProjects={repo =>
            setDialog({ kind: 'repository-projects', repo, start: 'proposed' })
          }
        />
      )}
      {dialog?.kind === 'repository-projects' && (
        <RepositoryProjectsDialog
          repo={dialog.repo}
          start={dialog.start}
          onClose={close}
          onSaved={slugs => {
            close();
            onOpenProject(slugs[0] ?? '');
          }}
        />
      )}
    </GitSetupContext.Provider>
  );
}
