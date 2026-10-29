/** The secondary controls of a graph toolbar, shown in the toolbar next to the primary ones. */
import React from 'react';
import { Check } from 'lucide-react';

// These controls used to sit in a dialog. That cost a click for every change, covered the graph
// while choosing, and hid which options were on. In the toolbar every state stays visible and a
// change shows its effect at once. The toolbar wraps on a wide window, and on a phone
// CompactControls folds the whole toolbar into one panel, so nothing is cut off.
/** Groups a graph's secondary controls in its toolbar. */
export function GraphOptions({
  title = 'View options',
  intro,
  children,
}: {
  title?: string;
  /** What the view shows, offered as the group's tooltip. */
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <span className="graph-options" role="group" aria-label={title} title={intro}>
      {children}
    </span>
  );
}

/** One group of related controls, separated from its neighbors in the toolbar. */
export function OptionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <span className="option-group" role="group" aria-label={title}>
      {children}
    </span>
  );
}

// "Labels off" read as either a state or an action. The label now names what the switch shows
// and never changes; the check mark and the pressed style say whether it is on. A hidden copy of
// the on state sets the button's width, so both states are as wide and the visible content stays
// centred without a blank slot for the check.
/** A toolbar switch that shows or hides one kind of graph content. */
export function ShowToggle({ on, onToggle, title, children }: { on: boolean; onToggle: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button className="show-toggle" aria-pressed={on} onClick={onToggle} title={title}>
      <span className="show-toggle-face">
        {on && <Check size={13} aria-hidden="true" />}
        {children}
      </span>
      <span className="show-toggle-size" aria-hidden="true">
        <Check size={13} />
        {children}
      </span>
    </button>
  );
}

/** Two or more mutually exclusive choices shown side by side, such as the graph layout. */
export function Segmented<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: { value: Value; label: string; title?: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <span className="segmented" role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button key={option.value} role="radio" aria-checked={option.value === value} title={option.title} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </span>
  );
}
