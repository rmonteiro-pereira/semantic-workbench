/** Presentation and event handling for sidebar resize handle. */
import React from 'react';

type Props = {
  compact: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
  sidebarDrag: React.RefObject<{ pointerId: number; x: number; width: number } | null>;
  setResizingSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  clampSidebarWidth: (width: number) => number;
};
/** Renders sidebar resize handle. */
export function SidebarResizeHandle({
  compact,
  sidebarOpen,
  sidebarWidth,
  sidebarDrag,
  setResizingSidebar,
  setSidebarWidth,
  clampSidebarWidth,
}: Props) {
  function handleSidebarSeparatorPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    sidebarDrag.current = { pointerId: e.pointerId, x: e.clientX, width: sidebarWidth };
    setResizingSidebar(true);
  }

  function handleSidebarSeparatorPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = sidebarDrag.current;
    if (drag?.pointerId === e.pointerId)
      setSidebarWidth(clampSidebarWidth(drag.width + e.clientX - drag.x));
  }

  function handleSidebarSeparatorPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (sidebarDrag.current?.pointerId !== e.pointerId) return;
    sidebarDrag.current = null;
    setResizingSidebar(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function handleSidebarSeparatorPointerCancel() {
    sidebarDrag.current = null;
    setResizingSidebar(false);
  }

  function handleSidebarSeparatorLostPointerCapture() {
    sidebarDrag.current = null;
    setResizingSidebar(false);
  }

  function handleSidebarSeparatorKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    function getWidth() {
      if (e.key === 'Home') {
        return 220;
      }
      if (e.key === 'End') {
        return 520;
      }
      if (e.key === 'ArrowLeft') {
        return sidebarWidth - 16;
      }
      if (e.key === 'ArrowRight') {
        return sidebarWidth + 16;
      }
      return null;
    }

    const width = getWidth();
    if (width !== null) {
      e.preventDefault();
      setSidebarWidth(clampSidebarWidth(width));
    }
  }

  return (
    <>
      {!compact && sidebarOpen && (
        <div
          className="sidebar-separator"
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={220}
          aria-valuemax={520}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={handleSidebarSeparatorPointerDown}
          onPointerMove={handleSidebarSeparatorPointerMove}
          onPointerUp={handleSidebarSeparatorPointerUp}
          onPointerCancel={handleSidebarSeparatorPointerCancel}
          onLostPointerCapture={handleSidebarSeparatorLostPointerCapture}
          onKeyDown={handleSidebarSeparatorKeyDown}
        />
      )}
    </>
  );
}
