// The header and the Add project menu in each state a person reaches, for the responsive suite and
// the screenshot tool.
import { expect, type Page } from '@playwright/test';
import { tokenColour } from './color-literals';
import { exportFile, headerProblems, isPhoneHeader, openNewMenu } from './header';
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
      const position = [box.left, box.top, box.width, box.height].map(round).join(',');
      return `${name}@${position}`;
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
    const missing = ['Save state', 'Commit…', 'More actions'].filter(name => !header.querySelector(`button[aria-label="${name}"]`));
    problems.push(...missing.map(name => `${name} is missing from the phone header`));
    const wide = ['New', 'Export'].filter(name => [...header.querySelectorAll('button')].some(button => button.textContent?.trim() === name));
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
    const room = panelSelector ? document.querySelector(panelSelector)?.getBoundingClientRect() : null;
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
    const outsideWindow = menuBox.top < 0 || menuBox.bottom > window.innerHeight || menuBox.left < 0 || menuBox.right > window.innerWidth;
    if (outsideWindow) found.push('menu leaves the window');
    if (menuBox.top < buttonBox.bottom) found.push('menu covers the button');
    if (Math.abs(menuBox.left - buttonBox.left) > 1) found.push('menu not level with the button');
    return found;
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  return problems;
}

/** Where the examples list sits against the Add project menu and its Load an example row. */
function exampleListPlacement(): string[] {
  const menu = document.querySelector<HTMLElement>('[role=menu][aria-label="Add project"]')!;
  const list = document.querySelector<HTMLElement>('.menu-popup.menu-submenu')!;
  const row = [...menu.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent?.trim() === 'Load an example')!;
  const menuBox = menu.getBoundingClientRect();
  const listBox = list.getBoundingClientRect();
  const rowBox = row.getBoundingClientRect();
  const found: string[] = [];
  if (listBox.left < menuBox.right) found.push('examples list covers the Add project menu');
  if (listBox.left - menuBox.right > 12) found.push('examples list is not beside the menu');
  if (listBox.bottom > window.innerHeight || listBox.right > window.innerWidth) {
    found.push('examples list leaves the window');
  }
  const levelWithRow = listBox.top <= rowBox.top && listBox.bottom >= rowBox.bottom;
  if (!levelWithRow) found.push('examples list is not level with its row');
  if (row.getAttribute('aria-expanded') !== 'true') found.push('Load an example not expanded');
  // Assistive technology reaches the examples from their row, and names them after it.
  if (row.getAttribute('aria-controls') !== list.id) found.push('row does not control the list');
  if (list.getAttribute('aria-labelledby') !== row.id) found.push('list is not named by its row');
  return found;
}

/**
 * Opens Load an example and lists what is wrong with it. Wide windows show the examples beside the
 * menu, by pointer or by ArrowRight, and ArrowLeft goes back to the row. A phone has no room
 * beside, so the examples replace the list under a Back row.
 */
export async function exampleListProblems(page: Page): Promise<string[]> {
  await openAddProjectMenu(page);
  const menu = page.getByRole('menu', { name: 'Add project' });
  const row = page.getByRole('menuitem', { name: 'Load an example', exact: true });
  const list = page.getByRole('menu', { name: 'Load an example', exact: true });
  const firstExample = list.getByRole('menuitem').first();
  if (isPhoneHeader(page)) {
    await row.click();
    await expect(list.getByRole('menuitem', { name: 'Back', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    return [];
  }
  await row.hover();
  await expect(list).toBeVisible();
  await expect(menu).toBeVisible();
  const problems = await page.evaluate(exampleListPlacement);
  await page.getByRole('menuitem', { name: 'Import files', exact: true }).hover();
  await expect(list).toHaveCount(0);
  // Pointing opens the list; moving to another row with the keyboard closes it.
  await row.hover();
  await expect(list).toBeVisible();
  await row.focus();
  await page.keyboard.press('ArrowDown');
  await expect(list).toHaveCount(0);
  await row.focus();
  await page.keyboard.press('ArrowRight');
  await expect(firstExample).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(list).toHaveCount(0);
  await expect(row).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  return problems;
}

/** The theme buttons form one control: one row under the word Theme, edges touching. */
function themeControlProblems(): string[] {
  const control = document.querySelector<HTMLElement>('.settings-panel .theme-control')!;
  const label = control.querySelector<HTMLElement>('.theme-control-label')!.getBoundingClientRect();
  const buttons = [...control.querySelectorAll<HTMLElement>('button')].map(button => button.getBoundingClientRect());
  const found: string[] = [];
  if (buttons.some(box => box.top < label.bottom)) found.push('theme buttons beside the label');
  if (buttons.some(box => Math.abs(box.top - buttons[0]!.top) > 1)) {
    found.push('theme buttons on more than one row');
  }
  for (let index = 1; index < buttons.length; index++) {
    const gap = buttons[index]!.left - buttons[index - 1]!.right;
    if (Math.abs(gap) > 1) found.push(`a ${gap} px gap between theme buttons`);
  }
  return found;
}

/** The focused control shows the theme's focus colour, not the browser's black ring. */
function focusRingProblems(focusColour: string): string[] {
  const focused = document.activeElement as HTMLElement;
  const style = getComputedStyle(focused);
  if (style.outlineStyle === 'solid' && style.outlineColor === focusColour) return [];
  return [`focus ring is ${style.outlineStyle} ${style.outlineColor}`];
}

/** Opens Settings and lists where its panel sits: just past the sidebar, level with the row. */
export async function settingsPanelProblems(page: Page): Promise<string[]> {
  await showSidebar(page);
  const button = page.getByRole('button', { name: 'Settings', exact: true });
  await button.click();
  const panel = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Theme', exact: true })).toBeVisible();
  // Opened by the mouse, the panel holds focus, so no theme button wears the focus ring.
  await expect(panel).toBeFocused();
  const themeProblems = await page.evaluate(themeControlProblems);
  const problems = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('.settings-toggle')!;
    const popup = document.querySelector<HTMLElement>('.settings-panel')!;
    const rowBox = trigger.getBoundingClientRect();
    const panelBox = popup.getBoundingClientRect();
    const found: string[] = [];
    if (trigger.getAttribute('aria-expanded') !== 'true') found.push('Settings not expanded');
    const outsideWindow = panelBox.top < 0 || panelBox.bottom > window.innerHeight || panelBox.left < 0 || panelBox.right > window.innerWidth;
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
  const focusColour = await page.evaluate(tokenColour, '--color-focus');
  const ringProblems = await page.evaluate(focusRingProblems, focusColour);
  // The panel is drawn at the end of the page. Tab past its last control closes it and returns
  // to the Settings row, so focus never runs off the page or out of the phone drawer.
  await button.click();
  await panel.getByRole('button').last().focus();
  await page.keyboard.press('Tab');
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();
  return [...themeProblems, ...problems, ...ringProblems];
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
