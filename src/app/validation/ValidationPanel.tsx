/** Displays validation findings and lets users repair an import before accepting it. */
import { UnitSetNotice } from '../mesh/UnitSetNotice';
import type { ReaderValidation } from '../../shared/tessera/set-validation';
import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { Issue } from '../../shared/validation/diagnostics';
import { validateInput } from '../../shared/validation/input';
import { OSSIE_SCHEMA_VERSION, isNotValidated } from '../../shared/validation/validation';
import { TesseraNames, type DocumentFormat } from '../../shared/tessera/format';
import { featureLabeler } from '../editor/feature';
import { CodeEditor, type CodeEditorHandle } from '../editor/CodeEditor';
import './validation-editor.css';
/** Displays document findings and links to their source locations. */
export function ValidationPanel({
  issues: allIssues,
  onLocate,
  onValidateAsShippedVersion,
  onCheckStandard,
  onConvertToStandard,
  source,
  format,
  unitValidation,
}: {
  issues: Issue[];
  unitValidation?: ReaderValidation;
  format?: DocumentFormat;
  onLocate?: (issue: Issue) => void;
  onValidateAsShippedVersion?: () => void;
  /** Offered for a Tessera document: opens the check against standard Ossie. */
  onCheckStandard?: () => void;
  /** Offered for a Tessera document to a person who may edit it: opens the reviewed conversion. */
  onConvertToStandard?: () => void;
  source?: string;
}) {
  const notValidated = allIssues.find(isNotValidated);
  const issues = allIssues.filter(issue => !isNotValidated(issue));
  const feature = useMemo(() => featureLabeler(source), [source]);
  const lines = useMemo(() => source?.split('\n'), [source]);
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const warningCount = issues.filter(issue => issue.severity === 'warning').length;
  const fixes: Record<string, string> = {
    reference: 'Choose an existing definition identifier, or add the referenced definition.',
    duplicate: 'Give each definition a unique identifier; update references if you rename it.',
    'inheritance-cycle': 'Remove or redirect an inheritance link so that no definition inherits from itself through a chain.',
    required: 'Add the required property at the affected feature shown below.',
    empty: 'Provide a definition before continuing.',
    filename: 'Use a filename without directory separators or control characters.',
    size: 'Split this definition into files smaller than 2 MB.',
    'tessera-marker': `Write the marker as a whole number of at least 1, for example ${TesseraNames.markerKey}: 1.`,
    'tessera-revision': 'Use a revision this workbench supports, and only the properties that revision defines.',
    'tessera-base': 'Set version to one of the supported Ossie bases the message lists.',
    'tessera-kind': `Remove the ${TesseraNames.markerKey} key; ${TesseraNames.product} applies to ontology documents only.`,
    'tessera-property': 'Check the spelling against the registered properties the message lists, or remove the property.',
    'tessera-reserved': 'Remove the property; its name is kept for a later feature.',
    'tessera-location': 'Move the property to one of the places the message lists.',
    'tessera-attribute-order': 'Keep each name once and only names of attributes of this concept, or remove the entry.',
    'tessera-governance-value': 'Use only the keys and status words the message lists, and give the entry at least one key.',
    'tessera-governance-deprecation': 'Set the status to deprecated, or remove the replacement and the reason.',
  };
  const showStandardControls = format?.family === 'tessera';
  const formatLabel = format?.family === 'tessera' ? `${TesseraNames.product} ${format.revision} on Ossie ${format.base} · ` : '';
  return (
    <div className="validation-report" aria-label="Validation report">
      <UnitSetNotice validation={unitValidation} />
      {notValidated && (
        <div className="validation-not-validated" role="status">
          <strong>Not validated</strong>
          <span>{notValidated.detail}</span>
          {onValidateAsShippedVersion && (
            <button type="button" onClick={onValidateAsShippedVersion}>
              Validate as Ossie {OSSIE_SCHEMA_VERSION}
            </button>
          )}
          <span>Structure and reference checks still run; only the schema check is skipped.</span>
        </div>
      )}
      {showStandardControls && (onCheckStandard || onConvertToStandard) && (
        <div className="validation-standard-actions">
          {onCheckStandard && (
            <button type="button" onClick={onCheckStandard}>
              Check as standard Ossie
            </button>
          )}
          {onConvertToStandard && (
            <button type="button" onClick={onConvertToStandard}>
              Convert to standard
            </button>
          )}
        </div>
      )}
      {!notValidated && (
        <p>
          {formatLabel}
          {errorCount} {errorCount === 1 ? 'error' : 'errors'} · {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
        </p>
      )}
      <ul>
        {issues.map((issue, i) => (
          <li key={i} className={issue.severity}>
            <strong>
              {issue.severity === 'error' ? 'Error' : 'Warning'} · {issue.code}
            </strong>
            <span>
              {issue.message
                .split('\n')
                .filter(line => !/^\s*\^+\s*$/.test(line))
                .join('\n')}
            </span>
            <span className="validation-feature-label">Affected feature</span>
            <span className="validation-feature">{feature(issue.path)}</span>
            {source && issue.line && (
              <span className="validation-source-line">
                Source: <code>{(lines?.[issue.line - 1] ?? '').slice(0, 300)}</code>
              </span>
            )}
            <span className="validation-location">
              {issue.path}
              {issue.line ? ` · Line ${issue.line}, column ${issue.column ?? 1}` : ' · Document-level finding; no exact source line was reported.'}
            </span>
            {fixes[issue.code] && <p className="validation-fix">How to fix: {fixes[issue.code]}</p>}
            {onLocate && issue.line && <button onClick={() => onLocate(issue)}>Go to line {issue.line}</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Holds a filename and source text awaiting import validation. */
export type ImportDraft = { filename: string; source: string };
/** Edits and validates an import draft before it is accepted. */
export function ImportRepair({ initial, onCancel, onImport }: { initial: ImportDraft[]; onCancel: () => void; onImport: (drafts: ImportDraft[]) => Promise<void> }) {
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
  const updateActive = (patch: Partial<ImportDraft>) => setDrafts(old => old.map((d, i) => (i === active ? { ...d, ...patch } : d)));
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
          {invalid} of {drafts.length} files need repair. Your open document is preserved. Nothing is saved until you import.
        </p>
        <label>
          File to review
          <select autoFocus aria-label="File to review" disabled={busy} value={active} onChange={e => setActive(Number(e.target.value))}>
            {drafts.map((draft, i) => (
              <option key={i} value={i}>
                {draft.filename} · {reports[i].valid ? 'Ready' : 'Needs repair'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Import filename
          <input aria-label="Import filename" value={current.filename} disabled={busy} onChange={e => updateActive({ filename: e.target.value })} />
        </label>
        <div className="repair-columns">
          <div className="repair-editor">
            <span className="repair-editor-title">Repair definition</span>
            <CodeEditor key={active} ref={editor} ariaLabel="Repair definition" filename={current.filename} disabled={busy} value={current.source} onChange={next => updateActive({ source: next })} />
          </div>
          <ValidationPanel issues={reports[active].issues} source={current.source} onLocate={issue => editor.current?.locate(issue)} />
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
              } catch (error) {
                setError((error as Error).message);
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
