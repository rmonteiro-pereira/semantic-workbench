/** Displays validation findings and lets users repair an import before accepting it. */
import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { Issue } from './diagnostics';
import { validateInput } from './input';
import { featureLabeler } from './editor/feature';
import { CodeEditor, type CodeEditorHandle } from './editor/CodeEditor';
import './validation-editor.css';
/** Displays document findings and links to their source locations. */
export function ValidationPanel({
  issues,
  onLocate,
  source,
}: {
  issues: Issue[];
  onLocate?: (issue: Issue) => void;
  source?: string;
}) {
  const feature = useMemo(() => featureLabeler(source), [source]);
  const lines = useMemo(() => source?.split('\n'), [source]);
  const fixes: Record<string, string> = {
    reference: 'Choose an existing definition identifier, or add the referenced definition.',
    duplicate: 'Give each definition a unique identifier; update references if you rename it.',
    'inheritance-cycle':
      'Remove or redirect an inheritance link so that no definition inherits from itself through a chain.',
    required: 'Add the required property at the affected feature shown below.',
    empty: 'Paste a definition or select a file before importing.',
    filename: 'Use a filename without directory separators or control characters.',
    size: 'Split this definition into files smaller than 2 MB.',
  };
  return (
    <div className="validation-report" aria-label="Validation report">
      <p>
        {issues.filter(i => i.severity === 'error').length} errors ·{' '}
        {issues.filter(i => i.severity === 'warning').length} warnings
      </p>
      <ul>
        {issues.map((issue, i) => (
          <li key={i} className={issue.severity}>
            <strong>
              {issue.severity === 'error' ? 'Error' : 'Warning'} · {issue.code}
            </strong>
            <span>{issue.message}</span>
            <span className="validation-feature-label">Affected feature</span>
            <span className="validation-feature">{feature(issue.path)}</span>
            {source && issue.line && (
              <span className="validation-source-line">
                Source: <code>{(lines?.[issue.line - 1] ?? '').slice(0, 300)}</code>
              </span>
            )}
            <span className="validation-location">
              {issue.path}
              {issue.line
                ? ` · Line ${issue.line}, column ${issue.column ?? 1}`
                : ' · Document-level finding; no exact source line was reported.'}
            </span>
            {fixes[issue.code] && <p className="validation-fix">How to fix: {fixes[issue.code]}</p>}
            {onLocate && issue.line && (
              <button onClick={() => onLocate(issue)}>Go to line {issue.line}</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Holds a filename and source text awaiting import validation. */
export type ImportDraft = { filename: string; source: string };
/** Edits and validates an import draft before it is accepted. */
export function ImportRepair({
  initial,
  onCancel,
  onImport,
}: {
  initial: ImportDraft[];
  onCancel: () => void;
  onImport: (drafts: ImportDraft[]) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState(initial);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const editor = useRef<CodeEditorHandle>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      previous?.focus();
    };
  }, []);
  const reports = useMemo(() => drafts.map(d => validateInput(d.source, d.filename)), [drafts]);
  const invalid = reports.filter(r => !r.valid).length;
  const current = drafts[active];
  return (
    <dialog
      ref={dialog}
      onCancel={e => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      aria-labelledby="repair-title"
      className="validation-backdrop"
    >
      <section className="import-repair">
        <h2 id="repair-title">Review import</h2>
        <p>
          {invalid} of {drafts.length} files need repair. Your open document is preserved. Nothing
          is saved until you import.
        </p>
        <label>
          File to review
          <select
            autoFocus
            aria-label="File to review"
            disabled={busy}
            value={active}
            onChange={e => setActive(Number(e.target.value))}
          >
            {drafts.map((d, i) => (
              <option key={i} value={i}>
                {d.filename} · {reports[i].valid ? 'Ready' : 'Needs repair'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Import filename
          <input
            aria-label="Import filename"
            value={current.filename}
            disabled={busy}
            onChange={e =>
              setDrafts(old =>
                old.map((d, i) => (i === active ? { ...d, filename: e.target.value } : d)),
              )
            }
          />
        </label>
        <div className="repair-columns">
          <div className="repair-editor">
            <span className="repair-editor-title">Repair definition</span>
            <CodeEditor
              key={active}
              ref={editor}
              ariaLabel="Repair definition"
              filename={current.filename}
              disabled={busy}
              value={current.source}
              onChange={next =>
                setDrafts(old => old.map((d, i) => (i === active ? { ...d, source: next } : d)))
              }
            />
          </div>
          <ValidationPanel
            issues={reports[active].issues}
            source={current.source}
            onLocate={issue => editor.current?.locate(issue)}
          />
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="repair-actions">
          <button disabled={busy} onClick={onCancel}>
            Cancel import
          </button>
          <button
            className="primary"
            disabled={!!invalid || busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await onImport(drafts);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Importing…' : 'Import repaired files'}
          </button>
        </div>
      </section>
    </dialog>
  );
}
