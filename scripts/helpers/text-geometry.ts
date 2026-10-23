// Measures text legibility and text collisions in screen coordinates, at any viewport size.
import type { Page } from '@playwright/test';

/** The smallest text size, in CSS pixels, the interface may show. */
export const MIN_TEXT_PX = 12;

// Graph nodes and edge labels are scaled by the canvas zoom, and the code editor has its own
// type scale, so neither counts as interface text.
const NOT_INTERFACE_TEXT =
  'details:not([open]) > :not(summary),details:not([open]) > :not(summary) *,[inert] *,.react-flow__node,.react-flow__node *,.react-flow__edge,.react-flow__edge *,.react-flow__minimap,.react-flow__minimap *,.cm-editor,.cm-editor *,.sr-only,.react-flow__attribution,.react-flow__attribution *,[aria-hidden="true"],[aria-hidden="true"] *,svg,svg *';

/** Returns visible text, inside the `within` element, whose size is below the minimum. */
export async function smallTextProblems(page: Page, within = 'body'): Promise<string[]> {
  return page.evaluate(
    ({ minimum, skip, root }) => {
      const problems = new Map<string, number>();
      const walker = document.createTreeWalker(
        document.querySelector(root) ?? document.body,
        NodeFilter.SHOW_TEXT,
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const element = node.parentElement;
        if (!element || element.matches(skip)) continue;
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const box = element.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;
        const size = parseFloat(style.fontSize);
        if (size === 0 || size >= minimum) continue;
        const name = `${element.tagName.toLowerCase()}.${String(element.className).split(/\s+/)[0]}`;
        problems.set(`${name} "${node.textContent.trim().slice(0, 30)}" is ${size}px`, size);
      }
      return [...problems.keys()];
    },
    { minimum: MIN_TEXT_PX, skip: NOT_INTERFACE_TEXT, root: within },
  );
}

/** Returns text, inside the `within` element, that is covered or overlaps other text. */
export async function textCollisionProblems(page: Page, within = 'body'): Promise<string[]> {
  return page.evaluate(
    ({ skip, root }) => {
      type Run = { element: Element; rect: DOMRect; label: string };
      const runs: Run[] = [];
      const walker = document.createTreeWalker(
        document.querySelector(root) ?? document.body,
        NodeFilter.SHOW_TEXT,
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const label = node.textContent?.trim();
        const element = node.parentElement;
        if (!label || !element || element.matches(skip)) continue;
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        if (Number(style.opacity) === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        if (rect.right < 0 || rect.bottom < 0 || rect.left > innerWidth || rect.top > innerHeight)
          continue;
        runs.push({ element, rect, label: label.slice(0, 30) });
      }
      // The area of a text run that its scrolling or clipping ancestors actually show.
      const visibleRect = (run: Run) => {
        let { left, top, right, bottom } = run.rect;
        for (let p = run.element; p && p !== document.body; p = p.parentElement as Element) {
          const s = getComputedStyle(p);
          if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
            const q = p.getBoundingClientRect();
            left = Math.max(left, q.left);
            top = Math.max(top, q.top);
            right = Math.min(right, q.right);
            bottom = Math.min(bottom, q.bottom);
          }
          if (s.position === 'fixed') break;
        }
        return { left, top, right, bottom, width: right - left, height: bottom - top };
      };
      const found = new Set<string>();
      const shown = runs.map(run => ({ run, area: visibleRect(run) }));
      for (const { run, area } of shown) {
        if (area.width < 2 || area.height < 2) continue;
        // Something else on top at the middle of the text covers it.
        const x = (area.left + area.right) / 2;
        const y = (area.top + area.bottom) / 2;
        const top = document.elementFromPoint(x, y);
        if (top && !run.element.contains(top) && !top.contains(run.element))
          found.add(
            `"${run.label}" is covered by ${top.tagName.toLowerCase()}.${String(top.className).split(/\s+/)[0]}`,
          );
      }
      for (let i = 0; i < shown.length; i++)
        for (let j = i + 1; j < shown.length; j++) {
          const a = shown[i];
          const b = shown[j];
          if (a.run.element === b.run.element) continue;
          if (a.run.element.contains(b.run.element) && a.run.element.children.length === 0)
            continue;
          const width = Math.min(a.area.right, b.area.right) - Math.max(a.area.left, b.area.left);
          const height = Math.min(a.area.bottom, b.area.bottom) - Math.max(a.area.top, b.area.top);
          if (width > 2 && height > 3) found.add(`"${a.run.label}" overlaps "${b.run.label}"`);
        }
      return [...found];
    },
    { skip: NOT_INTERFACE_TEXT, root: within },
  );
}
