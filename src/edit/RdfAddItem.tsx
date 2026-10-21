/** Adds or deletes RDF resources only after validation and graph-equivalence checks. */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Issue } from '../diagnostics';
import { Modal } from '../projects/Modal';
import { api, StaleSave, type Doc } from '../projects/api';
import { diffPatches } from '../editor/patch';
import { validateInWorker } from '../editor/lint';
import { addRdfItem, deleteRdfItem, rdfPrefixes, type DesiredPair } from './rdf-patch/index';
import { parseObject } from './rdf-patch/terms';
import type { Saved } from './ItemEditor';
import './edit.css';
// Add an RDF resource: an OWL class or property, a SHACL shape or any resource, written in the
// file's serialization and layout, checked by the RDF gate before Save.
type Kind = 'class' | 'object' | 'datatype' | 'node' | 'property' | 'resource';
const KINDS: Record<
  Kind,
  {
    label: string;
    type?: string;
    fields: { key: string; label: string; predicate: string; hint?: string }[];
  }
> = {
  class: {
    label: 'OWL class',
    type: 'owl:Class',
    fields: [
      {
        key: 'parent',
        label: 'Subclass of',
        predicate: 'rdfs:subClassOf',
        hint: 'A class, for example ex:Party',
      },
    ],
  },
  object: {
    label: 'Object property',
    type: 'owl:ObjectProperty',
    fields: [
      { key: 'domain', label: 'Domain', predicate: 'rdfs:domain' },
      { key: 'range', label: 'Range', predicate: 'rdfs:range' },
    ],
  },
  datatype: {
    label: 'Datatype property',
    type: 'owl:DatatypeProperty',
    fields: [
      { key: 'domain', label: 'Domain', predicate: 'rdfs:domain' },
      { key: 'range', label: 'Range', predicate: 'rdfs:range', hint: 'For example xsd:string' },
    ],
  },
  node: {
    label: 'SHACL node shape',
    type: 'sh:NodeShape',
    fields: [{ key: 'target', label: 'Target class', predicate: 'sh:targetClass' }],
  },
  property: {
    label: 'SHACL property shape',
    type: 'sh:PropertyShape',
    fields: [
      { key: 'path', label: 'Path', predicate: 'sh:path' },
      {
        key: 'datatype',
        label: 'Datatype',
        predicate: 'sh:datatype',
        hint: 'For example xsd:string',
      },
      { key: 'min', label: 'Minimum count', predicate: 'sh:minCount', hint: 'A number' },
    ],
  },
  resource: {
    label: 'RDF resource',
    fields: [
      { key: 'type', label: 'Type', predicate: 'a', hint: 'A class, for example ex:Person' },
    ],
  },
};
const quote = (s: string) => JSON.stringify(s);
/** Previews and validates a new RDF resource in the file's serialization. */
export function RdfAddItem({
  doc,
  base,
  onClose,
  onSaved,
}: {
  doc: Doc;
  base: string;
  onClose: () => void;
  onSaved: (saved: Saved, subject: string) => void;
}) {
  const prefixes = useMemo(() => rdfPrefixes(base, doc.filename), []);
  const own = Object.keys(prefixes).find(
    p => !['rdf', 'rdfs', 'owl', 'xsd', 'sh', 'skos', 'dcterms', 'schema'].includes(p),
  );
  const [kind, setKind] = useState<Kind>('class');
  const [values, setValues] = useState<Record<string, string>>({ iri: own ? `${own}:` : '' });
  const [check, setCheck] = useState<{ text: string; issues: Issue[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const plan = useMemo(() => {
    const iri = (values.iri ?? '').trim();
    if (!iri || iri.endsWith(':'))
      return { error: 'Give the new resource an IRI or a prefixed name.' };
    let subject: string;
    try {
      const t = parseObject(iri, prefixes).term;
      if (t.termType !== 'NamedNode') throw Error();
      subject = t.value;
    } catch {
      return { error: `"${iri}" is not an IRI or a prefixed name of this file.` };
    }
    const spec = KINDS[kind];
    const pairs: DesiredPair[] = [];
    if (spec.type) pairs.push({ predicateText: 'a', objectText: spec.type });
    if (values.label?.trim())
      pairs.push({
        predicateText: kind === 'property' ? 'sh:name' : 'rdfs:label',
        objectText: quote(values.label.trim()),
      });
    if (values.comment?.trim())
      pairs.push({
        predicateText: kind === 'property' || kind === 'node' ? 'sh:description' : 'rdfs:comment',
        objectText: quote(values.comment.trim()),
      });
    for (const f of spec.fields)
      if (values[f.key]?.trim())
        pairs.push({ predicateText: f.predicate, objectText: values[f.key].trim() });
    if (!pairs.length) return { error: 'Add at least a type or a label.' };
    const r = addRdfItem(base, doc.filename, subject, pairs);
    return r.ok
      ? {
          text: r.text,
          subject,
          inserted: r.patches
            .map(p => p.insert)
            .join('')
            .replace(/^\r?\n/, ''),
          line: base.slice(0, r.patches[0]?.from ?? 0).split('\n').length,
        }
      : { error: r.error };
  }, [kind, JSON.stringify(values)]);
  useEffect(() => {
    if (!('text' in plan) || !plan.text) return;
    const at = plan.text;
    const t = setTimeout(
      () => validateInWorker(at, doc.filename).then(issues => setCheck({ text: at, issues })),
      200,
    );
    return () => clearTimeout(t);
  }, [plan]);
  const ready = 'text' in plan && !!plan.text;
  const pending = ready && check?.text !== (plan as any).text;
  const errors =
    ready && check?.text === (plan as any).text
      ? check!.issues.filter(i => i.severity === 'error')
      : [];
  async function save() {
    if (!('text' in plan) || !plan.text) return;
    setSaving(true);
    setError('');
    try {
      const r = await api.save(
        doc.project,
        doc.path,
        doc.hash,
        plan.text,
        diffPatches(doc.source, plan.text),
      );
      onSaved({ docId: doc.id, source: plan.text, hash: r.hash }, plan.subject!);
    } catch (e) {
      setError(
        e instanceof StaleSave
          ? 'Not saved: the file changed since you opened it. Close this and try again.'
          : (e as Error).message,
      );
      setSaving(false);
    }
  }
  const field = (key: string, label: string, hint?: string, wide = false) => (
    <label key={key} className={wide ? 'wide' : ''}>
      <span>{label}</span>
      <input
        aria-label={label}
        value={values[key] ?? ''}
        onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
  return (
    <Modal title={`Add to ${doc.path}`} onCancel={onClose} className="item-editor add-item">
      <div className="item-fields">
        <label className="wide">
          <span>What to add</span>
          <select
            aria-label="Item type"
            value={kind}
            onChange={e => setKind(e.target.value as Kind)}
          >
            {(Object.keys(KINDS) as Kind[]).map(k => (
              <option key={k} value={k}>
                {KINDS[k].label}
              </option>
            ))}
          </select>
        </label>
        {field(
          'iri',
          'IRI',
          `A prefixed name (${Object.keys(prefixes).slice(0, 4).join(', ')}…) or a full <IRI>`,
          true,
        )}
        {field('label', kind === 'property' ? 'Name' : 'Label')}
        {field('comment', 'Description')}
        {KINDS[kind].fields.map(f => field(f.key, f.label, f.hint))}
      </div>
      {'error' in plan && plan.error ? (
        <p className="item-note">{plan.error}</p>
      ) : (
        'inserted' in plan && (
          <div className="item-preview">
            <strong>Will be added at line {plan.line}</strong>
            <pre aria-label="Text to insert">{plan.inserted}</pre>
          </div>
        )
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
      <div className="repair-actions">
        <button type="button" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          onClick={save}
          disabled={!ready || pending || errors.length > 0 || saving}
        >
          {saving ? 'Saving…' : pending ? 'Checking…' : 'Save to file'}
        </button>
      </div>
    </Modal>
  );
}
// Delete an RDF resource: its statements, and the statements in the same file that name it (listed
// first); references in other files are listed as breaking.
/** Reviews references before deleting an RDF resource and its statements. */
export function RdfDeleteItem({
  doc,
  base,
  subject,
  label,
  projectDocs,
  onClose,
  onDeleted,
}: {
  doc: Doc;
  base: string;
  subject: string;
  label: string;
  projectDocs: Doc[];
  onClose: () => void;
  onDeleted: (saved: Saved[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const result = useMemo(() => deleteRdfItem(base, doc.filename, subject, true), []);
  const elsewhere = useMemo(
    () => projectDocs.filter(d => d.id !== doc.id && d.source.includes(subject)).map(d => d.path),
    [],
  );
  async function confirm() {
    if (!result.ok) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.save(
        doc.project,
        doc.path,
        doc.hash,
        result.text,
        diffPatches(doc.source, result.text),
      );
      onDeleted([{ docId: doc.id, source: result.text, hash: r.hash }]);
    } catch (e) {
      setError(
        e instanceof StaleSave
          ? 'Nothing was deleted: the file changed since this opened.'
          : `Nothing was deleted: ${(e as Error).message}`,
      );
      setBusy(false);
    }
  }
  return (
    <Modal title={`Delete ${label}?`} onCancel={onClose}>
      <p>
        The resource's statements are removed from {doc.path} when you press Delete. Git keeps the
        previous version.
      </p>
      <h3>Removed</h3>
      <ul className="delete-list">
        <li>
          Every statement about <code>{subject}</code>
          {result.ok ? ` (${result.removed} triples)` : ''}
        </li>
        {result.ok &&
          result.dependents?.flatMap(d =>
            d.pairs.map(p => (
              <li key={d.subject + p}>
                {d.subject} {p}
              </li>
            )),
          )}
      </ul>
      {result.ok && (result.dependents?.length ?? 0) > 0 && (
        <p className="item-note">
          These statements name {label} and are removed with it. Cancel to keep everything.
        </p>
      )}
      {elsewhere.length > 0 && (
        <div className="delete-warning">
          <strong>Other files of the project still name it (fix them in Source):</strong>
          <ul>
            {elsewhere.map(p => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {!result.ok && (
        <p role="alert" className="dialog-error">
          {result.error}
        </p>
      )}
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
      <div className="repair-actions">
        <button type="button" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="danger" onClick={confirm} disabled={busy || !result.ok}>
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}
