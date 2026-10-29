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
export const SidebarResizeHandle = React.memo(function SidebarResizeHandle({ compact, sidebarOpen, sidebarWidth, sidebarDrag, setResizingSidebar, setSidebarWidth, clampSidebarWidth }: Props) {
  function handleSidebarSeparatorPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    sidebarDrag.current = { pointerId: event.pointerId, x: event.clientX, width: sidebarWidth };
    setResizingSidebar(true);
  }

  function handleSidebarSeparatorPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = sidebarDrag.current;
    if (drag?.pointerId === event.pointerId) setSidebarWidth(clampSidebarWidth(drag.width + event.clientX - drag.x));
  }

  function handleSidebarSeparatorPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (sidebarDrag.current?.pointerId !== event.pointerId) return;
    sidebarDrag.current = null;
    setResizingSidebar(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleSidebarSeparatorPointerCancel() {
    sidebarDrag.current = null;
    setResizingSidebar(false);
  }

  function handleSidebarSeparatorLostPointerCapture() {
    sidebarDrag.current = null;
    setResizingSidebar(false);
  }

  function handleSidebarSeparatorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    function getWidth() {
      if (event.key === 'Home') {
        return 220;
      }
      if (event.key === 'End') {
        return 520;
      }
      if (event.key === 'ArrowLeft') {
        return sidebarWidth - 16;
      }
      if (event.key === 'ArrowRight') {
        return sidebarWidth + 16;
      }
      return null;
    }

    const width = getWidth();
    if (width !== null) {
      event.preventDefault();
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
});
