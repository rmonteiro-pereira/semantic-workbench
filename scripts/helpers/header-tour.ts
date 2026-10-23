// The header and the Examples menu in each state a person reaches, for the responsive suite and
// the screenshot tool.
import { expect, type Page } from '@playwright/test';
import { headerProblems } from './header';
import { showSidebar, type Screen } from './screen-tour';

async function openFirstFile(page: Page, file: string) {
  await showSidebar(page);
  await page.getByRole('button', { name: file, exact: true }).first().click();
  await page.waitForTimeout(500);
  // The graph's loading veil covers the page text for a moment; measure after it has gone.
  await page.locator('.full-graph-loading').waitFor({ state: 'hidden' });
}

async function openExamplesMenu(page: Page) {
  await showSidebar(page);
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await page.getByRole('menu', { name: 'Examples' }).waitFor();
}

/** Lists the header with a file open, its New menu and the sidebar's Examples menu. */
export function headerScreens(file: string): Screen[] {
  return [
    { name: 'header', show: page => openFirstFile(page, file) },
    {
      name: 'header-new-menu',
      dialog: '[role=menu]',
      show: async page => {
        await openFirstFile(page, file);
        await page.getByRole('button', { name: 'New', exact: true }).click();
        await page.getByRole('menu', { name: 'New' }).waitFor();
      },
    },
    { name: 'examples-menu', dialog: '[role=menu]', show: openExamplesMenu },
  ];
}

/** Returns what is wrong with the open menu: outside the window, or outside its panel. */
async function menuProblems(page: Page, panel: string | null): Promise<string[]> {
  return page.evaluate(panelSelector => {
    const problems: string[] = [];
    const menu = document.querySelector('[role=menu]')?.getBoundingClientRect();
    if (!menu) return ['no menu is open'];
    const room = panelSelector
      ? document.querySelector(panelSelector)?.getBoundingClientRect()
      : null;
    const bounds = room ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    if (menu.left < bounds.left - 1 || menu.right > bounds.right + 1) {
      problems.push('the menu sticks out sideways');
    }
    if (menu.top < bounds.top - 1 || menu.bottom > bounds.bottom + 1) {
      problems.push('the menu sticks out at the top or bottom');
    }
    const items = [...document.querySelectorAll('[role=menu] [role=menuitem]')];
    const hidden = items.filter(item => item.getBoundingClientRect().width === 0);
    if (hidden.length) problems.push('a menu item has no size');
    return problems;
  }, panel);
}

/** Returns what is wrong with the header, or with the open menu, on the screen now shown. */
export async function headerScreenProblems(page: Page, screen: Screen): Promise<string[]> {
  const problems = await headerProblems(page);
  if (screen.dialog) {
    const panel = screen.name === 'examples-menu' ? '#workspace-sidebar' : null;
    problems.push(...(await menuProblems(page, panel)));
  }
  return problems.map(problem => `${screen.name}: ${problem}`);
}

/** Drives the Examples menu by keyboard: open, move, wrap, close with focus back, and Tab out. */
export async function examplesKeyboardProblems(page: Page): Promise<void> {
  await showSidebar(page);
  const button = page.getByRole('button', { name: 'Examples', exact: true });
  const items = page.getByRole('menuitem');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Examples' })).toBeVisible();
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(button).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('menu', { name: 'Examples' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(button).not.toBeFocused();
}
