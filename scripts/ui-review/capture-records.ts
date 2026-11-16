// Records native PNG captures and errors incrementally. SW_THEME optionally selects one theme for a serial batch.
import type { Page } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'node:fs';
import { screenProblems } from '../helpers/screen-tour';

/** Capture identity shared by every additional-state screenshot. */
export type CaptureIdentity = { output: string; mode: string; theme: string; width: number; height: number; user?: string };

/** Selects the requested capture theme while preserving the default matrix. */
export function captureThemes(): ('light' | 'dark')[] {
  const theme = process.env.SW_THEME;
  if (!theme) return ['light', 'dark'];
  if (theme === 'light' || theme === 'dark') return [theme];
  throw new Error(`Unsupported SW_THEME: ${theme}. Expected light or dark.`);
}

const currentScreens = new WeakMap<Page, { screen: string; state: string }>();
const errorIdentities = new WeakMap<Page, CaptureIdentity>();
const watchedPages = new WeakSet<Page>();

/** Records console and uncaught browser errors with the current capture identity. */
export function watchCaptureErrors(page: Page, identity: CaptureIdentity) {
  errorIdentities.set(page, identity);
  if (watchedPages.has(page)) return;
  watchedPages.add(page);
  const record = (kind: string, error: string) => {
    const location = currentScreens.get(page) ?? { screen: 'startup', state: 'loading' };
    const entry = { ...(errorIdentities.get(page) ?? identity), ...location, type: kind, error };
    console.log(kind, JSON.stringify(entry));
    appendFileSync(`${identity.output}/browser-errors.jsonl`, JSON.stringify(entry) + '\n');
  };
  page.on('pageerror', error => record('BROWSER_ERROR', error.message));
  page.on('console', message => {
    if (message.type() === 'error') record('CONSOLE_ERROR', message.text() + ' at ' + JSON.stringify(message.location()));
  });
}

/** Saves a viewport image and a full-page image when the page scrolls. */
export async function capture(page: Page, identity: CaptureIdentity, screen: string, state: string, loading = false) {
  currentScreens.set(page, { screen, state });
  mkdirSync(identity.output, { recursive: true });
  const prefix = identity.mode + (identity.theme === 'dark' ? '-dark' : '');
  const person = identity.user ? `${identity.user}-` : '';
  let stem = `${prefix}-${person}${screen}--${state}-${identity.width}`;
  if (identity.output.endsWith('server-personas')) stem = `${prefix}-${person}${screen}-${identity.width}`;
  let problems: string[] = [];
  if (!loading) {
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 15000 });
    await page.waitForTimeout(300);
    try {
      problems = await screenProblems(page, { name: screen, show: async () => {} });
    } catch (error) {
      problems = [String(error)];
    }
  }
  await page.screenshot({ path: `${identity.output}/${stem}.png` });
  const entry = { ...identity, file: `${stem}.png`, screen, state, problems, captured_at: new Date().toISOString() };
  appendFileSync(`${identity.output}/events.jsonl`, JSON.stringify(entry) + '\n');
  console.log('CAPTURE', stem, JSON.stringify(problems));
  if (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)) {
    await page.screenshot({ path: `${identity.output}/${stem}-full.png`, fullPage: true });
  }
}

/** Records a named unreachable state with its original browser error. */
export function failure(identity: CaptureIdentity, screen: string, state: string, error: unknown) {
  const entry = { ...identity, screen, state, error: String(error), type: 'unreachable' };
  console.log('UNREACHABLE', JSON.stringify(entry));
  appendFileSync(`${identity.output}/failures.jsonl`, JSON.stringify(entry) + '\n');
}

/** Attempts one state without preventing later captures when it fails. */
export async function attempt(page: Page, identity: CaptureIdentity, screen: string, state: string, action: () => Promise<void>) {
  currentScreens.set(page, { screen, state });
  try {
    await action();
    await capture(page, identity, screen, state);
  } catch (error) {
    failure(identity, screen, state, error);
    try {
      await capture(page, identity, screen, state + '-failed', true);
    } catch (captureError) {
      failure(identity, screen, state + '-failure-capture', captureError);
    }
    await page.keyboard.press('Escape');
  }
}
