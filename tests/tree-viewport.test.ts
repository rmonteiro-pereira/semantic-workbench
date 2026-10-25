import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, expect as browserExpect, type Browser, type Page } from '@playwright/test';

let browser: Browser;
let script: string;

beforeAll(async () => {
  const bundle = await Bun.build({
    entrypoints: ['tests/harness/tree-viewport.ts'],
    target: 'browser',
    format: 'iife',
  });
  if (!bundle.success) throw new Error(bundle.logs.join('\n'));
  script = await bundle.outputs[0].text();
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

async function expectCompleteRows(page: Page) {
  await browserExpect
    .poll(() =>
      page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('.documents')!;
        const frame = scroller.getBoundingClientRect();
        return [...document.querySelectorAll('.project-file, .tree-row')].every(row => {
          const box = row.getBoundingClientRect();
          return box.top >= frame.bottom - 1 || box.bottom <= frame.bottom + 1;
        });
      }),
    )
    .toBe(true);
}

test.each([390, 1280, 1440, 2560])('tree rows stay complete and reachable at %ipx', async width => {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const rows = Array.from(
      { length: 30 },
      (_, index) =>
        `<li class="project-file"><button>File ${index}</button><small>Ontology</small></li>`,
    ).join('');
    await page.setContent(`
      <style>
        * { box-sizing: border-box; }
        .documents-frame { height: 267px; width: 270px; overflow: hidden; }
        .documents { height: 100%; overflow: auto; border-block: 1px solid; }
        ul { margin: 0; padding: 0; list-style: none; }
        .tree-row { height: 37px; }
        .project-file { height: 53px; }
        small { display: block; }
      </style>
      <div class="documents-frame"><div class="documents">
        <ul class="project-tree"><li class="project">
          <div class="tree-row">Commerce</div><ul>${rows}</ul>
        </li></ul>
      </div></div>
      <button id="footer">Import files</button>
    `);
    await page.addScriptTag({ content: script });
    expect(await page.locator('.project-tree').getAttribute('data-initial-partial-rows')).toBe('0');
    await expectCompleteRows(page);
    for (const height of [190, 315, 267]) {
      await page.locator('.documents-frame').evaluate((frame, value) => {
        (frame as HTMLElement).style.height = `${value}px`;
      }, height);
      await expectCompleteRows(page);
    }
    await page.locator('.documents').evaluate(scroller => {
      scroller.scrollTop = scroller.scrollHeight;
    });
    await browserExpect(page.getByRole('button', { name: 'File 29', exact: true })).toBeInViewport({
      timeout: 1000,
    });
    await expectCompleteRows(page);
    await page.locator('.documents-frame').evaluate(frame => {
      (frame as HTMLElement).style.height = '190px';
    });
    await browserExpect
      .poll(() =>
        page.locator('.documents').evaluate(scroller => scroller.getBoundingClientRect().height),
      )
      .toBeLessThanOrEqual(190);
    await browserExpect(page.getByRole('button', { name: 'File 29', exact: true })).toBeInViewport({
      timeout: 1000,
    });
    await expectCompleteRows(page);
    await page.getByRole('button', { name: 'File 15', exact: true }).focus();
    await browserExpect(page.getByRole('button', { name: 'File 15', exact: true })).toBeInViewport({
      timeout: 1000,
    });
    await browserExpect(page.getByRole('button', { name: 'Import files' })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
});
