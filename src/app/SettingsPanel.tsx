/** The sidebar's Settings row and the panel it opens: theme, clearing the workspace and Admin. */
import './SettingsPanel.css';
import { ChevronRight, Settings, Shield, Trash2 } from 'lucide-react';
import React, { useId, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { placeFlyout, placeMenu, type MenuPlacement, type Size } from '../projects/menu-position';
import { popupNaturalSize, useAnchoredPopup, usePopupDismiss } from '../projects/useAnchoredPopup';
import { useAdminEntry } from './admin/admin-entry';
import { ThemeControl } from './ThemeControl';

type Props = {
  /** The sidebar the panel opens beside; without it the panel opens beside the row. */
  sidebar?: RefObject<HTMLElement | null>;
  onClearWorkspace: () => void;
  /** Why Clear workspace is unavailable, or false when it can run. */
  clearDisabled: string | false;
};

/** Leaves this much room between the sidebar's edge and the panel beside it. */
const SIDEBAR_GAP = 8;

/** Opens beside the sidebar on a wide window and above the row in the phone drawer. */
function placePanel(
  panel: HTMLElement,
  anchor: DOMRect,
  viewport: Size,
  sidebar: HTMLElement | null,
): MenuPlacement {
  const size = popupNaturalSize(panel);
  // The panel starts past the sidebar's border, not over it, level with the Settings row.
  const sidebarRight = sidebar?.getBoundingClientRect().right ?? anchor.right;
  const besideSidebar = { ...anchor.toJSON(), right: sidebarRight + SIDEBAR_GAP };
  const beside = placeFlyout(besideSidebar, size, viewport);
  if (beside) return beside;
  return placeMenu(anchor, size, viewport, { side: 'above', align: 'start' });
}

/** The controls Tab moves between inside the panel. */
const PANEL_CONTROLS = 'button:not(:disabled), input:not(:disabled), select:not(:disabled)';

/** True when Tab would move focus past the panel's first or last control. */
function tabLeavesPanel(panel: HTMLElement, event: React.KeyboardEvent): boolean {
  const controls = [...panel.querySelectorAll<HTMLElement>(PANEL_CONTROLS)];
  const edge = event.shiftKey ? controls[0] : controls.at(-1);
  return document.activeElement === edge;
}

/** Renders the Settings row; its panel holds controls, so it is a dialog rather than a menu. */
export function SettingsPanel({ sidebar, onClearWorkspace, clearDisabled }: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const openAdmin = useAdminEntry();
  function placeBesideSidebar(popup: HTMLElement, anchor: DOMRect, viewport: Size) {
    return placePanel(popup, anchor, viewport, sidebar?.current ?? null);
  }
  useAnchoredPopup(open, { popup: panel, anchor: button }, placeBesideSidebar, []);
  usePopupDismiss(open, { popup: panel, anchor: button }, PANEL_CONTROLS, () => setOpen(false));

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function handlePanelKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    // The panel sits at the end of the page, outside the phone drawer's focus trap, so Tab past its
    // edge would leave the sidebar behind. It returns to the Settings row instead, like Escape.
    if (event.key === 'Tab' && panel.current && tabLeavesPanel(panel.current, event)) {
      event.preventDefault();
      close();
    }
  }

  function runAndClose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <>
      <button
        ref={button}
        className="nav sidebar-row settings-toggle"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? 'settings-panel' : undefined}
        onClick={() => setOpen(isOpen => !isOpen)}
      >
        <Settings size={16} /> Settings
      </button>
      {open &&
        createPortal(
          <section
            id="settings-panel"
            ref={panel}
            className="settings-panel"
            role="dialog"
            aria-label="Settings"
            onKeyDown={handlePanelKeyDown}
          >
            <SettingsSections
              clearDisabled={clearDisabled}
              onClearWorkspace={() => runAndClose(onClearWorkspace)}
              onOpenAdmin={openAdmin && (() => runAndClose(openAdmin))}
            />
          </section>,
          document.body,
        )}
    </>
  );
}

type SectionsProps = {
  clearDisabled: string | false;
  onClearWorkspace: () => void;
  /** Opens Admin, or is missing when this person may not administer the workspace. */
  onOpenAdmin: (() => void) | null;
};

/** The panel's sections, each under its own heading. */
function SettingsSections({ clearDisabled, onClearWorkspace, onOpenAdmin }: SectionsProps) {
  return (
    <>
      <h2>Appearance</h2>
      <ThemeControl />
      <h2>Workspace</h2>
      <SettingsAction
        icon={<Trash2 size={16} />}
        name="Clear workspace"
        detail={clearDisabled || 'Moves every project to Trash'}
        danger
        disabled={clearDisabled !== false}
        onClick={onClearWorkspace}
      />
      {onOpenAdmin && (
        <>
          <h2>Administration</h2>
          <SettingsAction
            icon={<Shield size={16} />}
            name="Admin"
            detail="People, roles, permissions and Git remotes"
            opensPage
            onClick={onOpenAdmin}
          />
        </>
      )}
    </>
  );
}

type ActionProps = {
  icon: React.ReactNode;
  name: string;
  detail: string;
  danger?: boolean;
  disabled?: boolean;
  /** Draws an arrow, for an action that leaves the workspace for another page. */
  opensPage?: boolean;
  onClick: () => void;
};

/** One action row: an icon tile, the action's name and a line saying what it does. */
function SettingsAction({ icon, name, detail, danger, disabled, opensPage, onClick }: ActionProps) {
  const id = useId();
  return (
    <button
      type="button"
      className={`settings-action${danger ? ' settings-action-destructive' : ''}`}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-detail`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="settings-tile">{icon}</span>
      <span className="settings-text">
        <span id={`${id}-name`}>{name}</span>
        <small id={`${id}-detail`}>{detail}</small>
      </span>
      {opensPage && <ChevronRight size={16} className="settings-arrow" aria-hidden="true" />}
    </button>
  );
}
