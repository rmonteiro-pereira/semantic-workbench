/** The width at which the Admin navigation wraps above the section instead of sitting beside it. It must match the phone media query in admin.css. */
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

/** The nearest ancestor that scrolls vertically, which is the Admin layout on a phone. */
function scrollingAncestor(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent && !(parent.scrollHeight > parent.clientHeight && getComputedStyle(parent).overflowY !== 'visible')) parent = parent.parentElement;
  return parent;
}

/**
 * Bringing an element into view, such as an Access check result, can stop with the section heading
 * half under the top edge, which reads as clipped text. The view then moves on to the line after the
 * heading; the element only moves further up, so it stays in view.
 */
export function scrollPastCutHeading(shown: HTMLElement) {
  const heading = shown.closest('.admin-content')?.querySelector<HTMLElement>(':scope > h2');
  const next = heading?.nextElementSibling;
  const scroller = scrollingAncestor(shown);
  if (!heading || !next || !scroller) return;
  const edge = scroller.getBoundingClientRect().top;
  const headingBox = heading.getBoundingClientRect();
  if (headingBox.top >= edge || headingBox.bottom <= edge) return;
  scroller.scrollTop += next.getBoundingClientRect().top - edge;
}
