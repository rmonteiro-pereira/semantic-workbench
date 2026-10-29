/** Edits one item's fields or source as a draft, then validates and saves against its base hash. */
import { useCapabilities } from '../auth/Capabilities';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileCode, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Issue } from '../validation/diagnostics';
import { Modal } from '../projects/Modal';
import { api, StaleSave, type Doc } from '../projects/api';
import { CodeEditor } from '../editor/CodeEditor';
import { diffPatches } from '../editor/patch';
import { validateInWorker } from '../editor/lint';
import { itemValue } from './yaml-patch';
import { openFragment, splice, fragmentValue, fragmentIssues, setField } from './fragment';
import {
  allowedStatuses,
  childLists,
  extensionOf,
  fieldsFor,
  itemName,
  kindLabel,
  readField,
  type Choices,
  type FieldSpec,
  type ItemKind,
  type Path,
} from './item-model';
import { findReferences, rewriteReferences, type Reference } from './references';
import './edit.css';
import { SqlField } from '../editor/SqlField';
// Item editor: the selected entity, relationship or metric only, as a form of its attributes or as
// its own source lines, with the shared validation shown inline. The change is a draft in this
// dialog until Save, which writes it in place (base-hash checked).
/** Reports the saved document version and the item selected after editing. */
export type Saved = { docId: string; source: string; hash: string };
type Props = {
  doc: Doc;
  base: string;
  path: Path;
  kind: ItemKind;
  projectDocs: Doc[];
  choices: Choices;
  onClose: () => void;
  onSaved: (saved: Saved[]) => void;
  onOpenItem: (path: Path, kind: ItemKind) => void;
  onAddChild: (kind: ItemKind, owner: Path) => void;
  onDelete: () => void;
  onOpenSource: (line: number) => void;
};
const display = (spec: FieldSpec, v: any) =>
  spec.input === 'list'
    ? Array.isArray(v)
      ? v.join(', ')
      : (v ?? '')
    : v === undefined || v === null
      ? ''
      : String(v);
/** Edits an item's fields or source and validates the draft before saving. */
export function ItemEditor({
  doc,
  base,
  path,
  kind,
  projectDocs,
  choices,
  onClose,
  onSaved,
  onOpenItem,
  onAddChild,
  onDelete,
  onOpenSource,
}: Props) {
  const access = useCapabilities(doc.project);
  const fragment = useMemo(() => openFragment(base, path), []);
  const [text, setText] = useState(fragment.text);
  const [tab, setTab] = useState<'fields' | 'source'>('fields');
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [reopened, setReopened] = useState(false);
  const [check, setCheck] = useState<{ text: string; issues: Issue[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [dependents, setDependents] = useState<Reference[] | null>(null);
  const original = useMemo(() => fragmentValue(fragment, fragment.text).value, []);
  const parsed = useMemo(() => fragmentValue(fragment, text), [text]);
  const draft = useMemo(() => splice(base, fragment, text), [text]);
  const oldName = itemName(kind, original);
  const newName = parsed.value ? itemName(kind, parsed.value) : oldName;
  const ownerName = useMemo(
    () =>
      kind === 'field' || kind === 'odcs-property'
        ? String(itemValue(base, path.slice(0, -2))?.name ?? '')
        : undefined,
    [],
  );
  // A metric's dependents are listed before any change is saved; found after the first paint.
  useEffect(() => {
    if (kind !== 'metric') return;
    const t = setTimeout(
      () =>
        setDependents(
          findReferences({ kind, name: oldName, docId: doc.id, path }, projectDocs).filter(
            r => r.dependent,
          ),
        ),
      30,
    );
    return () => clearTimeout(t);
  }, []);
  // A rename: what still names the old name (rewritten only where ticked).
  const renamed = !!oldName && !!newName && newName !== oldName;
  const references = useMemo(
    () =>
      renamed
        ? findReferences(
            { kind, name: oldName, docId: doc.id, path, owner: ownerName },
            projectDocs.map(d => (d.id === doc.id ? { ...d, source: base } : d)),
          )
        : [],
    [renamed],
  );
  useEffect(() => setConfirmed(new Set()), [renamed]);
  // Ticked rewrites in this file are part of the draft that is checked and saved.
  const effective = useMemo(() => {
    const own = references.filter((r, i) => confirmed.has(i) && r.docId === doc.id);
    if (!own.length) return draft;
    const shift = draft.length - base.length;
    return rewriteReferences(
      [{ id: doc.id, path: doc.path, filename: doc.filename, source: draft }],
      own.map(r => (r.from >= fragment.to ? { ...r, from: r.from + shift, to: r.to + shift } : r)),
      newName,
    )[0].source;
  }, [draft, references, confirmed, newName]);
  const pending = check?.text !== effective;
  const issues = check?.issues ?? [];
  const errors = issues.filter(i => i.severity === 'error');
  const changed = effective !== base;
  // The whole draft is checked in the worker after a short pause; Save waits for the result.
  useEffect(() => {
    const t = setTimeout(() => {
      const at = effective;
      validateInWorker(at, doc.filename)
        .then(issues => setCheck({ text: at, issues }))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [effective]);

  const canSave = changed && !pending && !errors.length && !parsed.error && !saving;
  const fields = fieldsFor(kind, choices);
  const extension = extensionOf(parsed.value)?.value;
  const status = extensionOf(original)?.value?.status;
  function edit(spec: FieldSpec, input: string | boolean) {
    if (typeof input === 'string') setTexts(t => ({ ...t, [spec.key]: input }));
    const r = setField(text, fragment, doc.filename, kind, spec, input, original);
    setText(r.text);
    if (kind === 'metric') setReopened(r.reopened);
  }
  async function save() {
    setSaving(true);
    setError('');
    try {
      const chosen = references.filter((_, i) => confirmed.has(i));
      const main = effective;
      const others = rewriteReferences(
        projectDocs,
        chosen.filter(r => r.docId !== doc.id),
        newName,
      );
      const written: Saved[] = [];
      if (!others.length) {
        const r = await api.save(
          doc.project,
          doc.path,
          doc.hash,
          main,
          diffPatches(doc.source, main),
        );
        written.push({ docId: doc.id, source: r.source ?? main, hash: r.hash });
      } else {
        const files = [
          { doc, source: main },
          ...others.map(o => ({ doc: projectDocs.find(d => d.id === o.docId)!, source: o.source })),
        ];
        const r = await api.saveBatch(
          doc.project,
          files.map(f => ({
            path: f.doc.path,
            baseHash: f.doc.hash,
            patches: diffPatches(f.doc.source, f.source),
          })),
        );
        files.forEach((f, i) =>
          written.push({
            docId: f.doc.id,
            source: r.written[i].source ?? f.source,
            hash: r.written[i].hash,
          }),
        );
      }
      onSaved(written);
    } catch (e) {
      setError(
        e instanceof StaleSave
          ? 'Not saved: the file changed since this editor opened. Close it and open the item again.'
          : (e as Error).message,
      );
      setSaving(false);
    }
  }
  const shown = (spec: FieldSpec) =>
    !spec.when || spec.when(spec.extension ? extension : parsed.value);
  const children = (childLists[kind] ?? []).map(c => ({
    ...c,
    items: Array.isArray(parsed.value?.[c.key]) ? (parsed.value[c.key] as any[]) : [],
  }));
  const label = kind === 'metric' ? extensionOf(original)?.value?.label : undefined;
  const title = `Edit ${label || oldName || kindLabel[kind]}`;
  const firstField = useRef<HTMLElement | null>(null);
  useEffect(() => {
    firstField.current?.focus();
  }, []);
  const footer = (
    <>
      <button
        type="button"
        className="item-delete"
        hidden={!access.can('edit')}
        onClick={onDelete}
        disabled={saving}
      >
        <Trash2 size={13} />
        Delete…
      </button>
      <span className="item-state" role="status">
        {pending && changed
          ? 'Checking…'
          : parsed.error
            ? 'Not one item'
            : errors.length
              ? `${errors.length} finding${errors.length === 1 ? '' : 's'} to fix`
              : changed
                ? 'Unsaved changes'
                : 'No changes'}
      </span>
      <button type="button" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button
        type="button"
        className="primary"
        onClick={save}
        title={access.control('edit').title}
        disabled={!canSave || !access.can('edit')}
      >
        {saving ? 'Saving…' : 'Save to file'}
      </button>
    </>
  );
  return (
    <Modal title={title} onCancel={onClose} className="item-editor" footer={footer}>
      <p className="item-editor-where">
        <span className="item-kind">{kindLabel[kind]}</span>
        <span>
          {doc.path} · line {fragment.line}
        </span>
        <button type="button" className="link" onClick={() => onOpenSource(fragment.line)}>
          <FileCode size={13} />
          Open in Source
        </button>
      </p>
      {kind === 'metric' && reopened && (
        <p role="status" className="item-note">
          <AlertTriangle size={13} />
          This metric was approved. Changing its definition returns it to proposed for review.
        </p>
      )}
      {kind === 'metric' && dependents && dependents.length > 0 && (
        <p className="item-dependents">
          <strong>Used by</strong>{' '}
          {[...new Set(dependents.map(d => `${d.dependent!.label} (${d.file})`))].join(' · ')}.
          Saving changes what these show.
        </p>
      )}
      {issues.length > 0 && (
        <ul className="item-findings" aria-label="Findings">
          {fragmentIssues(issues, fragment, text).map((i, n) => (
            <li key={n} className={i.severity}>
              <AlertTriangle size={12} />
              {i.line ? `Line ${i.line}: ` : ''}
              {i.message}
            </li>
          ))}
        </ul>
      )}
      <div className="item-tabs" role="tablist" aria-label="Edit as">
        <button
          role="tab"
          aria-selected={tab === 'fields'}
          className={tab === 'fields' ? 'selected' : ''}
          onClick={() => {
            setTab('fields');
            setTexts({});
          }}
          disabled={!!parsed.error}
        >
          Fields
        </button>
        <button
          role="tab"
          aria-selected={tab === 'source'}
          className={tab === 'source' ? 'selected' : ''}
          onClick={() => setTab('source')}
        >
          Source
        </button>
      </div>
      {tab === 'fields' ? (
        parsed.error ? (
          <p role="alert" className="dialog-error">
            {parsed.error}
          </p>
        ) : (
          <div className="item-fields">
            {fields.filter(shown).map((spec, n) => {
              const value = readField(parsed.value, spec);
              const id = `item-field-${spec.key}`;
              const ref = (el: HTMLElement | null) => {
                if (n === 0) firstField.current = el;
              };
              const common = {
                id,
                'aria-labelledby': id + '-label',
                'aria-describedby': spec.hint ? id + '-hint' : undefined,
              };
              let input: React.ReactNode;
              if (spec.input === 'boolean')
                input = (
                  <input
                    ref={ref as any}
                    {...common}
                    type="checkbox"
                    checked={!!value}
                    onChange={e => edit(spec, e.target.checked)}
                  />
                );
              else if (spec.input === 'select') {
                const options =
                  spec.key === 'ext.status' ? allowedStatuses(status) : (spec.options ?? []);
                const current = display(spec, value);
                input = (
                  <select
                    ref={ref as any}
                    {...common}
                    value={current}
                    onChange={e => edit(spec, e.target.value)}
                  >
                    {!options.includes(current) && (
                      <option value={current}>{current || '—'}</option>
                    )}
                    {options.map(o => (
                      <option key={o} value={o}>
                        {o || '—'}
                      </option>
                    ))}
                  </select>
                );
              } else if (spec.input === 'code')
                input = (
                  <SqlField
                    id={id}
                    labelledBy={id + '-label'}
                    dialect="ANSI_SQL"
                    rows={3}
                    value={texts[spec.key] ?? display(spec, value)}
                    onChange={v => edit(spec, v)}
                  />
                );
              else if (spec.input === 'textarea')
                input = (
                  <textarea
                    ref={ref as any}
                    {...common}
                    rows={2}
                    value={texts[spec.key] ?? display(spec, value)}
                    onChange={e => edit(spec, e.target.value)}
                    spellCheck
                  />
                );
              else
                input = (
                  <input
                    ref={ref as any}
                    {...common}
                    list={spec.options?.length ? id + '-options' : undefined}
                    title={texts[spec.key] ?? display(spec, value)}
                    value={texts[spec.key] ?? display(spec, value)}
                    onChange={e => edit(spec, e.target.value)}
                  />
                );
              return (
                <label
                  key={spec.key}
                  className={spec.input === 'boolean' ? 'item-check' : ''}
                  htmlFor={id}
                >
                  <span id={id + '-label'}>
                    {spec.label}
                    {spec.required && <em aria-hidden> *</em>}
                  </span>
                  {input}
                  {spec.input !== 'select' && spec.options?.length ? (
                    <datalist id={id + '-options'}>
                      {spec.options.map(o => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  ) : null}
                  {spec.hint && <small id={id + '-hint'}>{spec.hint}</small>}
                </label>
              );
            })}
          </div>
        )
      ) : (
        <div className="item-source">
          <CodeEditor
            ariaLabel={`Source of ${oldName || kindLabel[kind]}`}
            filename={doc.filename}
            value={text}
            onChange={setText}
            validate={async t =>
              fragmentIssues(
                await validateInWorker(splice(base, fragment, t), doc.filename),
                fragment,
                t,
              )
            }
          />
        </div>
      )}
      {children.map(c => (
        <section key={c.key} className="item-children" aria-label={c.label}>
          <h3>
            {c.label} <span>{c.items.length}</span>
            <button
              type="button"
              onClick={() => onAddChild(c.kind, path)}
              disabled={changed}
              title={changed ? 'Save or cancel this edit first' : undefined}
            >
              <Plus size={12} />
              Add
            </button>
          </h3>
          {c.items.length > 0 && (
            <ul>
              {c.items.map((item, i) => (
                <li key={i}>
                  <span>{itemName(c.kind, item) || `#${i + 1}`}</span>
                  <button
                    type="button"
                    onClick={() => onOpenItem([...path, c.key, i], c.kind)}
                    disabled={changed}
                    aria-label={`Edit ${itemName(c.kind, item) || c.label + ' ' + (i + 1)}`}
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {renamed && (
        <section className="item-references" aria-label="References to the old name">
          <strong>
            {references.length
              ? `${references.length} reference${references.length === 1 ? '' : 's'} still name "${oldName}"`
              : `Nothing else in the project names "${oldName}".`}
          </strong>
          {references.length > 0 && (
            <>
              <p>Tick the ones to rewrite to "{newName}". Unticked references keep the old name.</p>
              <ul>
                {references.map((r, i) => (
                  <li key={i}>
                    <label className="item-check">
                      <input
                        type="checkbox"
                        checked={confirmed.has(i)}
                        onChange={e =>
                          setConfirmed(s => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(i);
                            else n.delete(i);
                            return n;
                          })
                        }
                      />
                      <span>
                        <code>
                          {r.file}:{r.line}
                        </code>{' '}
                        {r.where}
                        <small>{r.excerpt}</small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
