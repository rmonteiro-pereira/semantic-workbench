import type { Page } from '@playwright/test';
import { appendFileSync, existsSync } from 'node:fs';
import { recordState } from './observe';

type Session = { output: string };
type Capture = (session: any, page: Page, state: string, selector: string, theme: 'light' | 'dark') => Promise<void>;

/** Captures each feature state in both themes and both required widths. */
export async function matrixCapture(capture: Capture, session: Session, page: Page, state: string, selector: string) {
  const originalViewport = page.viewportSize()!;
  const originalTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? 'light');
  try {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [390, 1440]) {
        const file = `${state}-${theme}-${width}.png`;
        if (existsSync(`${session.output}/${file}`)) continue;
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.evaluate(value => {
          document.documentElement.dataset.theme = value;
          localStorage.setItem('workbench.theme', value);
        }, theme);
        await page.emulateMedia({ colorScheme: theme });
        await recordState(page, file);
        await capture(session, page, state, selector, theme);
        const inputs = await page.locator('dialog[open] input, dialog[open] textarea').evaluateAll(elements =>
          elements.map(element => {
            const style = getComputedStyle(element);
            return {
              text: element.closest('label')?.textContent,
              tag: element.tagName,
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
              height: element.getBoundingClientRect().height,
              lineHeight: style.lineHeight,
            };
          }),
        );
        appendFileSync(`${session.output}/input-fonts.jsonl`, JSON.stringify({ file, inputs }) + '\n');
      }
    }
  } finally {
    await page.setViewportSize(originalViewport);
    await page.evaluate(value => {
      document.documentElement.dataset.theme = value;
      localStorage.setItem('workbench.theme', value);
    }, originalTheme);
    await page.emulateMedia({ colorScheme: originalTheme === 'dark' ? 'dark' : 'light' });
  }
}
