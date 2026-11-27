/** The width at which the Admin navigation wraps above the section instead of sitting beside it. */
const PHONE_LAYOUT = '(max-width: 760px)';

/** Whether the window is narrow enough for the phone Admin layout; it never is outside a browser. */
export function phoneLayout(): MediaQueryList | null {
  return globalThis.matchMedia?.(PHONE_LAYOUT) ?? null;
}

/**
 * On a phone the wrapped navigation scrolls with the section, so a section or pane can open with
 * its heading half under the top edge or far below it. This brings the section heading to the top;
 * the navigation stays one scroll up. On a wide screen nothing moves.
 */
export function showSectionTop(inside: HTMLElement | null) {
  if (!phoneLayout()?.matches) return;
  inside?.closest('.admin-content')?.scrollIntoView({ block: 'start' });
}
