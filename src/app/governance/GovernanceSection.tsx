/** Governance of one concept, relationship or metric in the details panel: the status mark, and the fields to change it for people who may. */
import React, { useState } from 'react';
import { governanceOf, metricGovernanceOf, statusLabel, type GovernanceEdit, type ItemGovernance } from '../../shared/governance/item-governance';
import { itemValue } from '../../shared/edit/yaml-patch';
import { ONTOLOGY_GUARDS_ACTIVE } from '../../shared/governance/ontology-guards';
import { useCapabilities } from '../auth/Capabilities';
import { useMe } from '../auth/useMe';
import { useRevisionGate } from '../edit/RevisionConfirmation';
import { saveWrites } from '../edit/save-writes';
import { UNSAVED_SOURCE_NOTE, type DetailsSection } from '../edit/section-context';
import type { SectionState } from '../attributes/AttributeList';
import { GovernanceFields } from './GovernanceFields';
import { planItemGovernance, planMetricGovernance, type GovernancePlan } from './governance-save';
import { StatusMark } from './StatusMark';
import { statusChoices, type StatusChoice } from './status-choices';
import './governance.css';

/** What the view shows and the one thing it can ask for. */
export type GovernanceViewProps = {
  governance: ItemGovernance;
  /** Why the fields are read only, or nothing when they can be changed. */
  readOnlyReason?: string;
  choices: StatusChoice[];
  replacementChoices: string[];
  showClassification: boolean;
  state?: SectionState;
  message: string;
  saving: boolean;
  onSave: (edit: GovernanceEdit) => void;
};

function draftOf(governance: ItemGovernance): GovernanceEdit {
  return {
    status: governance.status ?? '',
    owner: governance.owner ?? '',
    steward: governance.steward ?? '',
    classification: governance.classification ?? '',
    replacedBy: governance.replacedBy ?? '',
    deprecationReason: governance.deprecationReason ?? '',
  };
}

function ReadOnlyValues({ governance, showClassification }: { governance: ItemGovernance; showClassification: boolean }) {
  const rows: [string, string | undefined][] = [
    ['Owner', governance.owner],
    ['Steward', governance.steward],
    ...(showClassification ? ([['Classification', governance.classification]] as [string, string | undefined][]) : []),
    ['Replaced by', governance.replacedBy],
    ['Reason for deprecating', governance.deprecationReason],
  ];
  const present = rows.filter(([, value]) => value);
  if (!present.length) return <p className="hint">No owner, steward or other governance values yet.</p>;
  return (
    <dl className="governance-values">
      {present.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** The section as the person sees it, for every state. */
export function GovernanceSectionView({ governance, readOnlyReason, choices, replacementChoices, showClassification, state = { kind: 'ready' }, message, saving, onSave }: GovernanceViewProps) {
  const [draft, setDraft] = useState<GovernanceEdit>(() => draftOf(governance));
  let body: React.ReactNode;
  if (state.kind === 'loading')
    body = (
      <p className="governance-placeholder" role="status">
        Loading governance…
      </p>
    );
  else if (state.kind === 'error')
    body = (
      <div role="alert" className="governance-error">
        <p>{state.message}</p>
        <button type="button" onClick={state.retry}>
          Try again
        </button>
      </div>
    );
  else if (readOnlyReason)
    body = (
      <>
        <p className="hint">{readOnlyReason}</p>
        <ReadOnlyValues governance={governance} showClassification={showClassification} />
      </>
    );
  else
    body = (
      <>
        {governance.status === 'approved' && <p className="hint">Changing an approved item returns it to proposed unless you may approve the change.</p>}
        <GovernanceFields
          values={draft}
          onChange={(field, value) => setDraft(previous => ({ ...previous, [field]: value }))}
          choices={choices}
          replacementChoices={replacementChoices}
          showClassification={showClassification}
          disabled={saving}
        />
        <button type="button" className="primary" disabled={saving} onClick={() => onSave(draft)}>
          {saving ? 'Saving…' : 'Save governance'}
        </button>
      </>
    );
  return (
    <section className="governance-section" aria-label="Governance">
      <div className="section-label">GOVERNANCE</div>
      <div className="governance-status" aria-label={`Status: ${statusLabel(governance.status)}`}>
        <StatusMark status={governance.status} />
      </div>
      {governance.secondEntryIgnored && <p className="hint">This metric has a second workbench entry. Only the first one is read and shown.</p>}
      {body}
      {message && (
        <p role="alert" className="dialog-error">
          {message}
        </p>
      )}
    </section>
  );
}

type Props = {
  section: DetailsSection;
  /** Set for a metric: where it sits in its semantic model file. Concepts and relationships leave it out. */
  metricPath?: (string | number)[];
  /** The names an item can be replaced by: the items of the same kind. */
  replacementChoices: string[];
};

/** Reads and writes the governance of one item, with the revision question and the permission rules in front of the write. */
export function GovernanceSection({ section, metricPath, replacementChoices }: Props) {
  const access = useCapabilities(section.doc.project);
  const { me } = useMe();
  const { gate, dialog } = useRevisionGate(section.doc);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const itemPath = metricPath ?? section.itemPath;
  const item = itemValue(section.doc.source, itemPath) ?? {};
  const governance = metricPath ? metricGovernanceOf(item) : governanceOf(item);
  const permission = access.control('approveMetric');
  const choices = statusChoices(governance.status, { me, local: access.local, canApprove: !permission.disabled, approveRequirement: permission.title ?? '', owner: governance.owner });
  let readOnlyReason: string | undefined;
  if (section.dirty) readOnlyReason = UNSAVED_SOURCE_NOTE;
  else if (!access.can('edit')) readOnlyReason = access.control('edit').title;
  else if (!metricPath && !ONTOLOGY_GUARDS_ACTIVE) readOnlyReason = 'Editing governance is switched off in this build until its approval rules are active.';

  async function write(edit: GovernanceEdit, raise: (text: string) => string) {
    const plan: GovernancePlan = metricPath
      ? planMetricGovernance(section.doc.source, section.doc.filename, metricPath, edit)
      : planItemGovernance(section.doc.source, section.doc.filename, itemPath, edit, raise);
    if ('refusal' in plan) return setMessage(plan.refusal);
    setSaving(true);
    try {
      section.applySaved(await saveWrites(section.doc.project, [{ doc: section.doc, source: plan.source }]), 'Saved governance.');
      setMessage('');
    } catch (problem) {
      setMessage((problem as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const save = (edit: GovernanceEdit) => (metricPath ? write(edit, text => text) : gate(finish => write(edit, finish)));
  return (
    <>
      <GovernanceSectionView
        key={JSON.stringify(governance)}
        governance={governance}
        readOnlyReason={readOnlyReason}
        choices={choices}
        replacementChoices={replacementChoices}
        showClassification={!metricPath}
        message={message}
        saving={saving}
        onSave={edit => void save(edit)}
      />
      {dialog}
    </>
  );
}
