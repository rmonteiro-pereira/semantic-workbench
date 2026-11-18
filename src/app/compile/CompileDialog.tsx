/** Checks a project against standard Ossie, shows what a compile would drop, and downloads the standard files once the exact report is accepted. */
import React, { useState } from 'react';
import { OSSIE_SCHEMA_VERSION } from '../../shared/validation/validation';
import { SUPPORTED_BASES, findBase } from '../../shared/tessera/bases';
import type { CompileFinding } from '../../shared/tessera/compile-findings';
import { Modal } from '../projects/Modal';
import type { ProjectInfo } from '../projects/api';
import { LossPreview } from './LossPreview';
import type { CompileSource } from './api';
import { NOT_PUBLISHED_REASON, useCompile, type CompileControl, type CompileView } from './use-compile';
import './compile.css';

type Props = { project: ProjectInfo; initialSource?: CompileSource; onClose: () => void };

const NO_EXPORT_REASON = 'You do not have permission to export this project, so you can only check your working copy.';
const NOT_APPROVAL_NOTE = 'Accepting a report is not approval of the content. It only says you have seen what the standard files leave out.';

/** Says why the published snapshot cannot be compiled, or nothing when it can. */
export function publishedUnavailableReason(project: ProjectInfo): string | null {
  if (!project.published) return NOT_PUBLISHED_REASON;
  if (project.actions && !project.actions.includes('export')) return NO_EXPORT_REASON;
  return null;
}

/** The findings that refused a compile or a conversion, each with its document and place. */
export function Findings({ findings }: { findings: CompileFinding[] }) {
  return (
    <ul className="compile-findings">
      {findings.map((finding, index) => (
        <li key={index} className="compile-finding">
          <strong>
            {finding.severity === 'error' ? 'Error' : 'Warning'} · {finding.code}
          </strong>
          <span>{finding.message}</span>
          <span className="compile-finding-where">
            {finding.document ? `${finding.document} · ` : ''}
            {finding.path}
            {finding.line ? ` · Line ${finding.line}, column ${finding.column ?? 1}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StateTitle({ mark, children }: { mark: string; children: React.ReactNode }) {
  return (
    <p className="compile-state-title">
      <span className="compile-state-mark" aria-hidden="true">
        {mark}
      </span>
      <span>{children}</span>
    </p>
  );
}

function LoadingText({ step }: { step: 'checking' | 'accepting' | 'downloading' }) {
  const words = { checking: 'Checking the project…', accepting: 'Accepting the report…', downloading: 'Preparing the download…' };
  return (
    <div className="compile-placeholder" role="status">
      {words[step]}
    </div>
  );
}

type ViewOf<Status extends CompileView['status']> = Extract<CompileView, { status: Status }>;

function UnavailableView({ view }: { view: ViewOf<'unavailable'> }) {
  return (
    <div className="compile-state" role="status">
      <StateTitle mark="!">Not available</StateTitle>
      <p className="compile-note">{view.reason}</p>
    </div>
  );
}

function RefusedView({ view }: { view: ViewOf<'refused'> }) {
  return (
    <div className="compile-state">
      <StateTitle mark="✕">The project cannot be compiled yet. Fix these findings first.</StateTitle>
      <Findings findings={view.findings} />
    </div>
  );
}

function NothingToDoView() {
  return (
    <div className="compile-state" role="status">
      <StateTitle mark="✓">These files are already standard Ossie.</StateTitle>
      <p className="compile-note">The download holds the same bytes, with a manifest and a report.</p>
    </div>
  );
}

function CheckedView({ view }: { view: ViewOf<'checked'> }) {
  const headline = view.answer.result === 'ok' ? 'Your working copy compiles with nothing dropped.' : 'Your working copy compiles. This is what would be dropped.';
  return (
    <div className="compile-state">
      <StateTitle mark="✓">{headline}</StateTitle>
      <LossPreview report={view.answer.report} />
    </div>
  );
}

function NeedsAcceptanceView({ view }: { view: ViewOf<'needs-acceptance'> }) {
  return (
    <div className="compile-state">
      {view.notice && (
        <p role="status" className="compile-unpublished">
          {view.notice}
        </p>
      )}
      <StateTitle mark="!">This compile drops values. Review them, then accept this exact report.</StateTitle>
      <LossPreview report={view.report} />
      <p className="compile-accept-note">{NOT_APPROVAL_NOTE}</p>
    </div>
  );
}

function ReadyView({ view }: { view: ViewOf<'ready'> | ViewOf<'released'> }) {
  const headline = view.status === 'released' ? 'Accepted. The standard files are ready to download.' : 'The standard files are ready to download.';
  return (
    <div className="compile-state" role="status">
      <StateTitle mark="✓">{headline}</StateTitle>
      <p className="compile-note">Report digest</p>
      <code className="loss-digest-value">{view.digest}</code>
    </div>
  );
}

/** The part of the dialog that depends on the state of the compile. */
export function CompileViewBody({ view }: { view: CompileView }) {
  switch (view.status) {
    case 'loading':
      return <LoadingText step={view.step} />;
    case 'unavailable':
      return <UnavailableView view={view} />;
    case 'error':
      return (
        <p role="alert" className="dialog-error">
          {view.message}
        </p>
      );
    case 'refused':
      return <RefusedView view={view} />;
    case 'nothing-to-do':
      return <NothingToDoView />;
    case 'checked':
      return <CheckedView view={view} />;
    case 'needs-acceptance':
      return <NeedsAcceptanceView view={view} />;
    case 'ready':
    case 'released':
      return <ReadyView view={view} />;
  }
}

function SourceChoice({ source, onChange, canPublish }: { source: CompileSource; onChange: (source: CompileSource) => void; canPublish: boolean }) {
  return (
    <label className="compile-source">
      <span className="compile-label">Compile from</span>
      <select aria-label="Compile from" value={source} onChange={event => onChange(event.target.value === 'working' ? 'working' : 'published')}>
        <option value="published">Published snapshot{canPublish ? '' : ' (not available)'}</option>
        <option value="working">Working copy, saved files (unpublished)</option>
      </select>
    </label>
  );
}

/** The buttons of the dialog. Accepting and downloading exist only for the published snapshot. */
export function CompileFooter({ control, source, onClose }: { control: CompileControl; source: CompileSource; onClose: () => void }) {
  const { view } = control;
  const busy = view.status === 'loading';
  return (
    <>
      <button type="button" onClick={onClose}>
        Close
      </button>
      {view.status === 'error' && (
        <button type="button" onClick={control.retry}>
          Retry
        </button>
      )}
      {source === 'published' && view.status === 'needs-acceptance' && (
        <button type="button" className="primary" disabled={busy} onClick={control.accept}>
          Accept this report
        </button>
      )}
      {source === 'published' && ['ready', 'released', 'nothing-to-do'].includes(view.status) && (
        <button type="button" className="primary" disabled={busy} onClick={control.download}>
          Download zip
        </button>
      )}
    </>
  );
}

/** The dialog. The published snapshot is the default source; the working copy can only be checked. */
export function CompileDialog({ project, initialSource = 'published', onClose }: Props) {
  const [source, setSource] = useState<CompileSource>(initialSource);
  const unavailable = publishedUnavailableReason(project);
  const control = useCompile(project.slug, source, unavailable);
  const base = findBase(SUPPORTED_BASES, OSSIE_SCHEMA_VERSION);
  return (
    <Modal title={`Standard Ossie for ${project.name}`} size="wide" onCancel={onClose} footer={<CompileFooter control={control} source={source} onClose={onClose} />}>
      <p className="dialog-intro">Compiles the Tessera documents of this project to standard Ossie. Output is {base?.label ?? 'standard Ossie'}. Your files are not changed.</p>
      <SourceChoice source={source} onChange={setSource} canPublish={!unavailable} />
      {source === 'working' && (
        <p className="compile-unpublished" role="note">
          Unpublished: this checks the saved files in your working copy. Nothing can be downloaded from it. Publish the project to compile it.
        </p>
      )}
      <CompileViewBody view={control.view} />
    </Modal>
  );
}
