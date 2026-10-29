/** The Group menu in the graph toolbar: lists only the ways of grouping that work for the open file. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LayoutGrid } from 'lucide-react';
import { GROUPING_LABELS, usableGroupingModes } from './overview';
import type { modelOverview, GroupingOptions, GroupingMode, ConcreteGroupingMode } from './overview';
import { AdjustGroupingDialog } from './AdjustGroupingDialog';
import { MenuButton, type MenuItem } from '../projects/Menu';
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

/** Selects how model entities are grouped. A file with fewer than two usable ways to group shows
 * no control at all; the Overview chip says how it is grouped. */
export function GroupingControls({ overview, value, onChange, error }: Props) {
  const [adjusting, setAdjusting] = useState(false);
  const usable = usableGroupingModes(overview.modes);
  if (usable.length < 2) return error ? <span role="alert">{error}</span> : null;

  const requested = value.mode ?? 'auto';
  // A stored mode this document cannot use shows as Automatic, which is what the views use.
  const checkedMode: GroupingMode = requested !== 'auto' && usable.includes(requested) ? requested : 'auto';

  function summaryWithCount(mode: ConcreteGroupingMode, summary: string) {
    const groups = overview.modes[mode].groups;
    return `${summary} · ${groups} ${groups === 1 ? 'group' : 'groups'}`;
  }

  function choice(mode: GroupingMode, label: string, detail: string): MenuItem {
    return { label, detail, checked: checkedMode === mode, run: () => onChange({ ...value, mode }) };
  }

  const items: MenuItem[] = [
    ...MENU.filter(([mode]) => usable.includes(mode)).map(([mode, summary]) => choice(mode, GROUPING_LABELS[mode], summaryWithCount(mode, summary))),
    choice('auto', 'Automatic', `Currently ${GROUPING_LABELS[overview.autoMode]}`),
    { label: 'Adjust grouping…', separatorBefore: true, run: () => setAdjusting(true) },
  ];

  return (
    <div className="grouping-controls">
      <MenuButton
        ariaLabel={`Group: ${GROUPING_LABELS[overview.mode]}`}
        menuLabel="Group by"
        buttonClassName="grouping-trigger"
        align="start"
        icon={<LayoutGrid size={16} />}
        label={
          <>
            Group: {GROUPING_LABELS[overview.mode]}
            <ChevronDown size={14} />
          </>
        }
        items={items}
      />
      {error && <span role="alert">{error}</span>}
      {/* The dialog renders outside the toolbar so the toolbar's compact control styles do not
          apply to its form. */}
      {adjusting && createPortal(<AdjustGroupingDialog overview={overview} value={value} onChange={onChange} onClose={() => setAdjusting(false)} />, document.body)}
    </div>
  );
}
