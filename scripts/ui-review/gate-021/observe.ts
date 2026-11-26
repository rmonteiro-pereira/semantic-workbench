import { chromium, type Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';

const output = process.env.JOURNEY_OUTPUT!;
const originalLaunch = chromium.launch.bind(chromium);
const pageErrors = new WeakMap<Page, string[]>();

function record(value: unknown) {
  appendFileSync(`${output}/observations.jsonl`, JSON.stringify(value) + '\n');
}

/** Records errors and DOM measurements for viewport and cropped captures alike. */
export async function recordState(page: Page, file?: string) {
  const errors = pageErrors.get(page) ?? [];
  const measurements = await page
    .evaluate(() => {
      const labels = [...document.querySelectorAll('.react-flow__edge-text, .relationship-label')].filter(element => element.checkVisibility()).map(element => element.textContent?.trim());
      const inputs = [...document.querySelectorAll('dialog[open] input, dialog[open] textarea')].map(element => {
        const style = getComputedStyle(element);
        return {
          label: element.getAttribute('aria-label') ?? element.closest('label')?.textContent,
          font: style.fontFamily,
          size: style.fontSize,
          height: element.getBoundingClientRect().height,
          lineHeight: style.lineHeight,
        };
      });
      return { labels, inputs, title: document.title };
    })
    .catch(() => null);
  record({ file, viewport: page.viewportSize(), errors: [...errors], measurements });
  errors.length = 0;
}

function observe(page: Page) {
  if (pageErrors.has(page)) return;
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('close', () => {
    if (errors.length) record({ type: 'remaining-errors', errors });
  });
  const originalScreenshot = page.screenshot.bind(page);
  page.screenshot = async options => {
    await recordState(page, options?.path);
    return originalScreenshot(options);
  };
}

chromium.launch = async options => {
  const browser = await originalLaunch(options);
  const originalContext = browser.newContext.bind(browser);
  browser.newContext = async contextOptions => {
    const context = await originalContext(contextOptions);
    context.on('page', observe);
    return context;
  };
  const originalPage = browser.newPage.bind(browser);
  browser.newPage = async pageOptions => {
    const page = await originalPage(pageOptions);
    observe(page);
    return page;
  };
  return browser;
};
