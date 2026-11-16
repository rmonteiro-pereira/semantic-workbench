/** Verifies graph review changes through real workspace navigation and rendered geometry. */
import { expect, type Page } from '@playwright/test';
import { fileTab } from './screen-tour';
import { viewOptions, setShown } from './graph-options';

async function checkSelection(page: Page) {
  await fileTab('ubl.ontology.yaml', 'Graph')(page);
  await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  await page.waitForTimeout(400);
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
  const description = await page.locator('.neighborhood-node.center .node > span').boundingBox();
  expect(description!.height).toBeGreaterThanOrEqual(9);
  await expect(page.getByRole('button', { name: 'Other files', exact: true })).toBeVisible();
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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Enter full screen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exit full screen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).click();
  await page.setViewportSize({ width: 1600, height: 1000 });
}
