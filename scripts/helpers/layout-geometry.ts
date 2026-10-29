// Measures browser layout problems in screen coordinates so checks work at any zoom.
import type { Page } from '@playwright/test';
// Scrollable controls count as reachable, but clipped controls and overlapping overlays do not.
// Failures identify the affected control and location.
/** Returns visible control clipping, scrolling and overlay problems for the page. */
export async function layoutProblems(page: Page, options: { overlays?: string[]; ignore?: string } = {}): Promise<string[]> {
  return page.evaluate(
    ({ overlays, ignore }) => {
      const out: string[] = [];
      const vw = innerWidth;
      const vh = innerHeight;
      const doc = document.documentElement;
      if (doc.scrollWidth > vw + 1) out.push(`page scrolls horizontally (${doc.scrollWidth} > ${vw})`);
      const name = (el: Element) => {
        const label = el.getAttribute('aria-label') || (el as HTMLElement).innerText?.trim().split('\n')[0] || el.getAttribute('placeholder') || '';
        const firstClass = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '';
        return `${el.tagName.toLowerCase()}${firstClass} "${label.slice(0, 40)}"`;
      };
      const shown = (el: Element) => {
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width >= 1 && rect.height >= 1;
      };
      // Content of a closed <details> keeps layout boxes in Chromium but is not shown. The React
      // Flow attribution link is a credit, not a working control, so an overlay may cover it.
      const skip =
        'details:not([open]) > :not(summary),details:not([open]) > :not(summary) *,[inert] *,.react-flow__node *,.react-flow__node,.react-flow__edge,.react-flow__minimap *,.cm-editor *,[aria-hidden="true"] *,.sr-only,.react-flow__attribution a' +
        (ignore ? ',' + ignore : '');
      // In full screen only the full-screen element (or the window-filling one) is on screen.
      const scope: ParentNode = document.fullscreenElement ?? document.querySelector('.window-fill') ?? document;
      const controls = [...scope.querySelectorAll('button,input:not([type=file]):not([type=hidden]),select,textarea,[role=tab],a[href]')].filter(el => shown(el) && !el.matches(skip));
      const scrolls = (s: CSSStyleDeclaration, axis: 'x' | 'y') => /(auto|scroll)/.test(axis === 'x' ? s.overflowX : s.overflowY);
      for (const el of controls) {
        const rect = el.getBoundingClientRect();
        let reachableX = false;
        let reachableY = false;
        let clipped = '';
        for (let ancestor = el.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (scrolls(style, 'x')) reachableX = true;
          if (scrolls(style, 'y')) reachableY = true;
          const clipX = !reachableX && /(hidden|clip)/.test(style.overflowX);
          const clipY = !reachableY && /(hidden|clip)/.test(style.overflowY);
          if (clipX || clipY) {
            const ancestorRect = ancestor.getBoundingClientRect();
            const outX = clipX && (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1);
            const outY = clipY && (rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1);
            const inside = rect.right > ancestorRect.left && rect.left < ancestorRect.right && rect.bottom > ancestorRect.top && rect.top < ancestorRect.bottom;
            if ((outX || outY) && inside) {
              clipped = `cut off by ${name(ancestor)}`;
              break;
            }
            if (!inside) {
              clipped = 'hidden';
              break;
            }
          }
          // A full-screen or fixed element escapes the clipping of its ancestors.
          if (ancestor === document.fullscreenElement || style.position === 'fixed') break;
        }
        if (clipped === 'hidden') continue;
        if (clipped) {
          out.push(`${name(el)} ${clipped}`);
          continue;
        }
        if (!reachableX && (rect.left < -1 || rect.right > vw + 1)) out.push(`${name(el)} outside the viewport horizontally (${Math.round(rect.left)}–${Math.round(rect.right)} of ${vw})`);
        if (!reachableY && rect.top < vh && rect.bottom > vh + 1 && getComputedStyle(el).position !== 'fixed') out.push(`${name(el)} cut off at the bottom of the viewport`);
      }
      // Floating overlays must not cover each other or any visible control outside themselves.
      const boxes = (overlays ?? []).flatMap(sel => [...document.querySelectorAll(sel)].filter(shown).map(el => ({ sel, el, r: el.getBoundingClientRect() })));
      const hit = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const firstOverlay = boxes[i];
          const secondOverlay = boxes[j];
          if (firstOverlay.el.contains(secondOverlay.el) || secondOverlay.el.contains(firstOverlay.el)) continue;
          if (hit(firstOverlay.r, secondOverlay.r)) out.push(`overlay ${firstOverlay.sel} overlaps ${secondOverlay.sel}`);
        }
      // The part of a control its scrolling or clipping ancestors actually show (a toolbar strip
      // scrolled sideways hides part of its buttons; the hidden part cannot be covered).
      const shownRect = (el: Element) => {
        let rect = el.getBoundingClientRect();
        let left = rect.left;
        let top = rect.top;
        let right = rect.right;
        let bottom = rect.bottom;
        for (let ancestor = el.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
            const ancestorRect = ancestor.getBoundingClientRect();
            left = Math.max(left, ancestorRect.left);
            top = Math.max(top, ancestorRect.top);
            right = Math.min(right, ancestorRect.right);
            bottom = Math.min(bottom, ancestorRect.bottom);
          }
          if (style.position === 'fixed') break;
        }
        return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
      };
      for (const overlay of boxes)
        for (const el of controls) {
          if (overlay.el.contains(el) || el.contains(overlay.el)) continue;
          const rect = shownRect(el);
          if (rect.width < 1 || rect.height < 1) continue;
          if (hit(overlay.r, rect)) {
            // Covered only if the overlay is drawn above the control at the overlap's centre.
            const x = (Math.max(overlay.r.left, rect.left) + Math.min(overlay.r.right, rect.right)) / 2;
            const y = (Math.max(overlay.r.top, rect.top) + Math.min(overlay.r.bottom, rect.bottom)) / 2;
            const top = document.elementFromPoint(x, y);
            if (top && overlay.el.contains(top) && !el.contains(top)) out.push(`overlay ${overlay.sel} covers ${name(el)}`);
          }
        }
      return [...new Set(out)];
    },
    { overlays: options.overlays ?? [], ignore: options.ignore ?? '' },
  );
}
// Rows and controls must fit their cards without overlaps. Truncated names need titles, and the
// canvas must remain usable beside the path panel.
/** Returns card, row and toolbar layout problems measured in screen coordinates. */
export async function lineageProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const hit = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const inside = (inner: DOMRect, outer: DOMRect) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
    const view = document.querySelector('.lineage-view');
    if (!view) return ['no lineage canvas'];
    const cards = [...view.querySelectorAll('.lineage-card')];
    for (const card of cards) {
      const cardRect = card.getBoundingClientRect();
      const label = card.getAttribute('aria-label');
      for (const el of card.querySelectorAll('.lineage-card-head > *, .lineage-card-marks > *, .lineage-rows li, .lineage-row > *, .property-badge, .lineage-list-foot > *, .lineage-more-button')) {
        const childRect = el.getBoundingClientRect();
        if (childRect.width < 1) continue;
        if (!inside(childRect, cardRect)) out.push(`${label}: ${el.className || el.tagName} "${(el.textContent ?? '').slice(0, 30)}" sticks out of the card`);
      }
      for (const el of card.querySelectorAll('.lineage-row-name, .lineage-card-title strong')) {
        const element = el as HTMLElement;
        if (element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).textOverflow !== 'ellipsis') out.push(`${label}: "${element.textContent}" is cut without an ellipsis`);
      }
      // Badges in a row never overlap the column name.
      for (const row of card.querySelectorAll('.lineage-row')) {
        const nameRect = row.querySelector('.lineage-row-name')?.getBoundingClientRect();
        if (!nameRect) continue;
        for (const badge of row.querySelectorAll('.property-badge'))
          if (hit(nameRect, badge.getBoundingClientRect())) out.push(`${label}: badge "${badge.textContent}" overlaps "${row.querySelector('.lineage-row-name')!.textContent}"`);
      }
    }
    // Header marks (Unmapped badge, finding markers) never overlap the title or the actions.
    for (const card of cards) {
      const titleRect = card.querySelector('.lineage-card-title strong')?.getBoundingClientRect();
      const marksRect = card.querySelector('.lineage-card-marks')?.getBoundingClientRect();
      const actionsRect = card.querySelector('.lineage-card-actions')?.getBoundingClientRect();
      if (titleRect && marksRect && marksRect.width > 0 && hit(titleRect, marksRect)) out.push(`${card.getAttribute('aria-label')}: header badges overlap the title`);
      if (actionsRect && marksRect && marksRect.width > 0 && actionsRect.width > 0 && hit(actionsRect, marksRect)) out.push(`${card.getAttribute('aria-label')}: header badges overlap the actions`);
    }
    for (let i = 0; i < cards.length; i++)
      for (let j = i + 1; j < cards.length; j++)
        if (hit(cards[i].getBoundingClientRect(), cards[j].getBoundingClientRect())) out.push(`cards "${cards[i].getAttribute('aria-label')}" and "${cards[j].getAttribute('aria-label')}" overlap`);
    const tools = [...view.querySelectorAll('.lineage-toolbar > *, .lineage-trail > button')].filter(e => e.getBoundingClientRect().width > 0);
    for (let i = 0; i < tools.length; i++)
      for (let j = i + 1; j < tools.length; j++)
        if (hit(tools[i].getBoundingClientRect(), tools[j].getBoundingClientRect()))
          out.push(`toolbar controls "${tools[i].textContent || tools[i].getAttribute('aria-label')}" and "${tools[j].textContent || tools[j].getAttribute('aria-label')}" overlap`);
    const flow = view.querySelector('.lineage-flow')?.getBoundingClientRect();
    if (flow && (flow.width < Math.min(300, innerWidth - 40) || flow.height < 240)) out.push(`the canvas is only ${Math.round(flow.width)}×${Math.round(flow.height)}`);
    const panel = view.querySelector('.lineage-path')?.getBoundingClientRect();
    if (panel && flow && hit(panel, flow)) out.push('the Selected path panel covers the canvas');
    const foot = view.querySelector('.lineage-foot');
    if (foot && (foot as HTMLElement).scrollWidth > (foot as HTMLElement).clientWidth + 1) out.push('the legend footer overflows');
    return out;
  });
}
