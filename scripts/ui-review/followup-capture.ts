// Captures isolated follow-up states and verifies them after each image. Imported by follow-up drivers.
// OUTPUT_ROOT is supplied by the driver; SW_THEME optionally selects one theme.
import { expect, type Browser, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, renameSync } from 'node:fs';
import { screenProblems } from '../helpers/screen-tour';
import { captureThemes } from './capture-records';

/** One requested viewport and theme. */
export type View = { width: number; height: number; theme: 'light' | 'dark' };
/** A fresh-context state and its observable postcondition. */
export type State = {
  screen: string;
  state: string;
  action: (page: Page, record: (step: string, value: unknown) => void) => Promise<void>;
  check: (page: Page) => Promise<unknown>;
  full?: boolean;
  timed?: boolean;
};
/** The standard follow-up viewport inventory. */
export const followupViews: View[] = (
  [
    { width: 1440, height: 900, theme: 'light' },
    { width: 390, height: 844, theme: 'light' },
    { width: 1440, height: 900, theme: 'dark' },
  ] satisfies View[]
).filter(view => captureThemes().includes(view.theme));

/** Records one structured observation without interpreting appearance. */
export function observation(root: string, value: unknown) {
  mkdirSync(root + '/screenshots/followup', { recursive: true });
  appendFileSync(root + '/screenshots/followup/checks.jsonl', JSON.stringify(value) + '\n');
  console.log('FOLLOWUP', JSON.stringify(value));
}

async function saveImage(page: Page, path: string, full: boolean) {
  await page.screenshot({ path });
  if (full || (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight))) {
    await page.screenshot({ path: path.replace('.png', '-full.png'), fullPage: true });
    return true;
  }
  return false;
}

/** Runs a single state with new browser storage, page, and fixture navigation. */
export async function freshCapture(
  browser: Browser,
  root: string,
  view: View,
  state: State,
  setup: (page: Page) => Promise<void>,
  identity: { mode: 'local' | 'server'; user?: string } = { mode: 'local' },
) {
  const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: 1, colorScheme: view.theme });
  await context.addInitScript(theme => localStorage.setItem('workbench.theme', theme), view.theme);
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const base = { ...identity, ...view, screen: state.screen, state: state.state };
  const record = (step: string, value: unknown) => observation(root, { ...base, step, value });
  page.on('pageerror', error => record('browser-error', error.message));
  page.on('console', message => {
    if (message.type() === 'error') record('console-error', message.text());
  });
  const prefix = identity.mode + (view.theme === 'dark' ? '-dark' : '');
  const directory = root + '/screenshots/followup';
  mkdirSync(directory, { recursive: true });
  let path = `${directory}/${prefix}-${state.screen}--${state.state}-${view.width}.png`;
  let errorText = '';
  let full = false;
  let checks: unknown;
  let problems: string[] = [];
  try {
    await setup(page);
    await state.action(page, record);
    await page.evaluate(() => document.fonts.ready);
    if (!state.timed) {
      await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 30000 });
      await page.waitForTimeout(250);
    }
    full = await saveImage(page, path, Boolean(state.full));
    checks = await state.check(page);
    const dialog = (await page.locator('dialog[open]').count()) ? 'dialog[open]' : undefined;
    problems = await screenProblems(page, { name: 'followup-' + state.screen, dialog, show: async () => {} });
  } catch (error) {
    errorText = String(error);
    const failed = path.replace(`-${view.width}.png`, `-failed-${view.width}.png`);
    if (await Bun.file(path).exists()) {
      renameSync(path, failed);
      if (full) renameSync(path.replace('.png', '-full.png'), failed.replace('.png', '-full.png'));
    } else {
      try {
        full = await saveImage(page, failed, Boolean(state.full));
      } catch (captureError) {
        record('screenshot-error', String(captureError));
      }
    }
    path = failed;
  } finally {
    const event = {
      ...base,
      file: path.split('/').at(-1),
      output: directory,
      state: state.state + (errorText ? '-failed' : ''),
      failed: Boolean(errorText),
      error: errorText,
      checks,
      problems,
      captured_at: new Date().toISOString(),
      fresh_context: true,
    };
    appendFileSync(directory + '/events.jsonl', JSON.stringify(event) + '\n');
    record('post-capture-check', event);
    await context.close();
  }
}

/** Records the actual focused DOM element after keyboard navigation. */
export async function focusByTab(page: Page, selector: string) {
  for (let index = 0; index < 180; index++) {
    await page.keyboard.press('Tab');
    const matches = await page.evaluate(value => document.activeElement?.matches(value), selector);
    if (!matches) continue;
    await page.locator(':focus').scrollIntoViewIfNeeded();
    return;
  }
  throw new Error(`Tab did not reach ${selector} after 180 presses`);
}

/** Verifies focus and visibility without moving focus after the screenshot. */
export async function focusedElement(page: Page, selector: string) {
  const result = await page.evaluate(value => {
    const element = document.activeElement as HTMLElement | null;
    const box = element?.getBoundingClientRect();
    return {
      matches: element?.matches(value),
      tag: element?.tagName,
      role: element?.getAttribute('role'),
      label: element?.getAttribute('aria-label'),
      text: element?.textContent?.slice(0, 100),
      inside: Boolean(box && box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= innerWidth),
    };
  }, selector);
  expect(result.matches).toBe(true);
  expect(result.inside).toBe(true);
  return result;
}
