// Measures an open menu: an opaque surface, fully inside the window, every item reachable.
import type { Page } from '@playwright/test';

/** Returns what is wrong with the menu now open, or says that no menu is open. */
export async function menuSurfaceProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>('[role=menu]');
    if (!menu) return ['no menu is open'];
    const problems: string[] = [];
    const background = getComputedStyle(menu).backgroundColor;
    const channels = background.match(/[\d.]+/g) ?? [];
    const alpha = channels.length > 3 ? Number(channels[3]) : 1;
    if (alpha !== 1) problems.push(`the menu background is not opaque: ${background}`);
    const box = menu.getBoundingClientRect();
    const insideWindow =
      box.left >= 0 &&
      box.top >= 0 &&
      box.right <= window.innerWidth + 1 &&
      box.bottom <= window.innerHeight + 1;
    if (!insideWindow) problems.push('the menu is outside the window');
    for (const item of menu.querySelectorAll<HTMLElement>('[role=menuitem]')) {
      item.scrollIntoView({ block: 'nearest' });
      const rect = item.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const inView = y >= 0 && y <= window.innerHeight && x >= 0 && x <= window.innerWidth;
      const top = document.elementFromPoint(x, y);
      if (!inView || !top || !item.contains(top)) {
        problems.push(`menu item "${item.textContent?.trim()}" is covered or outside the window`);
      }
    }
    return problems;
  });
}
