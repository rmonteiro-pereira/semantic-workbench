// The header and the Add project menu in each state a person reaches, for the responsive suite and
// the screenshot tool.
import { expect, type Page } from '@playwright/test';
import { exportFile, headerProblems, openNewMenu } from './header';
import { showSidebar, type Screen } from './screen-tour';

async function openFirstFile(page: Page, file: string) {
  await showSidebar(page);
  await page.getByRole('button', { name: file, exact: true }).first().click();
  await page.waitForTimeout(500);
  // The graph's loading veil covers the page text for a moment; measure after it has gone.
  await page.locator('.full-graph-loading').waitFor({ state: 'hidden' });
}

async function openAddProjectMenu(page: Page) {
  await showSidebar(page);
  await page.getByRole('button', { name: 'Add project', exact: true }).click();
  await page.getByRole('menu', { name: 'Add project' }).waitFor();
}

/** Lists the header with a file open, its New menu and the sidebar's Add project menu. */
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
    { name: 'add-project-menu', dialog: '[role=menu]', show: openAddProjectMenu },
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
    const wide = ['New', 'Export'].filter(name =>
      [...header.querySelectorAll('button')].some(button => button.textContent?.trim() === name),
    );
    problems.push(...wide.map(name => `${name} still sits in the phone header`));
    return problems;
  });
}

/** Checks the More actions menu: New and Export as full-width rows with icons. */
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
  if (names.join('|') !== 'New|Export') problems.push(`More actions lists ${names}`);
  const menuWidth = (await menu.boundingBox())?.width ?? 0;
  for (const row of rows) {
    if (!row.hasIcon) problems.push(`${row.name} has no icon in the menu`);
    if (row.width < menuWidth - 16) problems.push(`${row.name} is not a full-width row`);
  }
  const separators = await menu.getByRole('separator').count();
  if (separators !== 0) problems.push(`the menu has ${separators} dividers for two actions`);
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
    // On a phone the Add project menu stays inside the drawer; elsewhere it is checked against the
    // window.
    const isPhone = (page.viewportSize()?.width ?? 0) <= 650;
    const panel = screen.name === 'add-project-menu' && isPhone ? '#workspace-sidebar' : null;
    problems.push(...(await menuProblems(page, panel)));
  }
  return problems.map(problem => `${screen.name}: ${problem}`);
}

/** Drives the Add project menu by keyboard: open, move, wrap, close with focus back, and Tab out. */
export async function addProjectKeyboardProblems(page: Page): Promise<void> {
  await showSidebar(page);
  const button = page.getByRole('button', { name: 'Add project', exact: true });
  const items = page.getByRole('menuitem');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Add project' })).toBeVisible();
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
  await expect(page.getByRole('menu', { name: 'Add project' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(button).not.toBeFocused();
}

/** Opens the Add project menu and lists where it sits against its button. */
export async function addProjectMenuProblems(page: Page): Promise<string[]> {
  await openAddProjectMenu(page);
  const problems = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('button[aria-label="Add project"]')!;
    const popup = document.querySelector<HTMLElement>('[role=menu][aria-label="Add project"]')!;
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
    if (menuBox.top < buttonBox.bottom) found.push('menu covers the button');
    if (Math.abs(menuBox.left - buttonBox.left) > 1) found.push('menu not level with the button');
    return found;
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  return problems;
}

/** Opens Settings and lists where its panel sits: just past the sidebar, level with the row. */
export async function settingsPanelProblems(page: Page): Promise<string[]> {
  await showSidebar(page);
  const button = page.getByRole('button', { name: 'Settings', exact: true });
  await button.click();
  const panel = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Theme', exact: true })).toBeVisible();
  const problems = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('.settings-toggle')!;
    const popup = document.querySelector<HTMLElement>('.settings-panel')!;
    const rowBox = trigger.getBoundingClientRect();
    const panelBox = popup.getBoundingClientRect();
    const found: string[] = [];
    if (trigger.getAttribute('aria-expanded') !== 'true') found.push('Settings not expanded');
    const outsideWindow =
      panelBox.top < 0 ||
      panelBox.bottom > window.innerHeight ||
      panelBox.left < 0 ||
      panelBox.right > window.innerWidth;
    if (outsideWindow) found.push('panel leaves the window');
    if (popup.scrollHeight > popup.clientHeight + 1) found.push('panel scrolls');
    if (window.innerWidth <= 650) return found;
    const sidebar = document.querySelector('#workspace-sidebar')!.getBoundingClientRect();
    const gap = panelBox.left - sidebar.right;
    if (gap < 4 || gap > 12) found.push(`panel is ${gap} px from the sidebar edge`);
    if (Math.abs(panelBox.bottom - rowBox.bottom) > 1) found.push('panel bottom off the row');
    return found;
  });
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();
  // The panel is drawn at the end of the page. Tab past its last control closes it and returns
  // to the Settings row, so focus never runs off the page or out of the phone drawer.
  await button.click();
  await panel.getByRole('button').last().focus();
  await page.keyboard.press('Tab');
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();
  return problems;
}

/** Runs New and Export from the More actions menu and checks that each one works. */
export async function moreActionsWork(page: Page): Promise<void> {
  await openNewMenu(page);
  const newMenu = page.getByRole('menu', { name: 'New', exact: true });
  await expect(newMenu.getByRole('menuitem', { name: 'Add concept…', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(newMenu).toHaveCount(0);
  const download = page.waitForEvent('download');
  await exportFile(page);
  expect((await download).suggestedFilename()).toMatch(/\.ya?ml$/);
}
