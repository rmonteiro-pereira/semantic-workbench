/** Rewrites one Tessera ontology of the working copy as standard Ossie after the person has seen what is dropped and what changes. */
import React, { useEffect, useState } from 'react';
import { Modal } from '../projects/Modal';
import type { ProjectInfo } from '../projects/api';
import { DiffView } from '../scm/DiffView';
import { Findings } from './CompileDialog';
import { LossPreview } from './LossPreview';
import { useConvert, type ConvertControl, type ConvertReview, type ConvertTarget } from './use-convert';
import './compile.css';

type Props = {
  project: ProjectInfo;
  target: ConvertTarget;
  /** What Git says about the file: only a clean file can be converted, so that Git holds the backup. */
  gitState: string;
  /** Whether the editor holds text that is not saved yet. */
  unsaved: boolean;
  onClose: () => void;
  onConverted: () => void;
};

/** Says why the file cannot be converted now, or nothing when it can. */
export function conversionBlocker(options: { gitState: string; unsaved: boolean }): string | null {
  if (options.unsaved) return 'This file has edits that are not saved. Save them, commit them, then convert.';
  if (options.gitState !== 'clean') return 'This file has changes that are not committed. Commit or discard them first, so Git holds the backup.';
  return null;
}

const WARNING =
  'This rewrites the file in your working copy as standard Ossie. Comments and layout may differ from before. The committed version in Git is your backup. Nothing is committed or published.';

function Review({ review, path, confirmed, onConfirm }: { review: ConvertReview; path: string; confirmed: boolean; onConfirm: (value: boolean) => void }) {
  return (
    <div className="convert-review">
      <p className="delete-warning" role="note">
        {WARNING}
      </p>
      <LossPreview report={{ ...review.report, losses: review.fileLosses }} />
      <p className="compile-note">The digest covers every file of the project, so a change to another file asks for a new review.</p>
      <div className="convert-diff">
        <DiffView before={review.before} after={review.after} filename={path} beforeLabel="Before, Tessera" afterLabel="After, standard Ossie" label={`Changes to ${path}`} />
      </div>
      <label className="check-row">
        <input type="checkbox" checked={confirmed} onChange={event => onConfirm(event.target.checked)} />
        <span>I have reviewed what is dropped and what changes.</span>
      </label>
    </div>
  );
}

function ConvertBody({ control, path, confirmed, onConfirm }: { control: ConvertControl; path: string; confirmed: boolean; onConfirm: (value: boolean) => void }) {
  const { view } = control;
  if (view.status === 'loading')
    return (
      <div className="compile-placeholder" role="status">
        Reviewing the conversion…
      </div>
    );
  if (view.status === 'review' || view.status === 'converting') return <Review review={view.review} path={path} confirmed={confirmed} onConfirm={onConfirm} />;
  if (view.status === 'refused')
    return (
      <div className="compile-state">
        <p className="compile-state-title">The file cannot be converted yet. Fix these findings first.</p>
        <Findings findings={view.findings} />
      </div>
    );
  if (view.status === 'done')
    return (
      <p role="status" className="compile-state-title">
        Converted. {path} is now standard Ossie in your working copy. Commit it as you would any change.
      </p>
    );
  return (
    <p role={view.status === 'error' ? 'alert' : 'status'} className={view.status === 'error' ? 'dialog-error' : 'compile-unpublished'}>
      {view.message}
    </p>
  );
}

function ConvertFooter({ control, confirmed, onClose }: { control: ConvertControl; confirmed: boolean; onClose: () => void }) {
  const { view } = control;
  return (
    <>
      <button type="button" onClick={onClose} disabled={view.status === 'converting'}>
        {view.status === 'done' ? 'Done' : 'Cancel'}
      </button>
      {(view.status === 'changed' || view.status === 'error') && (
        <button type="button" onClick={control.reload}>
          Review again
        </button>
      )}
      {(view.status === 'review' || view.status === 'converting') && (
        <button type="button" className="primary" disabled={!confirmed || view.status === 'converting'} onClick={control.convert}>
          {view.status === 'converting' ? 'Converting…' : 'Convert to standard'}
        </button>
      )}
    </>
  );
}

function ConvertReviewDialog({ project, target, onClose, onConverted }: Pick<Props, 'project' | 'target' | 'onClose' | 'onConverted'>) {
  const [confirmed, setConfirmed] = useState(false);
  // The review is about the file as it was when the dialog opened, even after the save changes the open document.
  const [stableTarget] = useState(target);
  const control = useConvert(project.slug, stableTarget, onConverted);
  // A new review starts unconfirmed, so a person never confirms something they have not seen.
  useEffect(() => {
    if (control.view.status === 'loading') setConfirmed(false);
  }, [control.view.status]);
  return (
    <Modal title={`Convert ${target.path} to standard Ossie`} size="wide" onCancel={onClose} footer={<ConvertFooter control={control} confirmed={confirmed} onClose={onClose} />}>
      <ConvertBody control={control} path={target.path} confirmed={confirmed} onConfirm={setConfirmed} />
    </Modal>
  );
}

/** The dialog. A file that is not saved and committed is explained instead of reviewed. */
export function ConvertDialog({ project, target, gitState, unsaved, onClose, onConverted }: Props) {
  const blocker = conversionBlocker({ gitState, unsaved });
  if (!blocker) return <ConvertReviewDialog project={project} target={target} onClose={onClose} onConverted={onConverted} />;
  return (
    <Modal
      title={`Convert ${target.path} to standard Ossie`}
      size="narrow"
      onCancel={onClose}
      footer={
        <button type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <p role="status" className="compile-unpublished">
        {blocker}
      </p>
    </Modal>
  );
}
