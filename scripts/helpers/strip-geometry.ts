// Measures shared navigation strips independently of the screens that use them.
import type { Page } from '@playwright/test';

/**
 * Checks the tab strip: while it scrolls, a cue sits beside each edge that has more tabs, the
 * cues never cover a tab, and the active tab is fully inside the strip.
 */
export async function tabStripProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const strip of document.querySelectorAll<HTMLElement>(
      '.tabs, .odcs-tabs, .admin-nav-list',
    )) {
      const box = strip.getBoundingClientRect();
      const scrolls = strip.scrollWidth > strip.clientWidth + 1;
      const more = (side: 'start' | 'end') => {
        const remaining = strip.scrollWidth - strip.clientWidth - strip.scrollLeft;
        return side === 'start' ? strip.scrollLeft > 1 : remaining > 1;
      };
      for (const side of ['start', 'end'] as const) {
        const sibling = side === 'start' ? strip.previousElementSibling : strip.nextElementSibling;
        const cue = sibling instanceof HTMLElement ? sibling : null;
        const shown = !!cue && !cue.hidden;
        if (shown !== (scrolls && more(side)))
          found.push(`the ${side} cue disagrees with the strip`);
        if (!cue || !shown) continue;
        const cueBox = cue.getBoundingClientRect();
        const overlaps = cueBox.right > box.left + 1 && cueBox.left < box.right - 1;
        if (overlaps) found.push(`the ${side} cue covers the tab strip`);
      }
      for (const tab of strip.querySelectorAll<HTMLElement>(':scope > button, :scope > a')) {
        const bounds = tab.getBoundingClientRect();
        const partial = bounds.left < box.left - 1 || bounds.right > box.right + 1;
        if (partial && getComputedStyle(tab).clipPath !== 'inset(50%)') {
          found.push('a clipped tab label is visible');
        }
      }
      const selected = strip.querySelector<HTMLElement>('.selected');
      if (
        selected &&
        (getComputedStyle(selected).opacity !== '1' ||
          getComputedStyle(selected).clipPath !== 'none')
      ) {
        found.push('the active tab is hidden');
      }
      if (selected && scrolls) {
        const tab = selected.getBoundingClientRect();
        if (tab.left < box.left - 1 || tab.right > box.right + 1) {
          found.push('the active tab is cut by the strip');
        }
      }
    }
    return found;
  });
}
