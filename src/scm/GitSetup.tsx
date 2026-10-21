/** Opens the Git setup dialogs (identity, remote, clone, credential guide) from anywhere. */
import React, { createContext, useContext, useState } from 'react';
import { IdentityDialog } from './IdentityDialog';
import { RemoteDialog } from './RemoteDialog';
import { CredentialGuide } from './CredentialGuide';
import { CloneDialog } from './CloneDialog';

/** Which Git setup dialog is open, and for which project. */
export type GitSetupDialog =
  | { kind: 'identity'; project: string; everyRepository?: boolean }
  | { kind: 'remote'; project: string }
  | { kind: 'clone' }
  | { kind: 'credentials' };

type Opener = (dialog: GitSetupDialog) => void;

const GitSetupContext = createContext<Opener>(() => {});

/** Returns the function that opens a Git setup dialog. */
export const useGitSetup = () => useContext(GitSetupContext);

/** Provides the dialog opener and renders the open dialog above the app. */
export function GitSetupProvider({
  children,
  onCloned,
}: {
  children: React.ReactNode;
  onCloned: (slug: string) => void;
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
      {dialog?.kind === 'credentials' && <CredentialGuide onClose={close} />}
      {dialog?.kind === 'clone' && (
        <CloneDialog
          onClose={close}
          onOpenProject={slug => {
            close();
            onCloned(slug);
          }}
          onCredentials={() => setDialog({ kind: 'credentials' })}
        />
      )}
    </GitSetupContext.Provider>
  );
}
