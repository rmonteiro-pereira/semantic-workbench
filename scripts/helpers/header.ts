// Opens file actions through the header menus used by browser checks and measures the header.
import { expect, type Page } from '@playwright/test';
import { NO_FILE_TITLE } from '../../src/app/workspace/HeaderTitle';
import { PHONE_SCREEN_PX } from '../../src/app/workspace/hooks/useNarrowScreen';
// New and Export sit in the More actions menu at every window width.
/** Waits until the header has switched to the layout that suits the window's current width. */
export async function expectHeaderSettled(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(phoneWidth => {
        const header = document.querySelector('.workspace-header');
        if (!header) return true;
        return header.classList.contains('header-phone') === window.innerWidth < phoneWidth;
      }, PHONE_SCREEN_PX),
    )
    .toBe(true);
}
/** Says whether the window is narrow enough for the phone header. */
export function isPhoneHeader(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < PHONE_SCREEN_PX;
}
/** Chooses an entry of the header's More actions menu. */
export async function chooseMoreAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
/** Runs the Export entry of the More actions menu. */
export async function exportFile(page: Page) {
  await chooseMoreAction(page, 'Export');
}
/** Opens the New submenu of the More actions menu. */
export async function openNewMenu(page: Page) {
  await chooseMoreAction(page, 'New');
}
/** The header's h1: the open file's name, with the model's long name in its tooltip. */
export function headerTitle(page: Page) {
  return page.locator('.workspace-title h1');
}
/** Waits until a file is open, which the title shows by leaving its no-file prompt. */
export async function expectFileOpen(page: Page, options: { timeout?: number } = {}) {
  await expect(headerTitle(page)).not.toHaveText(NO_FILE_TITLE, options);
}
/** Waits for the header to prompt for a file; with nothing open it has no Commit button. */
export async function expectNoFileOpen(page: Page) {
  await expect(headerTitle(page)).toHaveText(NO_FILE_TITLE);
  await expect(page.locator('.workspace-header .header-meta')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Commit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More actions', exact: true })).toBeVisible();
  expect(await page.evaluate(noFileHeaderProblems)).toEqual([]);
}

/** Lists how the header with no file open differs from the one-row header with a file. */
function noFileHeaderProblems(): string[] {
  const found: string[] = [];
  const header = document.querySelector<HTMLElement>('.workspace-header')!;
  const rowHeight = 60;
  const height = header.getBoundingClientRect().height;
  if (Math.abs(height - rowHeight) > 1) found.push(`the header is ${height}px, not ${rowHeight}px`);
  const block = header.querySelector('.workspace-title')!.getBoundingClientRect();
  const prompt = header.querySelector('h1')!;
  const range = document.createRange();
  range.selectNodeContents(prompt);
  const textLeft = range.getBoundingClientRect().left;
  if (Math.abs(textLeft - block.left) > 1) found.push('the prompt is not at the title position');
  const toggle = header.querySelector('.workspace-toggle')!.getBoundingClientRect();
  const more = header.querySelector('button[aria-label="More actions"]')!.getBoundingClientRect();
  const offset = Math.abs(toggle.top + toggle.height / 2 - (more.top + more.height / 2));
  if (offset > 1) found.push(`More actions is ${offset}px off the toggle's line`);
  return found;
}
/** Waits for the open model's name, which the title carries as its tooltip. */
export async function expectModelName(page: Page, name: RegExp | string, options: { timeout?: number } = {}) {
  await expect(headerTitle(page)).toHaveAttribute('title', name, options);
}
/** Opens the named item creation action through the New menu. */
export async function newItem(page: Page, name: RegExp | string) {
  await openNewMenu(page);
  await page.getByRole('menuitem', { name, exact: typeof name === 'string' }).click();
}

/** Returns what is wrong with the header's controls and title block at the current size. */
export async function headerProblems(page: Page): Promise<string[]> {
  return page.evaluate(phoneWidth => {
    const problems: string[] = [];
    const header = document.querySelector('.workspace-header');
    if (!header) return ['no header'];
    const box = header.getBoundingClientRect();
    const phone = window.innerWidth < phoneWidth;
    const controlHeight = phone ? 34 : 36;
    // Native dialogs render in the top layer even when their DOM belongs to the account menu.
    const belongsToHeader = (element: Element) => !element.closest('[role=menu], dialog');
    const inMetaLine = (element: Element) => !!element.closest('.header-meta');
    const buttons = [...header.querySelectorAll<HTMLElement>('button')].filter(element => belongsToHeader(element) && element.getBoundingClientRect().width > 0);
    // The save state in the meta line is text, not a control of the header's height.
    const controls = buttons.filter(element => !inMetaLine(element));
    const describe = (element: Element) => element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.className;
    for (const control of buttons) {
      const rect = control.getBoundingClientRect();
      const name = describe(control);
      const hasName = !!control.getAttribute('aria-label') || !!control.textContent?.trim();
      if (!hasName) problems.push(`a header control has no accessible name at ${rect.left}`);
      const outside = rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1;
      if (outside) problems.push(`${name} sticks out of the header`);
    }
    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      // The round account button is 34 px, two pixels under the other controls, as designed.
      const wanted = control.classList.contains('person-avatar-button') ? 34 : controlHeight;
      if (Math.abs(rect.height - wanted) > 0.5) {
        problems.push(`${describe(control)} is ${rect.height}px high, not ${wanted}px`);
      }
    }
    // The title block takes the free width and must never overlap a control.
    const titleBlock = header.querySelector('.workspace-title')?.getBoundingClientRect();
    const rectangles = controls.map(control => ({
      name: describe(control),
      rect: control.getBoundingClientRect(),
    }));
    if (titleBlock) rectangles.push({ name: 'the title block', rect: titleBlock });
    for (const [index, first] of rectangles.entries()) {
      for (const second of rectangles.slice(index + 1)) {
        const across = Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left);
        const down = Math.min(first.rect.bottom, second.rect.bottom) - Math.max(first.rect.top, second.rect.top);
        if (across > 1 && down > 1) problems.push(`${first.name} overlaps ${second.name}`);
      }
    }
    // The meta line stays inside the header and inside the title block.
    const meta = header.querySelector('.header-meta')?.getBoundingClientRect();
    if (meta && titleBlock) {
      const insideHeader = meta.left >= box.left - 1 && meta.right <= box.right + 1;
      const insideBlock = meta.right <= titleBlock.right + 1 && meta.bottom <= titleBlock.bottom + 1;
      if (!insideHeader || meta.bottom > box.bottom + 1) {
        problems.push('the meta line sticks out of the header');
      }
      if (!insideBlock) problems.push('the meta line sticks out of the title block');
    }
    // Every control shares the centre line of the sidebar toggle: the header is one row.
    const toggle = header.querySelector('.workspace-toggle')?.getBoundingClientRect();
    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      if (!toggle) continue;
      const offset = Math.abs(rect.top + rect.height / 2 - (toggle.top + toggle.height / 2));
      if (offset > 1.5) problems.push(`${describe(control)} is off the header line by ${offset}px`);
    }
    if (header.scrollWidth > header.clientWidth + 1) problems.push('the header scrolls sideways');
    return problems;
  }, PHONE_SCREEN_PX);
}
