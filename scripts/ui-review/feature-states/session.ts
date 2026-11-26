// The shared capture session: pages at a given width and theme, cropped screenshots with their measurements,
// and a record of every state that could not be reached.
import type { Browser, Page } from '@playwright/test';
import { appendFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { routeApi, type IsolatedApi } from '../../helpers/isolated-api';
import { screenshotPath } from '../../helpers/screenshots';
import { lowContrastProblems, textCollisionProblems } from '../../helpers/text-geometry';
import { measureRegion } from './measure';

export type Theme = 'light' | 'dark';
export type Viewport = readonly [width: number, theme: Theme];
type ApiInterceptor = Parameters<typeof routeApi>[2];

/** The loopback address of the Vite frontend that the dev-server module starts. */
export const APP_URL = 'http://127.0.0.1:5450';

// Crops larger than this would be downscaled by the reviewers and lose the detail they judge.
const LONGEST_CROP_SIDE = 1600;

export interface CaptureSession {
  browser: Browser;
  /** The folder of one spec; its sibling folders share the image limit. */
  output: string;
  imageLimit: number;
  /** When set, only these states are photographed; the walk to reach them still runs. */
  onlyStates?: ReadonlySet<string>;
}

export async function newPage(session: CaptureSession, width = 1280, theme: Theme = 'light') {
  const page = await session.browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: theme });
  page.setDefaultTimeout(6000);
  await page.addInitScript(value => localStorage.setItem('workbench.theme', value), theme);
  return page;
}

export async function appPage(session: CaptureSession, api: IsolatedApi, width = 1280, theme: Theme = 'light', intercept?: ApiInterceptor) {
  const page = await newPage(session, width, theme);
  await routeApi(page, api, intercept);
  await page.goto(APP_URL);
  return page;
}

function imagesTaken(session: CaptureSession) {
  const root = dirname(session.output);
  let count = 0;
  for (const folder of readdirSync(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    count += readdirSync(join(root, folder.name)).filter(name => name.endsWith('.png')).length;
  }
  return count;
}

/** Native dialogs are cropped to their visible panel rather than the full-screen backdrop. */
function cropSelector(selector: string) {
  if (selector === 'dialog[open]') return 'dialog[open]:last-of-type .workbench-dialog';
  return selector;
}

/**
 * Photographs the first element matching the selector and records what was measured inside it.
 * A file that already exists is measured again but not overwritten, so a rerun can fill in missing states.
 */
export async function capture(session: CaptureSession, page: Page, state: string, selector: string, theme: Theme = 'light') {
  if (session.onlyStates && !session.onlyStates.has(state)) return;
  const crop = cropSelector(selector);
  const width = page.viewportSize()!.width;
  const file = `${state}-${theme}-${width}.png`;
  const alreadyCaptured = existsSync(join(session.output, file));
  if (!alreadyCaptured && imagesTaken(session) >= session.imageLimit) {
    throw new Error(`The image limit of ${session.imageLimit} is reached.`);
  }
  const region = page.locator(crop).first();
  await region.waitFor({ state: 'visible' });
  await page.waitForTimeout(100);
  // The browser's own scrolling honours scroll-margin, so sticky titles do not cover the region's top.
  await region.evaluate(element => element.scrollIntoView({ block: 'nearest' }));
  const box = await region.boundingBox();
  if (!box) throw new Error(`The crop ${crop} has no box for ${file}.`);
  if (Math.max(box.width, box.height) > LONGEST_CROP_SIDE) throw new Error(`The crop ${crop} is larger than ${LONGEST_CROP_SIDE} CSS pixels for ${file}.`);
  const measurements = await region.evaluate(measureRegion);
  const contrast = await lowContrastProblems(page, crop);
  const overlaps = await textCollisionProblems(page, crop);
  if (!alreadyCaptured) await region.screenshot({ path: screenshotPath(file, session.output), animations: 'disabled' });
  const record = { file, state, theme, width, crop, dpr: 1, size: [box.width, box.height], ...measurements, contrast, overlaps };
  appendFileSync(join(session.output, 'records.jsonl'), JSON.stringify(record) + '\n');
  console.log('CAPTURE', file);
}

/** Runs one state and, if it fails, records why instead of stopping the whole group. */
export async function attempt(session: CaptureSession, name: string, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    const reason = String(error).split('\n').slice(0, 4).join(' ');
    appendFileSync(join(session.output, 'missing.jsonl'), JSON.stringify({ state: name, reason }) + '\n');
    console.log('MISSING', name, reason);
  }
}

/** Asks the isolated API directly, as the browser would, so an interceptor can change the real answer. */
export async function realAnswer(api: IsolatedApi, pathAndQuery: string) {
  const response = await api.handler(new Request('http://localhost:5173' + pathAndQuery, { headers: { 'Sec-Fetch-Site': 'same-origin' } }));
  return response.json();
}

/** An interceptor that turns local mode into a shared server where the person may only read. */
export function readOnlyServer(api: IsolatedApi): NonNullable<ApiInterceptor> {
  return async route => {
    const path = new URL(route.request().url()).pathname;
    if (path !== '/api/me' && path !== '/api/projects') return false;
    const answer = await realAnswer(api, path);
    if (path === '/api/me') {
      answer.mode = 'server';
    } else {
      for (const project of answer) project.actions = ['read'];
    }
    await route.fulfill({ json: answer });
    return true;
  };
}
