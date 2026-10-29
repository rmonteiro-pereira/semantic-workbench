/** Edits one property in a dialog, validating and saving against the file's base hash using
 * source-preserving patches. */
import React, { useState } from 'react';
import { valuePatches } from '../../shared/edit/yaml-patch';
import { applyPatches, diffPatches } from '../../shared/editor/patch';
import { validateInput } from '../../shared/validation/input';
import { api, StaleSave, type Doc } from '../projects/api';
import type { Saved } from '../edit/ItemEditor';
import { Modal } from '../projects/Modal';
import { isProtected } from '../auth/guards-client';
import type { ClassificationSettings } from '../../shared/governance/guards';
// Shared patchers change only the edited value. Validation uses the pinned ODCS schema, and the
// base hash prevents overwriting a newer file.
export const LOGICAL_TYPES = ['string', 'date', 'timestamp', 'time', 'number', 'integer', 'object', 'array', 'boolean'];
const FLAG_FIELDS = [
  { key: 'required', label: 'Required' },
  { key: 'unique', label: 'Unique' },
  { key: 'primaryKey', label: 'Primary key' },
] as const;

/** Patches one top-level property attribute, removing the key when undefined. */
export function propertyEdit(source: string, filename: string, objectIndex: number, propertyIndex: number, key: string, value: unknown) {
  const path = ['schema', objectIndex, 'properties', propertyIndex, key];
  return applyPatches(source, valuePatches(source, path, value, filename));
}

/** The values shown in the edit form. */
export type PropertyDraft = {
  logicalType: string;
  required: boolean;
  unique: boolean;
  primaryKey: boolean;
  classification: string;
  description: string;
};
/** One attribute to write; an undefined value removes the key from the file. */
export type PropertyChange = { key: keyof PropertyDraft; value: string | true | undefined };

const textOf = (value: unknown) => (typeof value === 'string' ? value : '');

/** Reads the form's starting values from the property as it is in the file. */
export function draftOf(property: Record<string, any>): PropertyDraft {
  return {
    logicalType: textOf(property.logicalType),
    required: property.required === true,
    unique: property.unique === true,
    primaryKey: property.primaryKey === true,
    classification: textOf(property.classification),
    description: textOf(property.description),
  };
}

/** Lists the attributes that differ from the file; classification is skipped for people who may
 * not classify. */
export function changesOf(property: Record<string, any>, draft: PropertyDraft, canClassify: boolean): PropertyChange[] {
  const before = draftOf(property);
  const changes: PropertyChange[] = [];
  if (draft.logicalType !== before.logicalType) changes.push({ key: 'logicalType', value: draft.logicalType || undefined });
  for (const { key } of FLAG_FIELDS) if (draft[key] !== before[key]) changes.push({ key, value: draft[key] ? true : undefined });
  if (canClassify && draft.classification.trim() !== before.classification) changes.push({ key: 'classification', value: draft.classification.trim() || undefined });
  if (draft.description.trim() !== before.description.trim())
    changes.push({
      key: 'description',
      value: draft.description.trim() ? draft.description : undefined,
    });
  return changes;
}

type Options = {
  canEdit?: boolean;
  canClassify?: boolean;
  /** How the project reads classification values, so protected properties stay read-only. */
  classification?: ClassificationSettings;
  doc: Doc;
  base: string;
  onSaved: (saved: Saved[], label: string) => void;
};
/** What the Properties tab needs to offer editing: which rows can be edited, a one-attribute save
 * for the controls in the row, and the dialog for the rest. */
export type PropertyEditor = {
  canEditProperty: (path: string, property: Record<string, any>) => boolean;
  /** Saves one attribute; resolves to the reason it was not written, or null when it was. */
  saveChange: (objectIndex: number, path: string, change: PropertyChange) => Promise<string | null>;
  renderDialog: (request: PropertyEditRequest) => React.ReactNode;
};
/** Names the property an open edit dialog works on. */
export type PropertyEditRequest = {
  objectIndex: number;
  /** The table's name, shown in the dialog title next to the property. */
  tableName: string;
  path: string;
  property: Record<string, any>;
  onClose: () => void;
};

/** Builds the property edit dialog and the rule for which rows may be edited. */
export function propertyEditor(options: Options): PropertyEditor {
  const { canEdit = true, canClassify = true, classification } = options;
  return {
    // Nested properties (dotted paths) are edited in Source or the item editor; top-level ones
    // here. A property at or above the protected level is changed only by those who may classify.
    canEditProperty: (path, property) => {
      const locked = !canClassify && isProtected(property.classification, classification);
      return canEdit && !locked && !/[.[]/.test(path);
    },
    saveChange: (objectIndex, path, change) => saveChanges(options, objectIndex, path, [change]),
    renderDialog: request => <PropertyEditDialog key={request.path} {...request} options={options} />,
  };
}

/** Applies the changes to the file text and checks the result against the ODCS schema. */
function patchedSource(options: Options, objectIndex: number, path: string, changes: PropertyChange[]): string {
  const { doc, base } = options;
  const properties = (validateInput(base, doc.filename).model as any)?.document?.schema?.[objectIndex]?.properties;
  const index = Array.isArray(properties) ? properties.findIndex((p: any) => p?.name === path) : -1;
  if (index < 0) throw new Error(`${path} is no longer in the file.`);
  let next = base;
  for (const change of changes) next = propertyEdit(next, doc.filename, objectIndex, index, change.key, change.value);
  const check = validateInput(next, doc.filename);
  if (!check.valid) {
    const problems = check.issues.filter(i => i.severity === 'error').map(i => i.message);
    throw new Error(`Not saved: ${problems.join(' ')}`);
  }
  return next;
}

/** Saves the changes and returns the reason when the file was not written. */
async function saveChanges(options: Options, objectIndex: number, path: string, changes: PropertyChange[]): Promise<string | null> {
  const { doc } = options;
  try {
    const next = patchedSource(options, objectIndex, path, changes);
    const result = await api.save(doc.project, doc.path, doc.hash, next, diffPatches(doc.source, next));
    const keys = changes.map(change => change.key).join(', ');
    options.onSaved([{ docId: doc.id, source: next, hash: result.hash }], `Saved ${keys} of ${path}.`);
    return null;
  } catch (error) {
    if (error instanceof StaleSave) return 'Not saved: the file changed since it was opened. Reopen it and try again.';
    return (error as Error).message;
  }
}

function FlagField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="odcs-form-flag">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function LogicalTypeField({ value, original, onChange }: { value: string; original: string; onChange: (value: string) => void }) {
  const isStandard = LOGICAL_TYPES.includes(original);
  return (
    <label className="odcs-form-field">
      <span>Logical type</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {!isStandard && <option value={original}>{original || 'Not set'}</option>}
        {LOGICAL_TYPES.map(type => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </label>
  );
}

function PropertyEditDialog({ objectIndex, tableName, path, property, onClose, options }: PropertyEditRequest & { options: Options }) {
  const canClassify = options.canClassify ?? true;
  const [draft, setDraft] = useState(() => draftOf(property));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const changes = changesOf(property, draft, canClassify);
  const set = (patch: Partial<PropertyDraft>) => setDraft(current => ({ ...current, ...patch }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!changes.length || saving) return;
    setSaving(true);
    const failure = await saveChanges(options, objectIndex, path, changes);
    setSaving(false);
    if (failure) setError(failure);
    else onClose();
  }
  const footer = (
    <>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" form="property-edit-form" className="primary" disabled={!changes.length || saving}>
        {saving ? 'Saving' : 'Save to file'}
      </button>
    </>
  );
  return (
    <Modal title={`Edit ${tableName}.${path}`} onCancel={onClose} footer={footer} footerNote={changes.length ? undefined : 'No changes yet.'} className="odcs-edit-dialog">
      <form id="property-edit-form" className="odcs-form" onSubmit={save}>
        <LogicalTypeField value={draft.logicalType} original={textOf(property.logicalType)} onChange={logicalType => set({ logicalType })} />
        <div className="odcs-form-flags" role="group" aria-label="Constraints">
          {FLAG_FIELDS.map(({ key, label }) => (
            <FlagField key={key} label={label} checked={draft[key]} onChange={checked => set({ [key]: checked })} />
          ))}
        </div>
        <label className="odcs-form-field">
          <span>Classification</span>
          <input value={draft.classification} disabled={!canClassify} onChange={e => set({ classification: e.target.value })} />
          <small className="odcs-form-hint">{canClassify ? 'The sensitivity label of this column, such as public or restricted.' : 'Only a Steward or Admin changes a classification.'}</small>
        </label>
        <label className="odcs-form-field">
          <span>Description</span>
          <textarea rows={4} value={draft.description} onChange={e => set({ description: e.target.value })} />
        </label>
        {error && (
          <p role="alert" className="dialog-error">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
