import { expect, type Page } from '@playwright/test';
import { geometryProblems } from './screen-tour';

/** The open dialog stays in the window and holds no small, covered or colliding text. */
export async function expectDialogGeometry(page: Page, name: string) {
  const width = page.viewportSize()!.width;
  const box = (await page.locator('dialog[open] .workbench-dialog').last().boundingBox())!;
  expect(box.x, `${name}: dialog starts inside the window`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${name}: dialog ends inside the window`).toBeLessThanOrEqual(width);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    `${name}: the page does not scroll sideways`,
  ).toBe(true);
  expect(await geometryProblems(page, 'dialog[open]'), `${name}: geometry`).toEqual([]);
}

/** The two widths a dialog may have, and the margin the backdrop keeps around it. */
const DIALOG_WIDTHS = [480, 880];
const BACKDROP_MARGIN = 24;
const PHONE_BACKDROP_MARGIN = 10;
const PHONE_MAX_WIDTH = 699;

/**
 * Returns what an open dialog does differently from the others: its width, the padding of its
 * title against its footer, the place of its main action and the look of a disabled button.
 * A drawer (the item editor and the metric wizard) keeps its own width.
 */
export async function dialogStandardProblems(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ widths, margin, phoneMargin, phoneMax }) => {
      const panel = document.querySelector<HTMLElement>('dialog[open] .workbench-dialog');
      if (!panel) return [];
      const problems: string[] = [];
      const box = panel.getBoundingClientRect();
      const fits = box.left >= 0 && box.right <= innerWidth && box.top >= 0;
      if (!fits || box.bottom > innerHeight + 1) problems.push('the dialog leaves the window');
      const drawer = panel.classList.contains('item-editor');
      const available = innerWidth - 2 * (innerWidth <= phoneMax ? phoneMargin : margin);
      const standard = widths.some(width => Math.abs(box.width - Math.min(width, available)) < 2);
      if (!drawer && !standard) problems.push(`the dialog is ${box.width}px wide`);
      if (!drawer && Math.abs(box.left + box.width / 2 - innerWidth / 2) > 2) {
        problems.push('the dialog is not centred horizontally');
      }
      if (!drawer && Math.abs(box.top + box.height / 2 - innerHeight / 2) > 2) {
        problems.push('the dialog is not centred vertically');
      }
      const footer = panel.querySelector<HTMLElement>(':scope > .dialog-footer');
      if (!footer) return [...problems, 'the dialog has no footer'];
      const note = footer.querySelector('.dialog-footer-note');
      if (note) {
        const noteBox = note.getBoundingClientRect();
        for (const button of footer.querySelectorAll('button')) {
          if (noteBox.bottom > button.getBoundingClientRect().top + 1) {
            problems.push('the footer hint shares the action row');
          }
        }
      }
      const backdrop = panel.closest('dialog')!;
      const scrim = getComputedStyle(backdrop, '::backdrop').backgroundColor;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      context.fillStyle = scrim;
      context.fillRect(0, 0, 1, 1);
      if (context.getImageData(0, 0, 1, 1).data[3] < 150) {
        problems.push('the dialog scrim does not separate it from the page');
      }
      const title = panel.querySelector<HTMLElement>(':scope > h2')!;
      const titleInset = getComputedStyle(title).paddingLeft;
      const footerInset = getComputedStyle(footer).paddingLeft;
      if (titleInset !== footerInset) problems.push('the footer padding differs from the title');
      const buttons = [...footer.querySelectorAll<HTMLButtonElement>('button')].filter(
        button => button.getClientRects().length > 0,
      );
      const main = buttons.findIndex(button => button.matches('.primary'));
      const lastMain = buttons.findLastIndex(button => button.matches('.primary, .danger'));
      if (main >= 0 && lastMain !== buttons.length - 1) {
        problems.push('the main action is not the last button');
      }
      const probe = document.createElement('button');
      probe.style.color = 'var(--text-muted)';
      probe.style.backgroundColor = 'var(--color-surface-sunken)';
      document.body.append(probe);
      const expected = getComputedStyle(probe);
      for (const button of buttons.filter(candidate => candidate.disabled)) {
        const style = getComputedStyle(button);
        if (style.borderTopStyle !== 'dashed') {
          problems.push(`the disabled "${button.textContent}" action has no distinct border`);
        }
        const readable =
          style.opacity === '1' &&
          style.color === expected.color &&
          style.backgroundColor === expected.backgroundColor;
        if (!readable) problems.push(`the disabled "${button.textContent}" button is faint`);
      }
      probe.remove();
      return problems;
    },
    {
      widths: DIALOG_WIDTHS,
      margin: BACKDROP_MARGIN,
      phoneMargin: PHONE_BACKDROP_MARGIN,
      phoneMax: PHONE_MAX_WIDTH,
    },
  );
}
