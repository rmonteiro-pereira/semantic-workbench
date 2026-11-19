import { BranchControl } from '../item-diff/BranchControl';
import { addressAtModelPath } from '../../shared/core/model-addresses';
import { itemAddress } from '../item-diff/ItemChangeAnnotation';
import { ChangeMark } from '../item-diff/ChangeMark';
import type { ItemChange } from '../../shared/item-diff/item-change';
import { useItemDiffContext, useVisibleItemChanges } from '../item-diff/ItemDiffContext';
/** The attributes of a concept in the details panel: listed in order, with inherited ones marked, and added, edited, moved and removed in place. */
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { itemValue } from '../../shared/edit/yaml-patch';
import { orderAfterMove, orderedAttributes, orderListOf } from '../../shared/attributes/attribute-order';
import { attributesOf, conceptKindLookup, type AttributeEntry } from '../../shared/attributes/attribute-rule';
import { useCapabilities } from '../auth/Capabilities';
import { UNSAVED_SOURCE_NOTE, type DetailsSection } from '../edit/section-context';
import { saveWrites } from '../edit/save-writes';
import { useRevisionGate } from '../edit/RevisionConfirmation';
import { AttributeForm } from './AttributeForm';
import { AttributeRow } from './AttributeRow';
import { planReorderAttributes } from './attribute-save';
import './attributes.css';

/** What the section shows while its data is not ready. */
export type SectionState = { kind: 'ready' } | { kind: 'loading' } | { kind: 'error'; message: string; retry: () => void };

type Props = {
  section: DetailsSection;
  state?: SectionState;
  /** Opens the delete confirmation for one attribute, which is a relationship of the concept. */
  onRemove: (relationshipIndex: number, name: string) => void;
};

function readingOf(entry: AttributeEntry): string | undefined {
  const readings = entry.relationship.verbalizes;
  return Array.isArray(readings) && typeof readings[0] === 'string' ? readings[0] : undefined;
}

type ViewProps = {
  removed?: ItemChange[];
  onOpenRemoved?: (address: string) => void;
  annotationsFor?: (entry: AttributeEntry) => React.ReactNode;
  branchControlFor?: (entry: AttributeEntry) => React.ReactNode;
  entries: AttributeEntry[];
  state: SectionState;
  canEdit: boolean;
  /** Why the person may not edit, shown when they may not. */
  editNote?: string;
  message: string;
  openConcept?: (name: string) => void;
  onAdd: () => void;
  onEdit: (relationshipIndex: number) => void;
  onMove: (name: string, direction: 'up' | 'down') => void;
  onRemove: (relationshipIndex: number, name: string) => void;
};

/** The attribute section as the person sees it, for every state: loading, error, empty, read only and filled. */
export function AttributeListView({
  removed = [],
  onOpenRemoved,
  annotationsFor,
  branchControlFor,
  entries,
  state,
  canEdit,
  editNote,
  message,
  openConcept,
  onAdd,
  onEdit,
  onMove,
  onRemove,
}: ViewProps) {
  const ownNames = entries.filter(entry => !entry.inheritedFrom).map(entry => entry.name);
  function actionsFor(entry: AttributeEntry) {
    if (entry.inheritedFrom) return undefined;
    const position = ownNames.indexOf(entry.name);
    return (
      <>
        <button type="button" aria-label={`Move ${entry.name} up`} disabled={!canEdit || position === 0} onClick={() => onMove(entry.name, 'up')}>
          <ArrowUp size={12} />
        </button>
        <button type="button" aria-label={`Move ${entry.name} down`} disabled={!canEdit || position === ownNames.length - 1} onClick={() => onMove(entry.name, 'down')}>
          <ArrowDown size={12} />
        </button>
        <button type="button" aria-label={`Edit ${entry.name}`} disabled={!canEdit} onClick={() => onEdit(entry.relationshipIndex)}>
          <Pencil size={12} />
        </button>
        <button type="button" aria-label={`Remove ${entry.name}`} disabled={!canEdit} onClick={() => onRemove(entry.relationshipIndex, entry.name)}>
          <Trash2 size={12} />
        </button>
      </>
    );
  }
  const addButton = (
    <button type="button" onClick={onAdd} disabled={!canEdit} title={editNote}>
      <Plus size={13} />
      Add attribute
    </button>
  );
  let body: React.ReactNode;
  if (state.kind === 'loading')
    body = (
      <p className="attribute-placeholder" role="status">
        Loading attributes…
      </p>
    );
  else if (state.kind === 'error')
    body = (
      <div role="alert" className="attribute-error">
        <p>{state.message}</p>
        <button type="button" onClick={state.retry}>
          Try again
        </button>
      </div>
    );
  else if (!entries.length && !removed.length)
    body = (
      <div className="attribute-empty">
        <p>No attributes yet</p>
        {addButton}
      </div>
    );
  else
    body = (
      <>
        <ul className="attribute-list">
          {entries.map(entry => (
            <AttributeRow
              key={`${entry.inheritedFrom ?? ''}/${entry.name}`}
              name={entry.name}
              valueType={entry.valueType}
              reading={readingOf(entry)}
              multiplicity={typeof entry.relationship.multiplicity === 'string' ? entry.relationship.multiplicity : undefined}
              description={typeof entry.relationship.description === 'string' ? entry.relationship.description : undefined}
              inheritedFrom={entry.inheritedFrom}
              onOpenInheritedFrom={openConcept}
              annotations={annotationsFor?.(entry)}
              actions={
                entry.inheritedFrom ? undefined : (
                  <>
                    {actionsFor(entry)}
                    {branchControlFor?.(entry)}
                  </>
                )
              }
            />
          ))}
          {removed.map(change => (
            <AttributeRow
              key={change.address}
              name={change.name}
              valueType="Published attribute"
              annotations={<ChangeMark change="removed" />}
              actions={
                <button type="button" onClick={() => onOpenRemoved?.(change.address)}>
                  View published item
                </button>
              }
            />
          ))}
        </ul>
        {addButton}
      </>
    );
  return (
    <section className="attribute-section" aria-label="Attributes">
      <div className="section-label">ATTRIBUTES</div>
      {!canEdit && editNote && <p className="hint">{editNote}</p>}
      {body}
      {message && (
        <p role="alert" className="dialog-error">
          {message}
        </p>
      )}
    </section>
  );
}

/** Renders the attribute section of one concept, with the form and the revision question it may open. */
export function AttributeList({ section, state = { kind: 'ready' }, onRemove }: Props) {
  const changes = useVisibleItemChanges();
  const overlay = useItemDiffContext();
  const conceptAddress = changes.length ? addressAtModelPath(section.document, section.itemPath) : undefined;
  const relationshipPrefix = conceptAddress ? itemAddress(section.doc, conceptAddress) + '/relationship:' : '';
  const removed = relationshipPrefix ? changes.filter(change => change.kind === 'attribute' && change.state === 'removed' && change.address.startsWith(relationshipPrefix)) : [];
  function annotationsFor(entry: AttributeEntry) {
    if (entry.inheritedFrom) return undefined;
    const address = changes.length ? addressAtModelPath(section.document, [...section.itemPath, 'relationships', entry.relationshipIndex]) : undefined;
    if (!address) return undefined;
    const absolute = itemAddress(section.doc, address);
    const change = changes.find(candidate => candidate.address === absolute && candidate.state !== 'removed');
    return change ? <ChangeMark change={change.state} /> : undefined;
  }
  function branchControlFor(entry: AttributeEntry) {
    if (entry.inheritedFrom) return undefined;
    return <BranchControl name={entry.name} dirty={section.dirty} />;
  }
  const access = useCapabilities(section.doc.project);
  const { gate, dialog } = useRevisionGate(section.doc);
  const [form, setForm] = useState<{ index?: number } | null>(null);
  const [message, setMessage] = useState('');
  const concept = itemValue(section.doc.source, section.itemPath) ?? {};
  const concepts = section.document.ontology ?? [];
  const lookup = conceptKindLookup(concepts);
  const shown = orderedAttributes(attributesOf(concept, concepts, lookup), orderListOf(concept));
  const ownNames = shown.filter(entry => !entry.inheritedFrom).map(entry => entry.name);
  const editNote = section.dirty ? UNSAVED_SOURCE_NOTE : access.control('edit').title;
  const canEdit = access.can('edit') && !section.dirty;

  async function move(name: string, direction: 'up' | 'down') {
    await gate(async finish => {
      const plan = planReorderAttributes(section.doc, section.itemPath, orderAfterMove(ownNames, name, direction), finish);
      if ('refusal' in plan) return setMessage(plan.refusal);
      try {
        const writes = [{ doc: section.doc, source: plan.writes[0].source }];
        section.applySaved(await saveWrites(section.doc.project, writes), `Moved attribute ${name}.`);
        setMessage('');
      } catch (problem) {
        setMessage((problem as Error).message);
      }
    });
  }

  const editedEntry = form?.index === undefined ? undefined : shown.find(entry => !entry.inheritedFrom && entry.relationshipIndex === form.index);
  const initial = editedEntry && {
    name: editedEntry.name,
    valueType: editedEntry.valueType,
    reading: readingOf(editedEntry) ?? '',
    description: typeof editedEntry.relationship.description === 'string' ? editedEntry.relationship.description : '',
    multiplicity: typeof editedEntry.relationship.multiplicity === 'string' ? editedEntry.relationship.multiplicity : '',
  };
  return (
    <>
      <AttributeListView
        entries={shown}
        removed={removed}
        onOpenRemoved={address => overlay?.openRemoved('removed:' + address)}
        annotationsFor={changes.length ? annotationsFor : undefined}
        branchControlFor={branchControlFor}
        state={state}
        canEdit={canEdit}
        editNote={editNote}
        message={message}
        openConcept={section.openConcept}
        onAdd={() => setForm({})}
        onEdit={index => setForm({ index })}
        onMove={move}
        onRemove={onRemove}
      />
      {form && <AttributeForm section={section} conceptName={String(concept.concept ?? '')} relationshipIndex={form.index} initial={initial} onClose={() => setForm(null)} />}
      {dialog}
    </>
  );
}
