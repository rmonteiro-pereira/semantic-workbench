// Exercises tour diagnostic exceptions against measured graph names in Chromium.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { graphCanvasProblems } from '../scripts/helpers/graph-canvas-geometry';
import { graphScreenProblems } from '../scripts/helpers/graph-tour';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent(`
    <style>
      .react-flow { width: 800px; height: 500px; }
      .full-entity { position: relative; width: 150px; height: 40px; padding: 10px; }
      strong { position: absolute; top: 0; font-size: 8px; }
      small { font-size: 8px; }
    </style>
    <div class="full-graph">
      <div class="react-flow">
        <div class="react-flow__viewport">
          <div class="full-entity"><strong>Sales order</strong><small>Identifier</small></div>
        </div>
      </div>
    </div>
  `);
});

afterAll(async () => {
  await browser?.close();
});

const fontProblem = 'name "Sales order" is 8.0 px on screen';
const containmentProblem = 'name "Sales order" leaves its card\'s vertical padding';

async function screenProblems(name: string) {
  return graphScreenProblems(page, { name, show: async () => {} });
}

test('all areas exempts only tiny names and preserves every other measured diagnostic', async () => {
  const measured = await graphCanvasProblems(page, 'model');
  expect(measured).toContain(fontProblem);
  expect(measured).toContain(containmentProblem);
  expect(measured).toContain('model detail text is 8.0 px on screen');
  const name = 'graph-model-all-areas';
  expect(await screenProblems(name)).toEqual(
    measured.filter(problem => problem !== fontProblem).map(problem => `${name}: ${problem}`),
  );
});

test('other model screens retain tiny-name and containment diagnostics', async () => {
  for (const name of ['graph-model-first-view', 'graph-model-options']) {
    const problems = await screenProblems(name);
    expect(problems).toContain(`${name}: ${fontProblem}`);
    expect(problems).toContain(`${name}: ${containmentProblem}`);
  }
});
