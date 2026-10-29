/** Edits RDF resource statements as rows or source, with graph-equivalence checks before Save. */
import { useCapabilities } from '../auth/Capabilities';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileCode, Plus, Trash2, X } from 'lucide-react';
import type { Issue } from '../../shared/validation/diagnostics';
import { Modal } from '../projects/Modal';
import { api, StaleSave, type Doc } from '../projects/api';
import { CodeEditor } from '../editor/CodeEditor';
import { diffPatches } from '../../shared/editor/patch';
import { validateInWorker } from '../editor/lint';
import { readRdfItem, editRdfItem, checkRdfSource, type RdfResult } from './rdf-patch/index';
import { fragmentIssues, type Fragment } from './fragment';
import { dedent, reindent } from '../../shared/edit/source-text';
import type { Saved } from './ItemEditor';
import './edit.css';
// Save requires shared validation and an RDF graph matching exactly the original triples minus the
// removed triples plus the added triples.
type Row = {
  key: string;
  id?: string;
  predicateText: string;
  objectText: string;
  locked?: string;
  nested: boolean;
  line?: number;
};
type Props = {
  doc: Doc;
  base: string;
  subject: string;
  label: string;
  kind: string;
  onClose: () => void;
  onSaved: (saved: Saved[]) => void;
  onDelete: () => void;
  onOpenSource: (line: number) => void;
};
const SUGGESTED = [
  'a',
  'rdfs:label',
  'rdfs:comment',
  'rdfs:subClassOf',
  'rdfs:domain',
  'rdfs:range',
  'rdfs:seeAlso',
  'owl:inverseOf',
  'owl:equivalentClass',
  'skos:closeMatch',
  'sh:targetClass',
  'sh:property',
  'sh:path',
  'sh:name',
  'sh:datatype',
  'sh:class',
  'sh:minCount',
  'sh:maxCount',
  'sh:pattern',
];
/** Edits RDF statements while rejecting unintended graph changes. */
export function RdfItemEditor({ doc, base, subject, label, kind, onClose, onSaved, onDelete, onOpenSource }: Props) {
  const access = useCapabilities(doc.project);
  const item = useMemo(() => {
    try {
      return readRdfItem(base, doc.filename, subject);
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, []);
  const ok = 'pairs' in item ? item : null;
  const initial = useMemo<Row[]>(
    () =>
      ok
        ? ok.pairs.map(p => ({
            key: p.id,
            id: p.id,
            predicateText: p.predicateText,
            objectText: p.objectText,
            locked: p.locked ?? (ok.refusal ? ok.refusal.reason : undefined),
            nested: p.nested,
            line: p.line,
          }))
        : [],
    [],
  );
  const [rows, setRows] = useState(initial);
  const [tab, setTab] = useState<'statements' | 'source'>('statements');
  // Source: the resource's first statement block (or element, or lines), without its indentation.
  const fragment = useMemo<Fragment | null>(() => {
    if (!ok?.fragment) return null;
    const { from, to } = ok.fragment;
    const lead = /^[ \t]*/.exec(base.slice(from))![0];
    const d = dedent(base.slice(from, to), lead);
    return { from, to, prefix: d.prefix, text: d.text, path: [], line: ok.line };
  }, []);
  const [text, setText] = useState(fragment?.text ?? '');
  const rowsChanged = JSON.stringify(rows.map(({ key, line, ...r }) => r)) !== JSON.stringify(initial.map(({ key, line, ...r }) => r));
  const textChanged = !!fragment && text !== fragment.text;
  const [result, setResult] = useState<RdfResult | null>(null);
  const [check, setCheck] = useState<{ text: string; issues: Issue[] } | null>(null);
  const [accept, setAccept] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The edited file, from the rows or from Source, behind the RDF gate.
  useEffect(() => {
    if (!rowsChanged && !textChanged) {
      setResult(null);
      return;
    }
    const t = setTimeout(() => {
      if (textChanged && fragment) {
        const draft = base.slice(0, fragment.from) + reindent(text, fragment.prefix) + base.slice(fragment.to);
        const g = checkRdfSource(base, draft, doc.filename, subject);
        setResult(
          g.ok
            ? {
                ok: true,
                text: draft,
                patches: diffPatches(base, draft),
                warnings: [],
                removed: g.removed,
                added: g.added,
              }
            : { ok: false, error: g.reason },
        );
      } else
        setResult(
          editRdfItem(
            base,
            doc.filename,
            subject,
            rows.map(({ id, predicateText, objectText }) => ({ id, predicateText, objectText })),
          ),
        );
      setAccept(false);
    }, 250);
    return () => clearTimeout(t);
  }, [rows, text]);
  const draft = result?.ok ? result.text : null;
  useEffect(() => {
    if (!draft) return;
    const at = draft;
    validateInWorker(at, doc.filename)
      .then(issues => setCheck({ text: at, issues }))
      .catch(() => {});
  }, [draft]);
  const pending = (rowsChanged || textChanged) && (!result || (!!draft && check?.text !== draft));
  const errors = draft && check?.text === draft ? check.issues.filter(i => i.severity === 'error') : [];
  const warnings = result?.ok ? result.warnings : [];
  const canSave = !!draft && !pending && !errors.length && (!warnings.length || accept) && !saving && draft !== base;
  async function save() {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const r = await api.save(doc.project, doc.path, doc.hash, draft, diffPatches(doc.source, draft));
      onSaved([{ docId: doc.id, source: draft, hash: r.hash }]);
    } catch (e) {
      setError(e instanceof StaleSave ? 'Not saved: the file changed since this editor opened. Close it and open the item again.' : (e as Error).message);
      setSaving(false);
    }
  }
  const set = (key: string, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const refusal = ok?.refusal;
  const footer = (
    <>
      <button type="button" className="item-delete" hidden={!access.can('edit')} onClick={onDelete} disabled={saving || !!refusal}>
        <Trash2 size={13} />
        Delete…
      </button>
      <span className="item-state" role="status">
        {pending
          ? 'Checking…'
          : result && !result.ok
            ? 'Not applied'
            : errors.length
              ? `${errors.length} finding${errors.length === 1 ? '' : 's'} to fix`
              : rowsChanged || textChanged
                ? 'Unsaved changes'
                : 'No changes'}
      </span>
      <button type="button" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button type="button" className="primary" onClick={save} title={access.control('edit').title} disabled={!canSave || !access.can('edit')}>
        {saving ? 'Saving…' : 'Save to file'}
      </button>
    </>
  );
  return (
    <Modal title={`Edit ${label}`} onCancel={onClose} className="item-editor" footer={footer}>
      <p className="item-editor-where">
        <span className="item-kind">{kind}</span>
        <span>
          {doc.path}
          {ok?.line ? ` · line ${ok.line}` : ''}
        </span>
        <button type="button" className="link" onClick={() => onOpenSource(refusal?.line ?? ok?.line ?? 1)}>
          <FileCode size={13} />
          Open in Source
        </button>
      </p>
      <p className="item-subject">
        <code>{subject}</code>
      </p>
      {'error' in item && (
        <p role="alert" className="dialog-error">
          {item.error}
        </p>
      )}
      {refusal && (
        <div role="alert" className="item-note item-refusal">
          <AlertTriangle size={13} />
          <span>{refusal.reason}</span>
          <button type="button" onClick={() => onOpenSource(refusal.line)}>
            Open line {refusal.line} in Source
          </button>
        </div>
      )}
      <div className="item-tabs" role="tablist" aria-label="Edit as">
        <button
          role="tab"
          aria-selected={tab === 'statements'}
          className={tab === 'statements' ? 'selected' : ''}
          onClick={() => setTab('statements')}
          disabled={textChanged}
          title={textChanged ? 'Save or cancel the Source edit first' : undefined}
        >
          Statements
        </button>
        <button
          role="tab"
          aria-selected={tab === 'source'}
          className={tab === 'source' ? 'selected' : ''}
          onClick={() => setTab('source')}
          disabled={rowsChanged || !fragment}
          title={rowsChanged ? 'Save or cancel the statement edits first' : undefined}
        >
          Source
        </button>
      </div>
      {tab === 'statements' ? (
        <section className="rdf-rows" aria-label="Statements">
          <div className="rdf-row rdf-head" aria-hidden>
            <span>Predicate</span>
            <span>Object (Turtle syntax)</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className={`rdf-row${r.locked ? ' locked' : ''}`}>
              <input aria-label={`Predicate ${i + 1}`} list="rdf-predicates" value={r.predicateText} disabled={!!r.locked} onChange={e => set(r.key, { predicateText: e.target.value })} />
              {r.nested || r.objectText.length > 60 ? (
                <textarea
                  aria-label={`Object ${i + 1}`}
                  rows={r.nested ? 3 : 2}
                  className="code-field"
                  value={r.objectText}
                  disabled={!!r.locked}
                  onChange={e => set(r.key, { objectText: e.target.value })}
                />
              ) : (
                <input aria-label={`Object ${i + 1}`} className="code-field" value={r.objectText} disabled={!!r.locked} onChange={e => set(r.key, { objectText: e.target.value })} />
              )}
              <button
                type="button"
                aria-label={`Remove statement ${i + 1}`}
                title={r.locked && !r.nested ? r.locked : 'Remove this statement'}
                disabled={!!refusal || (!!r.locked && !r.nested)}
                onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}
              >
                <X size={13} />
              </button>
              {r.locked && r.locked !== refusal?.reason && <small className="rdf-lock">{r.locked}</small>}
            </div>
          ))}
          <datalist id="rdf-predicates">
            {SUGGESTED.map(p => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <button type="button" className="rdf-add" disabled={!!refusal} onClick={() => setRows(rs => [...rs, { key: 'new-' + Date.now(), predicateText: '', objectText: '', nested: false }])}>
            <Plus size={13} />
            Add statement
          </button>
        </section>
      ) : (
        fragment && (
          <div className="item-source">
            <CodeEditor
              ariaLabel={`Source of ${label}`}
              filename={doc.filename}
              value={text}
              onChange={setText}
              validate={async t => {
                const d = base.slice(0, fragment.from) + reindent(t, fragment.prefix) + base.slice(fragment.to);
                const g = checkRdfSource(base, d, doc.filename, subject);
                return [
                  ...(g.ok
                    ? []
                    : [
                        {
                          severity: 'error' as const,
                          code: 'rdf-gate',
                          path: '/',
                          message: g.reason,
                        },
                      ]),
                  ...fragmentIssues(await validateInWorker(d, doc.filename), fragment, t),
                ];
              }}
            />
          </div>
        )
      )}
      {result && !result.ok && result.error !== refusal?.reason && (
        <p role="alert" className="item-note">
          <AlertTriangle size={13} />
          {result.error}
        </p>
      )}
      {result?.ok && result.removed + result.added > 0 && (
        <p role="status" className="item-gate">
          Graph check passed: {result.removed} triple{result.removed === 1 ? '' : 's'} removed, {result.added} added; nothing else in the file changes.
        </p>
      )}
      {warnings.length > 0 && (
        <div className="delete-warning">
          <ul>
            {warnings.map(w => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <label className="item-check">
            <input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} />
            Remove these comments with the statements
          </label>
        </div>
      )}
      {errors.length > 0 && (
        <ul className="item-findings" aria-label="Findings">
          {errors.map((i, n) => (
            <li key={n} className="error">
              <AlertTriangle size={12} />
              {i.message}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
