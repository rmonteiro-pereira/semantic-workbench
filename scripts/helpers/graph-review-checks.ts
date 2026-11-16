/** Verifies graph review changes through real workspace navigation and rendered geometry. */
import { expect, type Page } from '@playwright/test';
import { fileTab } from './screen-tour';
import { pickCenter } from './edge-geometry';
import { revealGraphControls, hideGraphControls, viewOptions, setShown } from './graph-options';

async function checkLayoutControls(page: Page) {
  await revealGraphControls(page);
  const panel = (await page.locator('.compact-controls-panel').boundingBox())!;
  const graph = (await page.locator('.full-graph').boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(graph.x);
  expect(panel.x + panel.width).toBeLessThanOrEqual(graph.x + graph.width);
  await page.evaluate(() => {
    const original = Worker.prototype.postMessage;
    (window as any).restoreGraphWorker = () => {
      Worker.prototype.postMessage = original;
    };
    // Hold the real request so the pending state is observable even on fast machines.
    Worker.prototype.postMessage = function (message, options: any) {
      setTimeout(() => original.call(this, message, options), 1200);
    };
  });
  try {
    await page.getByRole('button', { name: 'Re-layout', exact: true }).click();
    await expect(page.locator('.full-graph-loading')).toBeVisible();
    for (const name of ['Re-layout', 'Zoom in', 'Zoom out', 'Fit model']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    }
    await expect(page.locator('.grouping-trigger')).toBeDisabled();
    await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
    await expect(page.getByRole('button', { name: 'Re-layout', exact: true })).toBeEnabled();
    console.log('PASS pending layout disables grouping, re-layout, zoom and Fit; completion restores them');
  } finally {
    await page.evaluate(() => {
      (window as any).restoreGraphWorker();
      delete (window as any).restoreGraphWorker;
    });
    await hideGraphControls(page);
  }
}

async function checkSelection(page: Page) {
  await fileTab('ubl.ontology.yaml', 'Graph')(page);
  await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await checkLayoutControls(page);
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  await page.waitForTimeout(400);
  await viewOptions(page, options => setShown(options, 'Labels', true));
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  await page.mouse.move(10, 10);
  await expect(page.locator('.full-graph .react-flow__edge-text')).toHaveCount(0);
  await viewOptions(page, options => setShown(options, 'Labels', false));
  await page.locator('.full-entity').first().click();
  await expect(page.locator('.inspector')).toBeVisible();
  await expect.poll(async () => page.locator('.react-flow__node.selected strong').evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(9);
  const toolbar = await page.locator('.full-graph-tools > button, .full-graph-tools > .compact-controls > button').evaluateAll(elements =>
    elements.map(element => {
      const box = element.getBoundingClientRect();
      return box.top + box.height / 2;
    }),
  );
  expect(Math.max(...toolbar) - Math.min(...toolbar)).toBeLessThanOrEqual(2);
  const opacity = await page.locator('.react-flow__node-entity').evaluateAll(elements => Math.min(...elements.map(element => Number(getComputedStyle(element).opacity))));
  expect(opacity).toBeGreaterThanOrEqual(0.35);
  await page.locator('.inspector').getByRole('button', { name: /Close/ }).click();
  await viewOptions(page, options => setShown(options, 'Mini-map', true));
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  const maskStroke = await page.locator('.react-flow__minimap-mask').evaluate(element => Number.parseFloat(getComputedStyle(element).strokeWidth));
  expect(maskStroke).toBeGreaterThan(0);
  await viewOptions(page, options => setShown(options, 'Mini-map', false));
}

async function checkNeighborhood(page: Page) {
  await fileTab('ubl.ontology.yaml', 'Neighborhood')(page);
  await expect(page.locator('.neighborhood-canvas')).toHaveAttribute('data-viewport-ready', 'true');
  const pane = await page.locator('.neighborhood-canvas').boundingBox();
  expect(pane!.height).toBeGreaterThanOrEqual(480);
  const descriptionSize = await page.locator('.neighborhood-node.center .node > span').evaluate(element => {
    const viewport = element.closest('.react-flow__viewport')!;
    return Number.parseFloat(getComputedStyle(element).fontSize) * new DOMMatrix(getComputedStyle(viewport).transform).a;
  });
  expect(descriptionSize).toBeGreaterThanOrEqual(9);
  await expect(page.getByRole('button', { name: 'Other files', exact: true })).toBeVisible();
}

async function checkPierceFit(page: Page) {
  await pickCenter(page, 'Party');
  if (await page.locator('.inspector').isVisible()) await page.locator('.inspector').getByRole('button', { name: /Close/ }).click();
  await revealGraphControls(page);
  await page.getByRole('radiogroup', { name: 'Pierce direction' }).getByRole('radio', { name: 'Both', exact: true }).click();
  await page.getByRole('button', { name: 'Full pierce', exact: true }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).waitFor({ state: 'hidden' });
  await hideGraphControls(page);
  const fit = page.getByRole('button', { name: '45 entities, Fit', exact: true });
  await expect(fit).toBeVisible();
  await fit.click();
  await expect(fit).toBeHidden();
  const wholeCards = await page.locator('.neighborhood-canvas').evaluate(canvas => {
    const pane = canvas.getBoundingClientRect();
    return [...canvas.querySelectorAll('.neighborhood-node')].every(node => {
      const box = node.getBoundingClientRect();
      return box.left >= pane.left - 1 && box.right <= pane.right + 1 && box.top >= pane.top - 1 && box.bottom <= pane.bottom + 1;
    });
  });
  expect(wholeCards).toBe(true);
  console.log('PASS full pierce offers Fit for 45 entities; Fit frames every card');
}

/** Checks selection, neighborhood entry and the persistent phone full-screen exit. */
export async function checkGraphReview(page: Page) {
  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await checkSelection(page);
    await checkNeighborhood(page);
    console.log(`PASS graph review selection and neighborhood ${width}`);
  }
  await checkPierceFit(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Enter full screen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exit full screen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await fileTab('mall.ontology.yaml', 'Graph')(page);
  await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
  const mallCanvas = await page.locator('.full-graph .react-flow').boundingBox();
  expect(mallCanvas!.height).toBeGreaterThanOrEqual(473);
  console.log('PASS Mall Graph canvas retains at least 473 px at 1280×720');
  await page.setViewportSize({ width: 1600, height: 1000 });
}

/** Selects the visible center instead of an offscreen neighbor at readable opening zoom. */
export async function selectNeighborhoodCenter(page: Page) {
  await page.locator('.neighborhood-node.center').click();
}
