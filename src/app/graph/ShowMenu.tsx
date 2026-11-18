/** The Show menu of the graph toolbars: one button that switches each kind of graph content on or off. */
import { useRef, useState } from 'react';
import { Check, ChevronDown, Eye } from 'lucide-react';
import { moveFocusWithArrows, useDismiss, useFocusCheckedItem, useMenuPosition } from './toolbar-menu';
import './grouping-menu.css';

/** One kind of content the menu shows or hides. */
export type ShowItem = { name: string; summary: string; on: boolean; onToggle: () => void };

// These switches used to sit side by side in the toolbar, which pushed the toolbar onto another
// row each time one was added. The button names every switch that is on, so the state stays
// visible without opening the menu. The menu stays open while choosing, as a list of check boxes.
/** Lists the kinds of content a graph can show, each with a one-line reason to switch it on. */
export function ShowMenu({ items }: { items: (ShowItem | null)[] }) {
  const wrapper = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false);
  const position = useMenuPosition(button, opened);
  useDismiss(wrapper, opened, () => setOpened(false), button);
  useFocusCheckedItem(menu, opened);
  const shown = items.filter((item): item is ShowItem => item !== null);
  if (!shown.length) return null;
  const onNames = shown.filter(item => item.on).map(item => item.name);
  const label = onNames.length ? `Show: ${onNames.join(', ')}` : 'Show';

  return (
    <span className="show-menu" ref={wrapper}>
      <button ref={button} type="button" className="show-menu-trigger" aria-haspopup="menu" aria-expanded={opened} aria-label={label} onClick={() => setOpened(!opened)}>
        <Eye size={15} aria-hidden="true" />
        Show
        {onNames.length > 0 && <span className="show-menu-on">{onNames.join(', ')}</span>}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {opened && (
        <div className="grouping-menu" role="menu" aria-label="Show" style={position} ref={menu} onKeyDown={moveFocusWithArrows}>
          {shown.map(item => (
            <ShowMenuItem key={item.name} item={item} />
          ))}
        </div>
      )}
    </span>
  );
}

function ShowMenuItem({ item }: { item: ShowItem }) {
  const summaryId = `show-menu-${item.name.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={item.on} aria-label={item.name} aria-describedby={summaryId} className="grouping-item" onClick={item.onToggle}>
      <span className="grouping-check">{item.on && <Check size={16} />}</span>
      <span>
        {item.name}
        <small id={summaryId}>{item.summary}</small>
      </span>
    </button>
  );
}
