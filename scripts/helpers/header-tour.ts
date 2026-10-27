// The header and the Examples menu in each state a person reaches, for the responsive suite and
// the screenshot tool.
import { expect, type Page } from '@playwright/test';
import { leaveAdminPage } from './admin-tour';
import { chooseMoreAction, exportFile, headerProblems, openNewMenu } from './header';
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
  const screens: Screen[] = [
    { name: 'header', show: page => openFirstFile(page, file) },
    {
      name: 'header-new-menu',
      dialog: '[role=menu]',
      show: async page => {
        await openFirstFile(page, file);
        await openNewMenu(page);
        await page.getByRole('menu', { name: 'New' }).waitFor();
      },
    },
    { name: 'examples-menu', dialog: '[role=menu]', show: openExamplesMenu },
  ];
  return screens;
}

/** The header's height and the box of each of its controls, rounded to whole pixels. */
export async function headerGeometry(page: Page): Promise<{ height: number; controls: string[] }> {
  return page.evaluate(() => {
    const header = document.querySelector('.workspace-header')!;
    const round = (value: number) => Math.round(value);
    const controls = [...header.querySelectorAll('button')].map(control => {
      const box = control.getBoundingClientRect();
      const name = control.getAttribute('aria-label') ?? control.textContent?.trim();
      return `${name}@${round(box.left)},${round(box.top)},${round(box.width)},${round(box.height)}`;
    });
    return { height: round(header.getBoundingClientRect().height), controls };
  });
}

/** Returns what is wrong with the phone header's single row and its title. */
export async function phoneRowProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const header = document.querySelector('.workspace-header')!;
    const toggle = header.querySelector('.workspace-toggle')!.getBoundingClientRect();
    const rowCentre = toggle.top + toggle.height / 2;
    for (const control of header.querySelectorAll('button')) {
      const box = control.getBoundingClientRect();
      const name = control.getAttribute('aria-label') ?? control.textContent?.trim();
      const offset = Math.abs(box.top + box.height / 2 - rowCentre);
      if (offset > 1.5) problems.push(`${name} is not on the header's only row`);
    }
    const title = header.querySelector('h1')!;
    if (title.getBoundingClientRect().width < 120) problems.push('the title has no room');
    if (title.getBoundingClientRect().height > 24) problems.push('the title wraps');
    if (!title.getAttribute('title')) problems.push('the title has no tooltip with its full text');
    const missing = ['Save state', 'Commit…', 'More actions'].filter(
      name => !header.querySelector(`button[aria-label="${name}"]`),
    );
    problems.push(...missing.map(name => `${name} is missing from the phone header`));
    const wide = ['New', 'Export', 'Admin'].filter(name =>
      [...header.querySelectorAll('button')].some(button => button.textContent?.trim() === name),
    );
    problems.push(...wide.map(name => `${name} still sits in the phone header`));
    return problems;
  });
}

/** Checks the More actions menu: full-width rows with icons, a divider before Admin, all working. */
export async function moreActionsProblems(page: Page): Promise<string[]> {
  const problems: string[] = [];
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'More actions' });
  await menu.waitFor();
  const rows = await menu.getByRole('menuitem').evaluateAll(items =>
    items.map(item => ({
      name: item.textContent?.trim() ?? '',
      width: item.getBoundingClientRect().width,
      hasIcon: !!item.querySelector('svg'),
    })),
  );
  const names = rows.map(row => row.name);
  if (names.join('|') !== 'New|Export|Admin') problems.push(`More actions lists ${names}`);
  const menuWidth = (await menu.boundingBox())?.width ?? 0;
  for (const row of rows) {
    if (!row.hasIcon) problems.push(`${row.name} has no icon in the menu`);
    if (row.width < menuWidth - 16) problems.push(`${row.name} is not a full-width row`);
  }
  const separators = await menu.getByRole('separator').count();
  if (separators !== 1) problems.push(`the menu has ${separators} dividers, not one before Admin`);
  await page.keyboard.press('Escape');
  return problems;
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
    // Beside the sidebar on a wide window, the Examples menu is checked against the window; on a
    // phone it stays inside the drawer.
    const isPhone = (page.viewportSize()?.width ?? 0) <= 650;
    const panel = screen.name === 'examples-menu' && isPhone ? '#workspace-sidebar' : null;
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

/** Opens the Examples menu and lists where it sits against its button and where the arrow points. */
export async function examplesFlyoutProblems(page: Page): Promise<string[]> {
  await showSidebar(page);
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Examples' })).toBeVisible();
  const problems = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('button[aria-label="Examples"]')!;
    const popup = document.querySelector<HTMLElement>('[role=menu][aria-label="Examples"]')!;
    const buttonBox = trigger.getBoundingClientRect();
    const menuBox = popup.getBoundingClientRect();
    const found: string[] = [];
    if (trigger.getAttribute('aria-expanded') !== 'true') found.push('button not expanded');
    const outsideWindow =
      menuBox.top < 0 ||
      menuBox.bottom > window.innerHeight ||
      menuBox.left < 0 ||
      menuBox.right > window.innerWidth;
    if (outsideWindow) found.push('menu leaves the window');
    const coversButton =
      menuBox.left < buttonBox.right &&
      menuBox.right > buttonBox.left &&
      menuBox.top < buttonBox.bottom &&
      menuBox.bottom > buttonBox.top;
    if (coversButton) found.push('menu covers the button');
    if (window.innerWidth <= 650) return found;
    if (Math.abs(menuBox.left - buttonBox.right) > 1) found.push('menu does not touch the button');
    if (!trigger.querySelector('.flyout-arrow-side')?.checkVisibility()) {
      found.push('arrow does not point at the menu');
    }
    if (Math.abs(menuBox.bottom - buttonBox.bottom) > 1) found.push('menu bottom off the button');
    return found;
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  return problems;
}

/** Runs New, Export and Admin from the More actions menu and checks that each one works. */
export async function moreActionsWork(page: Page): Promise<void> {
  await openNewMenu(page);
  const newMenu = page.getByRole('menu', { name: 'New', exact: true });
  await expect(newMenu.getByRole('menuitem', { name: 'Add concept…', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(newMenu).toHaveCount(0);
  const download = page.waitForEvent('download');
  await exportFile(page);
  expect((await download).suggestedFilename()).toMatch(/\.ya?ml$/);
  await chooseMoreAction(page, 'Admin');
  await page.locator('.admin-page').waitFor();
  await leaveAdminPage(page);
}
