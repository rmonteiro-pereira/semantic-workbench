import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser } from '@playwright/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { EntityName } from '../src/app/graph/EntityName';

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

test.each([80, 100, 120, 160])('long graph names have no orphan suffix at %ipx', async width => {
  const page = await browser.newPage();
  try {
    const title = renderToStaticMarkup(<EntityName name="DocumentReference" />);
    await page.setContent(`
      <style>
        strong {
          display: block;
          width: ${width}px;
          font: 600 14px/20px sans-serif;
          overflow-wrap: anywhere;
        }
      </style>
      ${title}
    `);
    const lines = await page.locator('strong').evaluate(element => {
      const textLines = new Map<number, string>();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        for (let index = 0; index < (node.textContent?.length ?? 0); index++) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const top = Math.round(range.getBoundingClientRect().top);
          textLines.set(top, (textLines.get(top) ?? '') + range.toString());
        }
        node = walker.nextNode();
      }
      return [...textLines.values()];
    });
    expect(lines.join('')).toBe('DocumentReference');
    expect(lines.every(line => line.length >= 3)).toBe(true);
  } finally {
    await page.close();
  }
});
