/** Provides the grouping selector shared by model overview and graph views. */
import { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { modelOverview, GroupingOptions, GroupingMode, ConcreteGroupingMode } from './overview';
import { AdjustGroupingDialog } from './AdjustGroupingDialog';

type Overview = ReturnType<typeof modelOverview>;
type Props = {
  overview: Overview;
  value: GroupingOptions;
  onChange: (next: GroupingOptions) => void;
  error?: string;
};

// Short names for the Auto option, which says which mode Auto would use for this document.
const AUTO_NAMES: Record<ConcreteGroupingMode, string> = {
  declared: 'declared domains',
  example: 'business areas',
  namespaces: 'namespaces',
  suggested: 'related entities',
  types: 'entity types',
};

// The order of the options in the menu; the UBL areas come last because few files offer them.
const MENU: [ConcreteGroupingMode, string][] = [
  ['declared', 'Declared domains'],
  ['namespaces', 'IRI namespaces'],
  ['suggested', 'Suggested communities'],
  ['types', 'Definition types'],
  ['example', 'UBL example areas'],
];

// Places the floating explanation under its button and inside the window.
function usePanelPosition(details: React.RefObject<HTMLDetailsElement | null>, opened: boolean) {
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 0 });
  useLayoutEffect(() => {
    if (!opened) return;
    const place = () => {
      const rect = details.current!.querySelector('summary')!.getBoundingClientRect();
      const width = Math.min(480, window.innerWidth - 20);
      setPosition({
        left: Math.max(10, Math.min(rect.right - width, window.innerWidth - width - 10)),
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

/** Selects how model entities are grouped. Modes with nothing to group are disabled with the
 * reason, and corrections open in their own dialog. */
export function GroupingControls({ overview, value, onChange, error }: Props) {
  const details = useRef<HTMLDetailsElement>(null);
  const [opened, setOpened] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const position = usePanelPosition(details, opened);
  const requested = value.mode ?? 'auto';
  // A stored mode this document cannot use shows as Auto, which is what the views use.
  const shown = requested !== 'auto' && overview.mode !== requested ? 'auto' : requested;

  function chooseMode(event: React.ChangeEvent<HTMLSelectElement>) {
    onChange({ ...value, mode: event.target.value as GroupingMode });
  }

  function openAdjustDialog() {
    details.current?.removeAttribute('open');
    setAdjusting(true);
  }

  return (
    <div className="grouping-controls">
      <label>
        Group by{' '}
        <select aria-label="Group model by" title={overview.explanation} value={shown} onChange={chooseMode}>
          <option value="auto" title={`Currently groups by ${AUTO_NAMES[overview.autoMode]}`}>
            Automatic
          </option>
          {MENU.filter(([mode]) => overview.modes[mode].offered).map(([mode, label]) => {
            const reason = overview.modes[mode].reason;
            return (
              <option key={mode} value={mode} disabled={!!reason} title={reason}>
                {reason ? `${label} (${reason})` : label}
              </option>
            );
          })}
        </select>
      </label>
      <details ref={details} className="grouping-details" onToggle={e => setOpened(e.currentTarget.open)}>
        <summary aria-label="Grouping details" title="Grouping details">
          ⓘ
        </summary>
        <div className="grouping-panel" style={position}>
          <p className="grouping-explanation">
            <strong>{overview.groupingLabel}.</strong> {overview.explanation}
          </p>
          <button type="button" onClick={openAdjustDialog}>
            Adjust grouping…
          </button>
        </div>
      </details>
      {error && <span role="alert">{error}</span>}
      {/* The dialog renders outside the toolbar so the toolbar's compact control styles do not
          apply to its form. */}
      {adjusting && createPortal(<AdjustGroupingDialog overview={overview} value={value} onChange={onChange} onClose={() => setAdjusting(false)} />, document.body)}
    </div>
  );
}
