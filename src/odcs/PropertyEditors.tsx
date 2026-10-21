import React, { useEffect, useRef, useState } from 'react';
import { valuePatches } from '../edit/yaml-patch';
import { applyPatches, diffPatches } from '../editor/patch';
import { validateInput } from '../input';
import { api, StaleSave, type Doc } from '../projects/api';
import type { Saved } from '../edit/ItemEditor';
import type { PropertyCellProps } from './DatasetPage';
// In-place property edits from the schema table (FR-058): one value changes, written with the same
// patchers as the item editor (only the edited value's text changes, YAML or JSON), checked with the
// shared validation (the pinned ODCS 3.1.0 schema) and saved against the file's base hash.
export const LOGICAL_TYPES = [
  'string',
  'date',
  'timestamp',
  'time',
  'number',
  'integer',
  'object',
  'array',
  'boolean',
];
const FLAGS = new Set(['required', 'unique', 'primaryKey']);
const TEXTS = new Set(['classification', 'description']);
// The file text after setting one attribute of a top-level property (`undefined` removes the key).
export function propertyEdit(
  source: string,
  filename: string,
  objectIndex: number,
  propertyIndex: number,
  key: string,
  value: unknown,
) {
  const path = ['schema', objectIndex, 'properties', propertyIndex, key];
  return applyPatches(source, valuePatches(source, path, value, filename));
}
type Options = {
  doc: Doc;
  base: string;
  onSaved: (saved: Saved[], label: string) => void;
  onError: (message: string) => void;
};
export function propertyEditor({ doc, base, onSaved, onError }: Options) {
  const properties = (objectIndex: number) => {
    try {
      return (validateInput(base, doc.filename).model as any)?.document?.schema?.[objectIndex]
        ?.properties;
    } catch {
      return null;
    }
  };
  async function save(objectIndex: number, path: string, key: string, value: unknown) {
    const list = properties(objectIndex);
    const index = Array.isArray(list) ? list.findIndex((p: any) => p?.name === path) : -1;
    if (index < 0) return;
    let next: string;
    try {
      next = propertyEdit(base, doc.filename, objectIndex, index, key, value);
    } catch (e) {
      onError((e as Error).message);
      return;
    }
    if (next === base) return;
    const check = validateInput(next, doc.filename);
    if (!check.valid) {
      onError(
        `Not saved: ${check.issues
          .filter(i => i.severity === 'error')
          .map(i => i.message)
          .join(' ')}`,
      );
      return;
    }
    try {
      const r = await api.save(
        doc.project,
        doc.path,
        doc.hash,
        next,
        diffPatches(doc.source, next),
      );
      onSaved([{ docId: doc.id, source: next, hash: r.hash }], `Saved ${key} of ${path}.`);
    } catch (e) {
      onError(
        e instanceof StaleSave
          ? 'Not saved: the file changed since it was opened. Reopen it and try again.'
          : (e as Error).message,
      );
    }
  }
  // Nested properties (dotted paths) are edited in Source or the item editor; top-level ones here.
  return function editor({
    objectIndex,
    path,
    property,
    column,
  }: PropertyCellProps): React.ReactNode | null {
    if (/[.[]/.test(path)) return null;
    const label = `${column.label} of ${path}`;
    if (FLAGS.has(column.key))
      return (
        <CheckCell
          label={label}
          value={property[column.key] === true}
          onChange={v => save(objectIndex, path, column.key, v ? true : undefined)}
        />
      );
    if (column.key === 'logicalType')
      return (
        <select
          className="odcs-edit"
          aria-label={label}
          value={typeof property.logicalType === 'string' ? property.logicalType : ''}
          onChange={e => void save(objectIndex, path, 'logicalType', e.target.value || undefined)}
        >
          {!LOGICAL_TYPES.includes(property.logicalType) && (
            <option value="">
              {property.logicalType === undefined ? '—' : String(property.logicalType)}
            </option>
          )}
          {LOGICAL_TYPES.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      );
    if (TEXTS.has(column.key))
      return (
        <TextCell
          label={label}
          value={typeof property[column.key] === 'string' ? property[column.key] : ''}
          multiline={column.key === 'description'}
          onCommit={v => void save(objectIndex, path, column.key, v.trim() ? v : undefined)}
        />
      );
    return null;
  };
}
// Shows the new state at once; the file's value takes over again once saved (or if the save fails).
function CheckCell({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => Promise<void>;
}) {
  const [shown, setShown] = useState(value);
  useEffect(() => setShown(value), [value]);
  return (
    <input
      type="checkbox"
      className="odcs-edit-check"
      aria-label={label}
      checked={shown}
      onChange={e => {
        const v = e.target.checked;
        setShown(v);
        void onChange(v).finally(() => setShown(value));
      }}
    />
  );
}
// Looks like text until focused; Enter (or leaving the field) saves, Escape restores.
function TextCell({
  label,
  value,
  multiline,
  onCommit,
}: {
  label: string;
  value: string;
  multiline: boolean;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const cancelled = useRef(false);
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (draft !== value) onCommit(draft);
  };
  const keys = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      cancelled.current = true;
      setDraft(value);
      (e.target as HTMLElement).blur();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  };
  return multiline ? (
    <textarea
      className="odcs-edit text"
      rows={1}
      aria-label={label}
      value={draft}
      placeholder="—"
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={keys}
    />
  ) : (
    <input
      className="odcs-edit text"
      aria-label={label}
      value={draft}
      placeholder="—"
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={keys}
    />
  );
}
