/** The Group menu in the graph toolbar: lists only the ways of grouping that work for the open file. */
import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, LayoutGrid } from 'lucide-react';
import { GROUPING_LABELS, usableGroupingModes } from './overview';
import type { modelOverview, GroupingOptions, GroupingMode, ConcreteGroupingMode } from './overview';
import { AdjustGroupingDialog } from './AdjustGroupingDialog';
import './grouping-menu.css';

type Overview = ReturnType<typeof modelOverview>;
type Props = {
  overview: Overview;
  value: GroupingOptions;
  onChange: (next: GroupingOptions) => void;
  error?: string;
};

// The order of the options in the menu, each with the one-line reason to pick it. The UBL areas
// come last because few files offer them.
const MENU: [ConcreteGroupingMode, string][] = [
  ['declared', 'Declared in the file'],
  ['namespaces', 'From each definition IRI'],
  ['suggested', 'Found from the links'],
  ['types', 'Concepts, metrics, dimensions'],
  ['example', 'Curated UBL areas'],
];

// Places the menu under its button and inside the window.
function useMenuPosition(button: React.RefObject<HTMLButtonElement | null>, opened: boolean) {
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 0 });
  useLayoutEffect(() => {
    if (!opened) return;
    const place = () => {
      const rect = button.current!.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 20);
      setPosition({
        left: Math.max(10, Math.min(rect.left, window.innerWidth - width - 10)),
        top: rect.bottom + 4,
        maxHeight: Math.max(0, window.innerHeight - rect.bottom - 14),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [opened]);
  return position;
}

// Closes the menu on Escape or on a click anywhere outside it.
function useDismiss(container: React.RefObject<HTMLElement | null>, opened: boolean, close: () => void) {
  useEffect(() => {
    if (!opened) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [opened]);
}

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

/** Selects how model entities are grouped. A file with fewer than two usable ways to group shows
 * no control at all; the Overview chip says how it is grouped. */
export function GroupingControls({ overview, value, onChange, error }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const position = useMenuPosition(button, opened);
  useDismiss(wrapper, opened, () => setOpened(false));
  const usable = usableGroupingModes(overview.modes);
  if (usable.length < 2) return error ? <span role="alert">{error}</span> : null;

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
      <button ref={button} type="button" className="grouping-trigger" aria-haspopup="menu" aria-expanded={opened} onClick={() => setOpened(!opened)}>
        <LayoutGrid size={16} />
        Group: {GROUPING_LABELS[overview.mode]}
        <ChevronDown size={14} />
      </button>
      {opened && (
        <div className="grouping-menu" role="menu" aria-label="Group by" style={position}>
          {MENU.filter(([mode]) => usable.includes(mode)).map(([mode, summary]) => (
            <MenuItem key={mode} label={GROUPING_LABELS[mode]} summary={summaryWithCount(mode, summary)} checked={checkedMode === mode} onChoose={() => choose(mode)} />
          ))}
          <MenuItem label="Automatic" summary={`Currently ${GROUPING_LABELS[overview.autoMode]}`} checked={checkedMode === 'auto'} onChoose={() => choose('auto')} />
          <div className="grouping-divider" />
          <p className="grouping-footer">Only ways that work for this file are listed. Automatic picked {GROUPING_LABELS[overview.autoMode]}.</p>
          <button type="button" className="grouping-adjust" onClick={openAdjustDialog}>
            Adjust grouping
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
