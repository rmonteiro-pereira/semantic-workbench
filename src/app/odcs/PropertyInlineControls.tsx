/** Controls that edit one property attribute in its table row: the logical type and the
 * Required, Unique and Primary key flags. Each change saves at once through the property editor. */
import React, { useEffect, useState } from 'react';
import { LOGICAL_TYPES } from './PropertyEditors';

/** Lets a person pick the logical type; a type outside the standard list stays selectable. */
export function LogicalTypeSelect({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const isStandard = LOGICAL_TYPES.includes(value);
  return (
    <select className="odcs-edit" aria-label={label} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
      {!isStandard && <option value={value}>{value || '—'}</option>}
      {LOGICAL_TYPES.map(type => (
        <option key={type} value={type}>
          {type}
        </option>
      ))}
    </select>
  );
}

/** A checkbox for one flag. It shows the new state at once; the file's value takes over again when
 * the save finishes, so a failed save puts it back. */
export function FlagCheckbox({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => Promise<void> }) {
  const [shown, setShown] = useState(checked);
  useEffect(() => setShown(checked), [checked]);
  function toggle(next: boolean) {
    setShown(next);
    void onChange(next).finally(() => setShown(checked));
  }
  return <input type="checkbox" className="odcs-edit-check" aria-label={label} checked={shown} disabled={disabled} onChange={event => toggle(event.target.checked)} />;
}
