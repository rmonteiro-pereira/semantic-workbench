// Opens file actions through the header menus used by browser checks and measures the header.
import type { Page } from '@playwright/test';
import { PHONE_SCREEN_PX } from '../../src/app/useNarrowScreen';
// Export is a header button; New ▾ holds one Add item per kind. On a phone both sit in the More
// actions menu.
/** Says whether the window is narrow enough for the one-row phone header. */
export function isPhoneHeader(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < PHONE_SCREEN_PX;
}
/** Chooses an entry of the phone header's More actions menu. */
export async function chooseMoreAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
/** Clicks the header's Export button, or the Export entry of More actions on a phone. */
export async function exportFile(page: Page) {
  if (isPhoneHeader(page)) {
    await chooseMoreAction(page, 'Export');
    return;
  }
  await page.getByRole('button', { name: 'Export', exact: true }).click();
}
/** Opens the New menu, which on a phone is an entry of the More actions menu. */
export async function openNewMenu(page: Page) {
  if (isPhoneHeader(page)) {
    await chooseMoreAction(page, 'New');
    return;
  }
  await page.getByRole('button', { name: 'New', exact: true }).click();
}
/** Opens the named item creation action through the New menu. */
export async function newItem(page: Page, name: RegExp | string) {
  await openNewMenu(page);
  await page.getByRole('menuitem', { name, exact: typeof name === 'string' }).click();
}

/** Returns what is wrong with the header's controls at the current viewport size. */
export async function headerProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const header = document.querySelector('.workspace-header');
    if (!header) return ['no header'];
    const box = header.getBoundingClientRect();
    const phone = window.innerWidth < 700;
    const controlHeight = phone ? 34 : 36;
    // Native dialogs render in the top layer even when their DOM belongs to the account menu.
    const belongsToHeader = (element: Element) => !element.closest('[role=menu], dialog');
    const controls = [...header.querySelectorAll<HTMLElement>('button')].filter(
      element => belongsToHeader(element) && element.getBoundingClientRect().width > 0,
    );
    const describe = (element: Element) =>
      element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.className;
    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      const name = describe(control);
      const hasName = !!control.getAttribute('aria-label') || !!control.textContent?.trim();
      if (!hasName) problems.push(`a header control has no accessible name at ${rect.left}`);
      const outside =
        rect.left < box.left - 1 ||
        rect.right > box.right + 1 ||
        rect.top < box.top - 1 ||
        rect.bottom > box.bottom + 1;
      if (outside) problems.push(`${name} sticks out of the header`);
      const isPill = control.classList.contains('save-state');
      const wrongHeight = isPill
        ? rect.height < controlHeight - 0.5
        : Math.abs(rect.height - controlHeight) > 0.5;
      if (wrongHeight) problems.push(`${name} is ${rect.height}px high, not ${controlHeight}px`);
    }
    const title = header.querySelector('.workspace-title h1')?.getBoundingClientRect();
    const rectangles = controls.map(control => ({
      name: describe(control),
      rect: control.getBoundingClientRect(),
    }));
    if (title) rectangles.push({ name: 'the title', rect: title });
    for (const [index, first] of rectangles.entries()) {
      for (const second of rectangles.slice(index + 1)) {
        const across =
          Math.min(first.rect.right, second.rect.right) -
          Math.max(first.rect.left, second.rect.left);
        const down =
          Math.min(first.rect.bottom, second.rect.bottom) -
          Math.max(first.rect.top, second.rect.top);
        if (across > 1 && down > 1) problems.push(`${first.name} overlaps ${second.name}`);
      }
    }
    // Controls on one row share a centre line. The account cluster stays on the first row.
    const toggle = header.querySelector('.workspace-toggle')?.getBoundingClientRect();
    const firstRow = [
      ...header.querySelectorAll('.workspace-toggle, .header-account button'),
    ].filter(belongsToHeader);
    for (const element of firstRow) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || !toggle) continue;
      const offset = Math.abs(rect.top + rect.height / 2 - (toggle.top + toggle.height / 2));
      if (offset > 1.5)
        problems.push(`${describe(element)} is off the first row line by ${offset}px`);
    }
    if (!phone) {
      const rowTop = toggle ? toggle.top + toggle.height / 2 : 0;
      for (const control of controls) {
        const rect = control.getBoundingClientRect();
        const isTall = control.classList.contains('save-state') && rect.height > controlHeight + 1;
        const offset = Math.abs(rect.top + rect.height / 2 - rowTop);
        if (!isTall && offset > 1.5) problems.push(`${describe(control)} is off the header line`);
      }
    }
    if (header.scrollWidth > header.clientWidth + 1) problems.push('the header scrolls sideways');
    return problems;
  });
}
