/** Server mode: the ways a person's working copy meets the published default branch. */
import React from 'react';
import { ArrowDown, ArrowUp, Upload } from 'lucide-react';
import type { WorkingCopyInfo } from '../projects/api';

/**
 * Offers **Pull from <default>** and, to those who may publish, **Publish to <default>**, which
 * moves the default branch on the server only and never pushes to a remote, and **Push
 * <default>**, which sends the default branch to the remote.
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
  return (
    <>
      <div className="scm-published" role="group" aria-label="Published branch">
        <button hidden={!canPull} disabled={disabled} onClick={onPull}>
          <ArrowDown size={13} />
          Pull from {target}
        </button>
        <button
          disabled={disabled || !canPublish}
          title={canPublish ? publishHint : publishTitle}
          onClick={onPublish}
        >
          <Upload size={13} />
          Publish to {target}
        </button>
        <button
          hidden={!canPublish || !hasRemote}
          disabled={disabled}
          title={`Send ${target} as published here to the remote`}
          onClick={onPushDefault}
        >
          <ArrowUp size={13} />
          Push {target}
        </button>
      </div>
      {!canPublish && publishTitle && (
        <small className="scm-hint">
          {publishTitle} to publish to {target}.
        </small>
      )}
    </>
  );
}
