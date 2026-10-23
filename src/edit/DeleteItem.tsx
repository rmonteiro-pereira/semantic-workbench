/** Confirms item deletion with its dependents and broken references before a journaled save. */
import { useCapabilities } from '../auth/Capabilities';
import React, { useEffect, useState } from 'react';
import { Modal } from '../projects/Modal';
import { api, StaleSave, type Doc } from '../projects/api';
import { diffPatches } from '../editor/patch';
import { validateInput } from '../input';
import { findReferences, removeDependents, type Reference } from './references';
import { kindLabel, type ItemKind, type Path } from './item-model';
import type { Saved } from './ItemEditor';
import './edit.css';
// Delete an entity or relationship: the confirmation lists what depends on it (removed with it)
// and the references that will no longer resolve (kept, to fix in Source). Delete writes every
// affected file in one journaled save; Cancel changes nothing.
type Props = {
  doc: Doc;
  base: string;
  path: Path;
  kind: ItemKind;
  name: string;
  owner?: string;
  projectDocs: Doc[];
  onClose: () => void;
  onDeleted: (saved: Saved[]) => void;
};
type Plan = {
  dependents: Reference[];
  breaking: Reference[];
  files: { doc: Doc; source: string }[];
  invalid: string[];
};
/** Reviews dependencies and confirms an item deletion across affected files. */
export function DeleteItem({
  doc,
  base,
  path,
  kind,
  name,
  owner,
  projectDocs,
  onClose,
  onDeleted,
}: Props) {
  const access = useCapabilities(doc.project);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const docs = projectDocs.map(d => (d.id === doc.id ? { ...d, source: base } : d));
        const refs = findReferences({ kind, name, docId: doc.id, path, owner }, docs);
        const dependents = refs.filter(r => r.dependent);
        const breaking = refs.filter(r => !r.dependent);
        // The item itself is removed together with its dependents, from the last position to the
        // first.
        const edited = removeDependents(docs, [
          { docId: doc.id, dependent: { path, label: name } },
          ...dependents.map(r => ({ docId: r.docId, dependent: r.dependent! })),
        ]);
        const files = edited.map(e => ({
          doc: docs.find(d => d.id === e.docId)!,
          source: e.source,
        }));
        const invalid = files.flatMap(f => {
          const v = validateInput(f.source, f.doc.filename);
          return v.valid
            ? []
            : [
                `${f.doc.path}: ${v.issues
                  .filter(i => i.severity === 'error')
                  .map(i => i.message)
                  .join(' ')}`,
              ];
        });
        setPlan({ dependents, breaking, files, invalid });
      } catch (e) {
        setError((e as Error).message);
      }
    }, 20);
    return () => clearTimeout(t);
  }, []);
  async function confirm() {
    if (!plan) return;
    setBusy(true);
    setError('');
    try {
      const disk = (d: Doc) => projectDocs.find(x => x.id === d.id)!;
      let written: Saved[];
      if (plan.files.length === 1) {
        const f = plan.files[0];
        const r = await api.save(
          f.doc.project,
          f.doc.path,
          disk(f.doc).hash,
          f.source,
          diffPatches(disk(f.doc).source, f.source),
        );
        written = [{ docId: f.doc.id, source: f.source, hash: r.hash }];
      } else {
        const r = await api.saveBatch(
          doc.project,
          plan.files.map(f => ({
            path: f.doc.path,
            baseHash: disk(f.doc).hash,
            patches: diffPatches(disk(f.doc).source, f.source),
          })),
        );
        written = plan.files.map((f, i) => ({
          docId: f.doc.id,
          source: f.source,
          hash: r.written[i].hash,
        }));
      }
      onDeleted(written);
    } catch (e) {
      setError(
        e instanceof StaleSave
          ? 'Nothing was deleted: a file changed since this opened. Close it and try again.'
          : `Nothing was deleted: ${(e as Error).message}`,
      );
      setBusy(false);
    }
  }
  const unique = (refs: Reference[]) => [
    ...new Map(
      refs.map(r => [
        `${r.docId}|${JSON.stringify(r.dependent?.path ?? r.path)}|${r.dependent?.binding?.metric ?? ''}`,
        r,
      ]),
    ).values(),
  ];
  const footer = (
    <>
      <button type="button" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button
        type="button"
        className="danger"
        onClick={confirm}
        title={access.control('edit').title}
        disabled={!access.can('edit') || busy || !plan || plan.invalid.length > 0}
      >
        {busy ? 'Deleting…' : 'Delete'}
      </button>
    </>
  );
  return (
    <Modal title={`Delete ${name}?`} onCancel={onClose} footer={footer}>
      <p>
        The {kindLabel[kind].toLowerCase()} is removed from {doc.path} when you press Delete. Git
        keeps the previous version of every file.
      </p>
      <h3>Removed</h3>
      <ul className="delete-list">
        <li>
          {kindLabel[kind]} {name} ({doc.path})
        </li>
        {plan &&
          unique(plan.dependents).map((r, i) => (
            <li key={i}>
              {r.dependent!.label}{' '}
              <small>
                ({r.file}:{r.line})
              </small>
            </li>
          ))}
      </ul>
      {!plan && !error && <p role="status">Looking for what depends on {name}…</p>}
      {plan && plan.dependents.length > 0 && (
        <p className="item-note">
          These depend on {name} and are removed with it. Cancel to keep everything.
        </p>
      )}
      {plan && plan.breaking.length > 0 && (
        <div className="delete-warning">
          <strong>These references will no longer resolve (fix them in Source):</strong>
          <ul>
            {plan.breaking.map((r, i) => (
              <li key={i}>
                <code>
                  {r.file}:{r.line}
                </code>{' '}
                {r.excerpt}
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan && plan.invalid.length > 0 && (
        <div role="alert" className="delete-warning">
          <strong>
            After this delete these files would not be valid, so nothing can be deleted yet:
          </strong>
          <ul>
            {plan.invalid.map(m => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
