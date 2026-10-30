// Proves the clipping helpers see a cut button, a cut select value and a sideways scroll, and stay quiet on whole text.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { clippedTextProblems, nestedScrollBoxes, sidewaysOverflowProblems } from '../scripts/helpers/clipped-text';

let browser: Browser | undefined;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 600, height: 400 } });
});
afterAll(async () => {
  await browser?.close();
});

test('a button whose text is cut is reported, a button that fits is not', async () => {
  await page.setContent(`<div id="box"><button style="width:60px;overflow:hidden;white-space:nowrap">A very long label</button><button>Ok</button></div>`);
  const problems = await clippedTextProblems(page, '#box');
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain('A very long label');
});

test('a select narrower than its chosen value is reported', async () => {
  await page.setContent(`<div id="box"><select style="width:40px"><option>Whole workspace</option></select><select><option>Whole workspace</option></select></div>`);
  const problems = await clippedTextProblems(page, '#box');
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain('Whole workspace');
});

test('a panel with a sideways scroll or a nested scroll box is reported', async () => {
  await page.setContent(
    `<div id="panel" style="width:100px;overflow:auto"><div style="width:300px">wide row</div><div class="list" style="max-height:20px;overflow:auto"><p>one</p><p>two</p><p>three</p></div></div>`,
  );
  expect((await sidewaysOverflowProblems(page, '#panel')).length).toBeGreaterThan(0);
  expect(await nestedScrollBoxes(page, '#panel')).toHaveLength(1);
});
