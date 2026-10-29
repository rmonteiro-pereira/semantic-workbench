/** Previews and validates a new entity or relationship before Save writes it to the document. */
import { useCapabilities } from '../auth/Capabilities';
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Issue } from '../../shared/validation/diagnostics';
import { Modal } from '../projects/Modal';
import { api, StaleSave, type Doc } from '../projects/api';
import { applyPatches, diffPatches } from '../../shared/editor/patch';
import { validateInWorker } from '../editor/lint';
import { insertPatches, itemValue, valuePatches } from '../../shared/edit/yaml-patch';
import {
  addableKinds,
  fieldsFor,
  fieldValue,
  itemName,
  kindLabel,
  listPathFor,
  newItem,
  semanticModelPrefix,
  type Choices,
  type FieldSpec,
  type ItemKind,
  type Path,
} from '../../shared/edit/item-model';
import type { Saved } from './ItemEditor';
import './edit.css';
import { SqlField } from '../editor/SqlField';
// The preview uses the document’s own layout and shared validation. Nothing is written before
// Save.
type Props = {
  doc: Doc;
  base: string;
  document: any;
  kind?: ItemKind;
  owner?: Path;
  preset?: Record<string, any>;
  choices: Choices;
  onClose: () => void;
  onSaved: (saved: Saved, path: Path, kind: ItemKind) => void;
};
// The form of a new item: the editable fields of the kind (not the metric extension, which the
// metric wizard writes), plus the first property of a new contract object.
function createFields(kind: ItemKind, choices: Choices): FieldSpec[] {
  const base = fieldsFor(kind, choices).filter(f => !f.extension);
  if (kind === 'odcs-object')
    return [
      ...base,
      {
        key: 'property',
        label: 'First property',
        input: 'text',
        at: ['property'],
        required: true,
        hint: 'A table needs at least one property',
      },
      {
        key: 'propertyType',
        label: 'Its logical type',
        input: 'select',
        at: ['propertyType'],
        options: ['string', 'integer', 'number', 'date', 'timestamp', 'boolean'],
      },
    ];
  return base;
}
// The hint names the missing inputs so a disabled Save still explains the next step.
function requiredHint(labels: string[]) {
  const names = labels.map((label, index) => (index === 0 ? label : label.toLowerCase()));
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `Enter ${list.toLowerCase()} to continue.`;
}

/** Previews and validates a new item before saving it. */
export function AddItem({ doc, base, document, kind: fixed, owner, preset = {}, choices, onClose, onSaved }: Props) {
  const access = useCapabilities(doc.project);
  const kinds = fixed ? [fixed] : addableKinds(document);
  const [kind, setKind] = useState<ItemKind | undefined>(kinds[0]);
  const [raw, setRaw] = useState<Record<string, string | boolean>>(() => Object.fromEntries(Object.entries(preset).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v])));
  const [check, setCheck] = useState<{ text: string; issues: Issue[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fields = kind ? createFields(kind, choices) : [];
  // Form text → item values: lists split on commas, empty text left out.
  const values = useMemo(
    () => ({
      ...preset,
      ...Object.fromEntries(fields.map(f => [f.key, raw[f.key] === undefined ? undefined : fieldValue({ ...f, required: false }, raw[f.key])])),
    }),
    [raw, kind],
  );
  const listPath = kind ? listPathFor(kind, document, owner, semanticModelPrefix(document) ?? []) : null;
  type Plan =
    | { error: string; incomplete?: boolean; text?: undefined }
    | {
        error?: undefined;
        incomplete?: undefined;
        text: string;
        inserted: string;
        line: number;
        path: Path;
      };
  const plan = useMemo((): Plan => {
    if (!kind || !listPath) return { error: 'This document cannot hold this kind of item.' };
    const missing = fields.filter(field => field.required && (values[field.key] === undefined || values[field.key] === '' || (Array.isArray(values[field.key]) && !values[field.key].length)));
    if (missing.length) {
      const required = fields.filter(f => f.required).map(f => f.label);
      return { error: requiredHint(required), incomplete: true };
    }
    const item = newItem(kind, values);
    const list = itemValue(base, listPath);
    const name = itemName(kind, item);
    if (Array.isArray(list) && name && list.some(x => itemName(kind, x) === name)) return { error: `${kindLabel[kind]} ${name} already exists here.` };
    try {
      const patches = Array.isArray(list) ? insertPatches(base, listPath, item, undefined, doc.filename) : valuePatches(base, listPath, [item], doc.filename);
      const text = applyPatches(base, patches);
      const index = Array.isArray(list) ? list.length : 0;
      return {
        text,
        inserted: patches.map(p => p.insert).join(''),
        line: base.slice(0, patches[0].from).split(/\r\n|\r|\n/).length,
        path: [...listPath, index] as Path,
      };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }, [kind, JSON.stringify(values)]);
  useEffect(() => {
    if (plan.text === undefined) return;
    const timer = setTimeout(() => {
      const at = plan.text;
      validateInWorker(at, doc.filename).then(issues => setCheck({ text: at, issues }));
    }, 200);
    return () => clearTimeout(timer);
  }, [plan]);
  const pending = plan.text !== undefined && check?.text !== plan.text;
  const issues = plan.text !== undefined && check && check.text === plan.text ? check.issues : [];
  const errors = issues.filter(i => i.severity === 'error');
  async function save() {
    if (plan.text === undefined || !kind) return;
    setSaving(true);
    setError('');
    try {
      const saved = await api.save(doc.project, doc.path, doc.hash, plan.text, diffPatches(doc.source, plan.text));
      onSaved({ docId: doc.id, source: plan.text, hash: saved.hash }, plan.path, kind);
    } catch (error) {
      setError(error instanceof StaleSave ? 'Not saved: the file changed since you opened it. Close this and try again.' : (error as Error).message);
      setSaving(false);
    }
  }
  const set = (spec: FieldSpec, input: string | boolean) => setRaw(v => ({ ...v, [spec.key]: input }));
  const valueOf = (spec: FieldSpec) => String(raw[spec.key] ?? '');
  let saveStatus;
  if (saving) {
    saveStatus = 'Saving…';
  } else if (pending) {
    saveStatus = 'Checking…';
  } else {
    saveStatus = 'Save to file';
  }
  const footer = (
    <>
      <button type="button" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button type="button" className="primary" onClick={save} title={access.control('edit').title} disabled={!access.can('edit') || plan.text === undefined || pending || errors.length > 0 || saving}>
        {saveStatus}
      </button>
    </>
  );
  return (
    <Modal
      title={`Add ${kind ? kindLabel[kind].toLowerCase() : 'item'} to ${doc.path}`}
      onCancel={onClose}
      className="add-item"
      size="wide"
      footer={footer}
      footerNote={plan.incomplete ? plan.error : undefined}
    >
      {kinds.length > 1 && (
        <label>
          What to add
          <select
            aria-label="Item type"
            value={kind}
            onChange={e => {
              setKind(e.target.value as ItemKind);
              setRaw({});
            }}
          >
            {kinds.map(kindOption => (
              <option key={kindOption} value={kindOption}>
                {kindLabel[kindOption]}
              </option>
            ))}
          </select>
        </label>
      )}
      {!kinds.length ? (
        <p>This file has no list of entities or relationships to add to. Edit it in Source.</p>
      ) : (
        <div className="item-fields">
          {fields.map(spec => {
            const id = `add-field-${spec.key}`;
            let fieldControl;
            if (spec.input === 'boolean') {
              fieldControl = <input id={id} aria-labelledby={id + '-label'} type="checkbox" checked={!!raw[spec.key]} onChange={e => set(spec, e.target.checked)} />;
            } else if (spec.input === 'select') {
              fieldControl = (
                <select id={id} aria-labelledby={id + '-label'} value={valueOf(spec)} onChange={e => set(spec, e.target.value)}>
                  <option value="">Choose {spec.label.toLowerCase()}</option>
                  {(spec.options ?? []).filter(Boolean).map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              );
            } else if (spec.input === 'code') {
              fieldControl = <SqlField id={id} labelledBy={id + '-label'} dialect="ANSI_SQL" value={valueOf(spec)} onChange={v => set(spec, v)} />;
            } else if (spec.input === 'textarea') {
              fieldControl = <textarea id={id} aria-labelledby={id + '-label'} rows={2} value={valueOf(spec)} onChange={e => set(spec, e.target.value)} />;
            } else {
              fieldControl = <input id={id} aria-labelledby={id + '-label'} value={valueOf(spec)} onChange={e => set(spec, e.target.value)} />;
            }
            return (
              <label key={spec.key} htmlFor={id} className={spec.input === 'boolean' ? 'item-check' : ''}>
                <span id={id + '-label'}>
                  {spec.label}
                  {spec.required && <em aria-hidden> *</em>}
                </span>
                {fieldControl}
                {spec.hint && <small>{spec.hint}</small>}
              </label>
            );
          })}
        </div>
      )}
      {plan.error !== undefined && !plan.incomplete && <p className="item-note">{plan.error}</p>}
      {plan.error === undefined && (
        <div className="item-preview">
          <strong>Will be added at line {plan.line}</strong>
          <pre aria-label="Text to insert">{plan.inserted.replace(/^\r?\n/, '')}</pre>
        </div>
      )}
      {errors.length > 0 && (
        <ul className="item-findings" aria-label="Findings">
          {errors.map((issue, index) => (
            <li key={index} className="error">
              <AlertTriangle size={12} />
              {issue.line ? `Line ${issue.line}: ` : ''}
              {issue.message}
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
