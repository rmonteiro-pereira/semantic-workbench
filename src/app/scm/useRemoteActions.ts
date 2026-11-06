/** The Git actions that report to the Source Control panel's note: pull, push and publish of a working copy, and the feedback of a remote action. */
import { scm, type FollowResult, type RemoteResult } from '../projects/api';
import { actionTitle } from './RemoteConnectPrompt';

/** Feedback shown above the changes: what an action did, or why it was refused. */
export type Note = {
  tone: 'info' | 'warning';
  text: string;
  paths?: string[];
  commit?: boolean;
};

/** The commit counts a finished Git action left to push and to pull, when there are any. */
function aheadBehind(counts: { ahead?: number; behind?: number }): string {
  if (!counts.ahead && !counts.behind) return '';
  return ` · ${counts.ahead} to push, ${counts.behind} to pull`;
}

type Act = <T>(run: () => Promise<T>, done?: (value: T) => void) => Promise<void>;

type RemoteActionInputs = {
  project: string;
  act: Act;
  guard: (kind: string) => boolean;
  altered: (paths: string[], what: string) => void;
  setNote: (note: Note | null) => void;
  setError: (message: string) => void;
  setSyncOpen: (open: boolean) => void;
};

export function useRemoteActions({ project, act, guard, altered, setNote, setError, setSyncOpen }: RemoteActionInputs) {
  // A fetch found the remote's default branch ahead but left the published one where it is.
  function behindText(follow: FollowResult) {
    const behind = `${follow.branch} is behind ${follow.remote}`;
    if (follow.reason === 'guard') return `${behind}: its new commits hold changes only a Steward or Admin may bring in.`;
    return `${behind}; someone with publish must bring it in.`;
  }
  function reportRemote(action: string, remoteResult: RemoteResult) {
    if (remoteResult.cancelled) setNote({ tone: 'info', text: `${actionTitle(action)} cancelled.` });
    else if (remoteResult.conflicted.length)
      setNote({
        tone: 'warning',
        text: 'The pull stopped on conflicts. Open each file, repair it, stage it, then commit the merge:',
        paths: remoteResult.conflicted,
      });
    else if (!remoteResult.ok) setError(remoteResult.stderr || `${actionTitle(action)} failed.`);
    else if (remoteResult.follow && !remoteResult.follow.followed) setNote({ tone: 'warning', text: behindText(remoteResult.follow) });
    else if (remoteResult.altered.length) altered(remoteResult.altered, action);
    else
      setNote({
        tone: 'info',
        text: `${actionTitle(action)} finished${aheadBehind(remoteResult)}.`,
      });
  }
  // Server mode: the person's copy takes the published branch in, or publishes to it.
  function pullDefault() {
    if (!guard('pull')) return;
    void act(
      () => scm.pullDefault(project),
      r => reportRemote('pull', r),
    );
  }
  function pushDefault() {
    void act(
      () => scm.pushDefault(project),
      r => reportRemote('push', r),
    );
  }
  function publishCopy() {
    void act(
      () => scm.publish(project),
      r => setNote({ tone: 'info', text: `Published to ${r.published}.` }),
    );
  }
  function fromSync(run: () => void) {
    setSyncOpen(false);
    run();
  }
  return { reportRemote, pullDefault, pushDefault, publishCopy, fromSync };
}
