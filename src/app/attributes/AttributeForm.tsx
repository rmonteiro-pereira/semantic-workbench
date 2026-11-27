/** The form that adds or edits one attribute of a concept. It saves through the same patch writer, validation and hash check as the item editor. */
import React, { useId, useMemo, useState } from 'react';
import { valueTypeChoices, suggestedReading } from '../../shared/attributes/attribute-rule';
import { useCapabilities } from '../auth/Capabilities';
import type { DetailsSection } from '../edit/section-context';
import { saveWrites } from '../edit/save-writes';
import { Modal } from '../projects/Modal';
import { planAddAttribute, planEditAttribute, type AttributeInput } from './attribute-save';
import '../edit/edit.css';

/** The attribute being edited, or nothing when a new one is added. */
export type AttributeFormProps = {
  section: DetailsSection;
  conceptName: string;
  /** The position of the relationship in its concept when editing. */
  relationshipIndex?: number;
  initial?: AttributeInput;
  onClose: () => void;
};

const EMPTY: AttributeInput = { name: '', valueType: 'String', reading: '', description: '', multiplicity: '' };

/** Renders the add or edit form for one attribute. */
export function AttributeForm({ section, conceptName, relationshipIndex, initial, onClose }: AttributeFormProps) {
  const access = useCapabilities(section.doc.project);
  const editing = relationshipIndex !== undefined;
  const [values, setValues] = useState<AttributeInput>(initial ?? EMPTY);
  const [readingEdited, setReadingEdited] = useState(editing);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const readingLabelId = useId();
  const readingHintId = useId();
  const types = useMemo(() => valueTypeChoices(section.document.ontology ?? []), [section.document]);
  const reading = readingEdited ? values.reading : suggestedReading(conceptName, values.name || 'name');

  function changeField(field: keyof AttributeInput, value: string) {
    if (field === 'reading') setReadingEdited(true);
    setValues(previous => ({ ...previous, [field]: value }));
  }

  async function save() {
    const input = { ...values, name: values.name.trim(), reading };
    const projectDocs = section.projectDocs.map(candidate => ({ id: candidate.id, path: candidate.path, filename: candidate.filename, source: candidate.source }));
    const own = projectDocs.find(candidate => candidate.id === section.doc.id)!;
    const plan = editing ? planEditAttribute(projectDocs, own, section.document, section.itemPath, relationshipIndex, input) : planAddAttribute(own, section.document, section.itemPath, input);
    if ('refusal' in plan) return setError(plan.refusal);
    setSaving(true);
    setError('');
    try {
      const writes = plan.writes.map(write => ({ doc: section.projectDocs.find(candidate => candidate.id === write.docId)!, source: write.source }));
      section.applySaved(await saveWrites(section.doc.project, writes), `${editing ? 'Saved' : 'Added'} attribute ${input.name}.`);
      onClose();
    } catch (problem) {
      setError((problem as Error).message);
      setSaving(false);
    }
  }

  let saveLabel = 'Add attribute';
  if (saving) saveLabel = 'Saving…';
  else if (editing) saveLabel = 'Save attribute';
  const footer = (
    <>
      <button type="button" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button type="button" className="primary" onClick={save} disabled={saving || !access.can('edit') || !values.name.trim()} title={access.control('edit').title}>
        {saveLabel}
      </button>
    </>
  );
  return (
    <Modal title={editing ? `Edit attribute ${initial?.name}` : `Add an attribute to ${conceptName}`} onCancel={onClose} footer={footer}>
      <div className="item-fields">
        <label>
          <span>
            Name<em aria-hidden> *</em>
          </span>
          <input value={values.name} onChange={event => changeField('name', event.target.value)} autoFocus />
        </label>
        <label>
          <span>Type</span>
          <select value={values.valueType} onChange={event => changeField('valueType', event.target.value)}>
            {types.map(type => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <small>The value types of this file, then the built-in ones.</small>
        </label>
        <label className="attribute-reading">
          <span id={readingLabelId}>Reading sentence</span>
          {/* A reading sentence is often longer than one line, so it wraps instead of scrolling sideways. A textarea's
              text would otherwise join its accessible name, and the suggested sentence names the attribute. */}
          <textarea rows={2} value={reading} onChange={event => changeField('reading', event.target.value)} aria-labelledby={readingLabelId} aria-describedby={readingHintId} />
          <small id={readingHintId}>Say it as a sentence. The standard requires one, so a suggestion is filled in.</small>
        </label>
        <label>
          <span>Multiplicity</span>
          <select value={values.multiplicity ?? ''} onChange={event => changeField('multiplicity', event.target.value)}>
            {['', 'ManyToOne', 'OneToOne'].map(option => (
              <option key={option} value={option}>
                {option || 'Not set'}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Description</span>
          <textarea rows={2} value={values.description ?? ''} onChange={event => changeField('description', event.target.value)} spellCheck />
        </label>
      </div>
      {error && (
        <p role="alert" className="dialog-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
