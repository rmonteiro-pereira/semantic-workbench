// Checks that metric lineage keeps complete source names at desktop and phone widths.
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { appUrl } from './helpers/base-url';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { fileTab } from './helpers/screen-tour';
import { verticallyCutBoxes } from './helpers/clipped-text';

const output = process.argv[2];
if (output) mkdirSync(resolve(output), { recursive: true });
const api = await startIsolatedApi({ root: resolve(`.metrics-lineage-check-${process.pid}`) });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await api.ws.loadExample('ubl');
  browser = await chromium.launch({ channel: process.env.SW_BROWSER_CHANNEL });
  for (const width of [1920, 1440, 1024, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'light' });
    try {
      await routeApi(page, api);
      await page.goto(appUrl());
      await fileTab('ubl.semantic.yaml', 'Metrics')(page);
      await page.getByRole('button', { name: /Order count: explain$/ }).click();
      const lineage = page.locator('.kpi-lineage');
      await expect(lineage).toBeVisible();
      await lineage.scrollIntoViewIfNeeded();
      await expect(lineage).toContainText('COUNT');
      await expect(lineage).toContainText('purchase_order.record_id');
      const problems = [
        ...(await verticallyCutBoxes(page, '.kpi-lineage')),
        ...(await lineage.evaluate(root => {
          const problems: string[] = [];
          if (root.scrollWidth > root.clientWidth + 1) problems.push('Lineage overflows horizontally');
          for (const element of root.querySelectorAll<HTMLElement>('small, strong, code')) {
            const style = getComputedStyle(element);
            if (style.whiteSpace === 'nowrap' && style.overflowX === 'hidden') {
              problems.push(`Lineage text can be truncated: ${element.textContent}`);
            }
          }
          for (const cell of root.querySelectorAll('[data-step]')) {
            const bounds = cell.getBoundingClientRect();
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
              const text = walker.currentNode;
              if (!text.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(text);
              for (const rect of range.getClientRects()) {
                if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) {
                  problems.push(`Text overlaps its lineage step: ${text.textContent}`);
                }
              }
            }
          }
          return problems;
        })),
      ];
      if (output) await page.screenshot({ path: join(resolve(output), `metric-lineage-${width}.png`) });
      expect(problems, `Complete metric lineage at ${width}px`).toEqual([]);
      console.log(`PASS metric lineage ${width}px`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await api.stop();
}
