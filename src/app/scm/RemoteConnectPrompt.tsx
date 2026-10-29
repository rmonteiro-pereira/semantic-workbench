/** Asks for the account a refused remote action needs, and continues that action once the
 * browser returns from the consent. */
import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { connectAccount, type ConnectKind } from '../auth/ConnectedAccounts';

/** A remote action of the Source Control panel. */
export type RemoteAction = 'fetch' | 'pull' | 'push' | 'sync';
/** The name of a remote action as the panel's buttons and messages write it. */
export function actionTitle(action: string): string {
  return action[0].toUpperCase() + action.slice(1);
}
const PENDING_KEY = 'sw-remote-after-connect';
const ACTIONS: RemoteAction[] = ['fetch', 'pull', 'push', 'sync'];

/** The account a refused request asks the person to connect, or null for any other error. */
export function connectRequired(problem: unknown): ConnectKind | null {
  const refused = problem as { status?: number; body?: { connect?: unknown } } | null;
  if (refused?.status !== 428) return null;
  return refused.body?.connect === 'azure-devops' ? 'azure-devops' : 'github';
}

// Without session storage the action is simply not resumed; the person presses it again.
function rememberPendingAction(pending: { project: string; action: RemoteAction }) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    console.warn('The remote action cannot be resumed automatically after connecting.');
  }
}

function takePendingAction(project: string): RemoteAction | null {
  let pending: { project?: unknown; action?: unknown } | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null');
    if (pending?.project === project) sessionStorage.removeItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (pending?.project !== project) return null;
  return ACTIONS.find(action => action === pending?.action) ?? null;
}

/** Runs once the remote action that waited for consent, when its project's panel is ready. */
export function useResumeAfterConnect(project: string, ready: boolean, resume: (action: RemoteAction) => void) {
  useEffect(() => {
    if (!ready) return;
    const action = takePendingAction(project);
    if (action) resume(action);
    // The resume handler changes every render; the action must run once per project only.
  }, [project, ready]);
}

const PROMPTS: Record<ConnectKind, { text: string; button: string }> = {
  github: {
    text: 'Connect your GitHub account to continue. Git then uses your own GitHub access.',
    button: 'Connect GitHub',
  },
  'azure-devops': {
    text: 'Sign in again so the workbench can reach Azure DevOps on your behalf.',
    button: 'Sign in again',
  },
};

/** Asks for the account a refused remote action needs; the action continues after consent. */
export function ConnectPrompt({ kind, project, action, onDismiss }: { kind: ConnectKind; project: string; action: RemoteAction; onDismiss: () => void }) {
  const prompt = PROMPTS[kind];
  function connectThenContinue() {
    rememberPendingAction({ project, action });
    connectAccount(kind);
  }
  return (
    <div role="alert" className="scm-note warning">
      <AlertTriangle size={14} />
      <div>
        <span className="scm-note-text">{prompt.text}</span>
        <button className="scm-note-action" onClick={connectThenContinue}>
          {prompt.button}
        </button>
      </div>
      <button aria-label="Dismiss" onClick={onDismiss}>
        <X size={13} />
      </button>
    </div>
  );
}
