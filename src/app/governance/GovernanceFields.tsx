/** The fields of a governance entry: status, owner, steward, classification and the deprecation details. */
import React from 'react';
import type { GovernanceEdit } from '../../shared/governance/item-governance';
import type { StatusChoice } from './status-choices';
import '../edit/edit.css';

type Props = {
  values: GovernanceEdit;
  onChange: (field: keyof GovernanceEdit, value: string) => void;
  choices: StatusChoice[];
  replacementChoices: string[];
  showClassification: boolean;
  disabled: boolean;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** Renders the form controls. The deprecation fields appear only for a deprecated item. */
export function GovernanceFields({ values, onChange, choices, replacementChoices, showClassification, disabled }: Props) {
  const text = (field: keyof GovernanceEdit) => ({
    value: values[field] ?? '',
    disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(field, event.target.value),
  });
  const blocked = choices.filter(choice => choice.disabled && choice.reason);
  return (
    <div className="item-fields governance-fields">
      <Field label="Status" hint={blocked.map(choice => `${choice.label}: ${choice.reason}`).join(' ')}>
        <select {...text('status')}>
          {choices.map(choice => (
            <option key={choice.value} value={choice.value} disabled={choice.disabled}>
              {choice.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Owner">
        <input {...text('owner')} />
      </Field>
      <Field label="Steward">
        <input {...text('steward')} />
      </Field>
      {showClassification && (
        <Field label="Classification" hint="A declaration of how sensitive this item is. It does not limit who can read it.">
          <input {...text('classification')} />
        </Field>
      )}
      {values.status === 'deprecated' && (
        <>
          <Field label="Replaced by">
            <select {...text('replacedBy')}>
              <option value="">Nothing named</option>
              {replacementChoices.map(name => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Reason for deprecating">
            <textarea rows={2} {...text('deprecationReason')} spellCheck />
          </Field>
        </>
      )}
    </div>
  );
}
