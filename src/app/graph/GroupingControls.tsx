/** The Group menu in the graph toolbar: lists only the ways of grouping that work for the open file. */
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, LayoutGrid } from 'lucide-react';
import { GROUPING_LABELS, usableGroupingModes } from './overview';
import type { modelOverview, GroupingOptions, GroupingMode, ConcreteGroupingMode } from './overview';
import { AdjustGroupingDialog } from './AdjustGroupingDialog';
import { moveFocusWithArrows, useDismiss, useFocusCheckedItem, useMenuPosition } from './toolbar-menu';
import './grouping-menu.css';

type Overview = ReturnType<typeof modelOverview>;
type Props = {
  overview: Overview;
  value: GroupingOptions;
  onChange: (next: GroupingOptions) => void;
  error?: string;
};

// The order of the options in the menu, each with the one-line reason to pick it.
const MENU: [ConcreteGroupingMode, string][] = [
  ['declared', 'Declared in the file'],
  ['namespaces', 'From each definition IRI'],
  ['suggested', 'Found from the links'],
  ['types', 'Concepts, metrics, dimensions'],
];

type ItemProps = { label: string; summary: string; checked: boolean; onChoose: () => void };

function MenuItem({ label, summary, checked, onChoose }: ItemProps) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} className="grouping-item" onClick={onChoose}>
      <span className="grouping-check">{checked && <Check size={16} />}</span>
      <span>
        {label}
        <small>{summary}</small>
      </span>
    </button>
  );
}

/** Selects how model entities are grouped, keeping manual corrections available even without a usable automatic mode. */
export function GroupingControls({ overview, value, onChange, error }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const position = useMenuPosition(button, opened);
  useDismiss(wrapper, opened, () => setOpened(false), button);
  useFocusCheckedItem(menu, opened);
  const usable = usableGroupingModes(overview.modes);
  if (!overview.entities.length) return error ? <span role="alert">{error}</span> : null;

  const requested = value.mode ?? 'auto';
  // A stored mode this document cannot use shows as Automatic, which is what the views use.
  const checkedMode: GroupingMode = requested !== 'auto' && usable.includes(requested) ? requested : 'auto';

  function choose(mode: GroupingMode) {
    setOpened(false);
    onChange({ ...value, mode });
  }

  function openAdjustDialog() {
    setOpened(false);
    setAdjusting(true);
  }

  function summaryWithCount(mode: ConcreteGroupingMode, summary: string) {
    const groups = overview.modes[mode].groups;
    return `${summary} · ${groups} ${groups === 1 ? 'group' : 'groups'}`;
  }

  return (
    <div className="grouping-controls" ref={wrapper}>
      <button
        ref={button}
        type="button"
        className="grouping-trigger"
        aria-haspopup="menu"
        aria-expanded={opened}
        aria-label={`Group by: ${GROUPING_LABELS[overview.mode]}`}
        title={`Group by: ${GROUPING_LABELS[overview.mode]}`}
        onClick={() => setOpened(!opened)}
      >
        <LayoutGrid size={16} />
        {GROUPING_LABELS[overview.mode]}
        <ChevronDown size={14} />
      </button>
      {opened && (
        <div className="grouping-menu" role="menu" aria-label="Group by" style={position} ref={menu} onKeyDown={moveFocusWithArrows}>
          {MENU.filter(([mode]) => usable.includes(mode)).map(([mode, summary]) => (
            <MenuItem key={mode} label={GROUPING_LABELS[mode]} summary={summaryWithCount(mode, summary)} checked={checkedMode === mode} onChoose={() => choose(mode)} />
          ))}
          <MenuItem label="Automatic" summary={`Currently ${GROUPING_LABELS[overview.autoMode]}`} checked={checkedMode === 'auto'} onChoose={() => choose('auto')} />
          <div className="grouping-divider" />
          <p className="grouping-footer">Only ways that work for this file are listed. Automatic picked {GROUPING_LABELS[overview.autoMode]}.</p>
          <button type="button" className="grouping-adjust" onClick={openAdjustDialog}>
            Adjust grouping…
          </button>
        </div>
      )}
      {error && <span role="alert">{error}</span>}
      {/* The dialog renders outside the toolbar so the toolbar's compact control styles do not
          apply to its form. */}
      {adjusting && createPortal(<AdjustGroupingDialog overview={overview} value={value} onChange={onChange} onClose={() => setAdjusting(false)} />, document.body)}
    </div>
  );
}
