// The header's title block and menus: the file name, the kind and save state under it,
// the danger colour of a failing save, and New and Export living only in More actions.
import { expect, type Page } from '@playwright/test';
import { fillEditor } from './code-editor';
import { openNewMenu } from './header';
import { contrastRatio, parseColor, tokenColour } from './color-literals';

/** What the header should say about the open file. */
export type OpenFileHeader = { fileName: string; kind: string };

/** Lists what is wrong with the title block of a header that has a file open. */
function titleBlockProblems(expected: OpenFileHeader): string[] {
  const found: string[] = [];
  const header = document.querySelector('.workspace-header')!;
  const headerBox = header.getBoundingClientRect();
  const block = header.querySelector('.workspace-title')!;
  const title = block.querySelector<HTMLElement>('h1')!;
  const style = getComputedStyle(title);
  if (title.textContent?.trim() !== expected.fileName) {
    found.push(`the title reads "${title.textContent}", not the file name`);
  }
  if (!title.getAttribute('title')) found.push('the title has no tooltip');
  if (title.getBoundingClientRect().height > parseFloat(style.lineHeight) * 1.5) {
    found.push('the title wraps');
  }
  if (style.textOverflow !== 'ellipsis') found.push('the title is not cut with an ellipsis');
  const meta = header.querySelector<HTMLElement>('.header-meta');
  const phone = header.classList.contains('header-phone');
  if (phone) return meta ? [...found, 'the phone header has a meta line'] : found;
  if (!meta) return [...found, 'the meta line is missing'];
  const metaBox = meta.getBoundingClientRect();
  const blockBox = block.getBoundingClientRect();
  const inside = metaBox.left >= headerBox.left - 1 && metaBox.right <= headerBox.right + 1 && metaBox.bottom <= headerBox.bottom + 1 && metaBox.right <= blockBox.right + 1;
  if (!inside) found.push('the meta line sticks out of the header or the title block');
  if (metaBox.top < title.getBoundingClientRect().bottom - 1) {
    found.push('the meta line is not under the title');
  }
  const saveState = meta.querySelector('.save-state-text')?.textContent?.trim() ?? '';
  const parts = [...meta.children].map(part => part.textContent?.trim() ?? '');
  const text = parts.join(' ');
  const wanted = `${expected.kind} · ${saveState}`;
  if (!saveState || text !== wanted) found.push(`the meta line reads "${text}", not "${wanted}"`);
  const stateStyle = getComputedStyle(meta.querySelector('.save-state')!);
  const isPill = parseFloat(stateStyle.borderTopWidth) > 0 || stateStyle.backgroundColor !== 'rgba(0, 0, 0, 0)';
  if (isPill) found.push('the save state is still drawn as a pill');
  return found;
}

/** Lists the header's buttons that duplicate what More actions holds, or that are missing. */
function headerButtonProblems(): string[] {
  const found: string[] = [];
  const header = document.querySelector('.workspace-header')!;
  const names = [...header.querySelectorAll('button')].map(button => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '');
  for (const name of ['New', 'Export']) {
    if (names.includes(name)) found.push(`${name} is a header button, not in More actions`);
  }
  for (const name of ['Commit', 'More actions']) {
    if (!names.includes(name)) found.push(`${name} is missing from the header`);
  }
  const icon = header.querySelector('button[aria-label="More actions"] svg');
  const iconWidth = icon?.getBoundingClientRect().width ?? 0;
  if (Math.abs(iconWidth - 18) > 1) found.push(`the More actions icon is ${iconWidth}px, not 18px`);
  // The icon is three small dots; a thin stroke makes them read as text.
  const dotWidth = parseFloat(getComputedStyle(icon!).strokeWidth);
  if (dotWidth < 3) found.push(`the More actions dots are drawn with a ${dotWidth}px stroke`);
  const commit = header.querySelector('button[aria-label="Commit"]');
  // Commit is the green primary button while it can run, and the plain dimmed one while it cannot.
  const commitOff = commit?.getAttribute('aria-disabled') === 'true';
  if (commit && !commitOff && !commit.classList.contains('primary')) found.push('Commit is not the primary button');
  return found;
}

/** Returns what is wrong with the header's title block and buttons for the open file. */
export async function headerContentProblems(page: Page, expected: OpenFileHeader): Promise<string[]> {
  const title = await page.evaluate(titleBlockProblems, expected);
  const buttons = await page.evaluate(headerButtonProblems);
  return [...title, ...buttons];
}

/** Lists how the save state differs from the danger colour and underline of a failing save. */
function failingSaveStyleProblems(danger: string): string[] {
  const found: string[] = [];
  const header = document.querySelector('.workspace-header')!;
  const button = header.querySelector<HTMLElement>('button[aria-label="Save state"]')!;
  const style = getComputedStyle(button);
  if (style.color !== danger) found.push(`a failing save is ${style.color}, not the danger colour`);
  const isPhone = header.classList.contains('header-phone');
  if (!isPhone && !style.textDecorationLine.includes('underline')) {
    found.push('a failing save is not underlined');
  }
  return found;
}

/** Breaks the open file in the Source tab and checks that the save state shows it as a failure. */
export async function failingSaveProblems(page: Page): Promise<string[]> {
  await page.locator('.tabs').getByRole('button', { name: 'Source', exact: true }).click();
  const editor = page.getByLabel('Definition source');
  const original = await editor.evaluate((el: any) => el.workbenchEditor.value() as string);
  await fillEditor(editor, `${original}\nunclosed: [\n`);
  const text = page.locator('.save-state-text');
  await expect(text).toHaveText(/^Not saved: \d+ errors?$/, { timeout: 20_000 });
  const danger = await page.evaluate(tokenColour, '--color-danger-text');
  const problems = await page.evaluate(failingSaveStyleProblems, danger);
  await fillEditor(editor, original);
  await expect(text).not.toHaveText(/^Not saved/);
  return problems;
}

/** The drawn colours of each disabled row of the open menu, and of the menu behind it. */
type DisabledRow = { name: string; colour: string; background: string };

function readDisabledRows(): DisabledRow[] {
  const rows = document.querySelectorAll<HTMLElement>('[role=menu] [role=menuitem][aria-disabled]');
  return [...rows].map(row => ({
    name: row.textContent?.trim().slice(0, 30) ?? '',
    colour: getComputedStyle(row).color,
    background: getComputedStyle(row.closest('.menu-popup')!).backgroundColor,
  }));
}

/** Lists the disabled rows that are not in the muted colour or are too faint to read. */
function disabledRowProblems(rows: DisabledRow[], muted: string): string[] {
  if (rows.length === 0) return ['the menu has no disabled row to check'];
  const found: string[] = [];
  for (const row of rows) {
    if (row.colour !== muted) found.push(`disabled "${row.name}" is ${row.colour}, not muted`);
    const ratio = contrastRatio(parseColor(row.colour)!, parseColor(row.background)!);
    if (ratio < 4.5) found.push(`disabled "${row.name}" has a contrast of ${ratio.toFixed(1)}:1`);
  }
  return found;
}

/** Opens the New submenu and checks that its disabled items read as disabled. */
export async function disabledNewItemProblems(page: Page): Promise<string[]> {
  await openNewMenu(page);
  await page.getByRole('menu', { name: 'New', exact: true }).waitFor();
  const muted = await page.evaluate(tokenColour, '--color-text-muted');
  const problems = disabledRowProblems(await page.evaluate(readDisabledRows), muted);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  return problems;
}
