/** Server mode: the ways a person's working copy meets the published default branch. */
import React from 'react';
import { ArrowDown, ArrowUp, Upload } from 'lucide-react';
import type { WorkingCopyInfo } from '../projects/api';

// Says what Publish does, or which role it needs, beside its button.
function publishLine(canPublish: boolean, publishTitle: string | undefined, target: string) {
  if (canPublish) return `Make your branch the published ${target} on this server.`;
  if (publishTitle) return `${publishTitle} to publish to ${target}.`;
  return `Publishing to ${target} is not allowed for your role.`;
}

/**
 * Offers **Pull from <default>** and, to those who may publish, **Publish to <default>**, which
 * moves the default branch on the server only and never pushes to a remote, and **Push
 * <default>**, which sends the default branch to the remote. Each button has a line saying what
 * it does, and a person who may not publish is told which role it needs beside the button.
 */
export function DefaultBranchActions({
  copy,
  canPull,
  canPublish,
  publishTitle,
  hasRemote,
  disabled,
  onPull,
  onPublish,
  onPushDefault,
}: {
  copy: WorkingCopyInfo;
  canPull: boolean;
  canPublish: boolean;
  /** Names the role publishing needs, shown when the person cannot publish. */
  publishTitle?: string;
  hasRemote: boolean;
  disabled: boolean;
  onPull: () => void;
  onPublish: () => void;
  onPushDefault: () => void;
}) {
  const target = copy.defaultBranch;
  // Publishing and pushing are separate steps, and people expect a publish to reach the remote.
  const publishHint = `Publish your branch to ${target} here. This does not push; Push ${target} does.`;
  const publishExplanation = publishLine(canPublish, publishTitle, target);
  return (
    <section aria-label="Published branch">
      <h3>Published branch</h3>
      <ul className="scm-sync-actions" role="group" aria-label="Published branch actions">
        <li hidden={!canPull}>
          <button disabled={disabled} onClick={onPull}>
            <ArrowDown size={13} />
            Pull from {target}
          </button>
          <span>Bring the latest {target} into your branch.</span>
        </li>
        <li>
          <button disabled={disabled || !canPublish} title={canPublish ? publishHint : publishTitle} onClick={onPublish}>
            <Upload size={13} />
            Publish to {target}
          </button>
          <span>{publishExplanation}</span>
        </li>
        <li hidden={!canPublish || !hasRemote}>
          <button disabled={disabled} title={`Send ${target} as published here to the remote`} onClick={onPushDefault}>
            <ArrowUp size={13} />
            Push {target}
          </button>
          <span>Send {target} as published here to the remote.</span>
        </li>
      </ul>
    </section>
  );
}
