/** Persisted width and bounds shared by the sidebar and its resize handle. */
/** Keeps sidebar widths within the supported desktop range. */
export const clampSidebarWidth = (width: number) => Math.max(220, Math.min(520, Math.round(width)));
/** Reads a valid persisted width, or the default width when storage is unavailable. */
export function readSidebarWidth() {
  try {
    const stored = localStorage.getItem('workbench.sidebarWidth');
    const width = Number(stored);
    if (stored?.trim() && Number.isFinite(width)) return clampSidebarWidth(width);
  } catch {}
  return 300;
}
