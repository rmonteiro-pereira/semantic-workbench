// Captures graph stages using existing navigation and control helpers. Imported by capture-states; no additional environment variables.
import type { Page } from '@playwright/test';
import { fileTab } from '../helpers/screen-tour';
import { hideGraphControls, revealGraphControls, viewOptions, chooseLayout, setShown, showEveryEntity } from '../helpers/graph-options';
import { openGroupMenu, groupingMenuLabels, chooseGrouping } from '../helpers/grouping-menu';
import { capture, attempt, type CaptureIdentity } from './capture-records';

async function press(page: Page, name: string | RegExp, count = 1) {
  const button = page.getByRole('button', { name, exact: typeof name === 'string' }).first();
  // An open Controls panel can cover a different action in the row below it.
  if (!(await button.isVisible())) await revealGraphControls(page);
  if (!(await button.isVisible())) {
    await hideGraphControls(page);
    throw new Error(`Graph control is unavailable: ${name}`);
  }
  const insidePanel = await button.evaluate(element => Boolean(element.closest('.compact-controls-panel')));
  if (!insidePanel) await hideGraphControls(page);
  try {
    if (!(await button.isEnabled())) throw new Error(`Graph control is disabled: ${name}`);
    for (let index = 0; index < count; index++) {
      if (!(await button.isEnabled())) break;
      await button.click();
      await page.waitForTimeout(150);
    }
  } finally {
    if (insidePanel) await hideGraphControls(page);
  }
}

/** Zooms from a name-only lineage view until the detailed cards show their columns. */
export async function showLineageColumns(page: Page) {
  const center = page.locator('.lineage-card.center');
  await center.waitFor();
  for (let step = 0; step < 12; step++) {
    if (!(await center.evaluate(card => card.classList.contains('lineage-card-overview')))) return;
    // Wheel zoom keeps the inspected card under the pointer even if Fit placed it near an edge.
    await center.locator('.lineage-card-title').hover();
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(200);
  }
  if (await center.evaluate(card => card.classList.contains('lineage-card-overview'))) {
    throw new Error('Zoom did not reveal the detailed lineage center card');
  }
}

async function loadingBurst(page: Page, identity: CaptureIdentity, screen: string, file: string, tab: string) {
  await fileTab(file, 'Overview')(page);
  await page.locator('.tabs').getByRole('button', { name: tab, exact: true }).click();
  for (let index = 1; index <= 3; index++) {
    await capture(page, identity, screen, `loading-${index}`, true);
    await page.waitForTimeout(150);
  }
  await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 30000 });
  await page.waitForTimeout(1000);
}

async function selectReachableNode(page: Page) {
  if (await page.locator('.full-entity.collapsed').count()) {
    await showEveryEntity(page);
    await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
    await page.getByRole('button', { name: 'Fit model', exact: true }).click();
    await page.waitForTimeout(400);
  }
  const point = await page.locator('.full-entity, .neighborhood-node, .lineage-card:not(.group) .lineage-card-title').evaluateAll(elements => {
    for (const element of elements) {
      const box = element.getBoundingClientRect();
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const top = document.elementFromPoint(point.x, point.y);
      if (top && element.contains(top)) return point;
    }
    return null;
  });
  if (!point) throw new Error('No uncovered entity or card title is visible in the canvas');
  await page.mouse.click(point.x, point.y);
}

async function hoverReachableEdge(page: Page) {
  const point = await page.evaluate(() => {
    for (const path of document.querySelectorAll<SVGPathElement>('.react-flow__edge-interaction')) {
      const matrix = path.getScreenCTM();
      if (!matrix) continue;
      for (const fraction of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        const local = path.getPointAtLength(path.getTotalLength() * fraction);
        const point = new DOMPoint(local.x, local.y).matrixTransform(matrix);
        const hit = document.elementFromPoint(point.x, point.y)?.closest('.react-flow__edge');
        if (hit === path.closest('.react-flow__edge')) return { x: point.x, y: point.y };
      }
    }
    return null;
  });
  if (!point) throw new Error('No uncovered edge point is visible in the canvas');
  await page.mouse.move(point.x, point.y);
}

async function closeSelectedPath(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Selected path', exact: true });
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
}

async function graphControls(page: Page, identity: CaptureIdentity, screen: string) {
  await attempt(page, identity, screen, 'after-fit', () => press(page, /^Fit( model| neighborhood)?$/));
  await attempt(page, identity, screen, 'zoomed-in', () => press(page, 'Zoom in', 7));
  await attempt(page, identity, screen, 'zoomed-minimum', () => press(page, 'Zoom out', 25));
  const fit = page.getByRole('button', { name: /^Fit( model| neighborhood)?$/ });
  if (await fit.count()) await press(page, /^Fit( model| neighborhood)?$/);
  await attempt(page, identity, screen, 'node-selected', () => selectReachableNode(page));
  await closeSelectedPath(page);
  await attempt(page, identity, screen, 'edge-hovered', () => hoverReachableEdge(page));
  await attempt(page, identity, screen, 'labels-on', async () => {
    await viewOptions(page, async options => setShown(options, /^Labels/, true));
  });
  await attempt(page, identity, screen, 'mini-map-on', () => press(page, /^(Show )?Mini.?map/i));
  await attempt(page, identity, screen, 'legend-open', () => press(page, /^Legend/));
  await attempt(page, identity, screen, 'options-open', () => revealGraphControls(page));
  await attempt(page, identity, screen, 'fullscreen', () => press(page, /^(Enter )?Full screen$/i));
  await attempt(page, identity, screen, 'fullscreen-node-selected', async () => {
    await page.locator('.canvas-row.is-fullscreen').waitFor();
    await selectReachableNode(page);
  });
  await closeSelectedPath(page);
  const exit = page.getByRole('button', { name: 'Exit full screen', exact: true });
  if (await exit.isVisible()) await exit.click();
}

async function fullGraph(page: Page, identity: CaptureIdentity) {
  for (const layout of ['network', 'layered'] as const) {
    const screen = `full-graph-${layout}`;
    await loadingBurst(page, identity, screen, 'ubl.ontology.yaml', 'Graph');
    await viewOptions(page, options => chooseLayout(options, layout));
    await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 30000 });
    await capture(page, identity, screen, 'first-view');
    await graphControls(page, identity, screen);
    await attempt(page, identity, screen, 'grouping-menu', async () => {
      await openGroupMenu(page);
    });
    await page.keyboard.press('Escape');
    const labels = await groupingMenuLabels(page);
    for (const label of labels) {
      await attempt(page, identity, screen, `group-${label.toLowerCase().replace(/\W+/g, '-')}`, async () => {
        await chooseGrouping(page, label);
        await page.waitForTimeout(800);
      });
    }
    await attempt(page, identity, screen, 'areas-collapsed', () => press(page, 'Collapse areas'));
    await attempt(page, identity, screen, 'area-expanded', async () => {
      await page.locator('.react-flow__node[data-id^="collapsed:"]').first().click();
    });
    await attempt(page, identity, screen, 'all-areas-expanded', () => press(page, 'Expand all'));
  }
}

async function neighborhood(page: Page, identity: CaptureIdentity) {
  const screen = 'neighborhood';
  await loadingBurst(page, identity, screen, 'mall.ontology.yaml', 'Neighborhood');
  await capture(page, identity, screen, 'first-view');
  for (let walk = 1; walk <= 3; walk++) {
    await attempt(page, identity, screen, `walk-${walk}`, async () => {
      await page
        .locator('.neighborhood-node:not(.center)')
        .nth(walk % 2)
        .click();
    });
  }
  await attempt(page, identity, screen, 'back-after-walk', async () => {
    await page.locator('.walk-trail').getByRole('button', { name: 'Back', exact: true }).click();
  });
  await attempt(page, identity, screen, 'expanded', () => press(page, /^\d+ more neighbors?$/));
  await attempt(page, identity, screen, 'full-pierce', () => press(page, /Full pierce/i));
  await attempt(page, identity, screen, 'expansion-collapsed', () => press(page, /^Undo expansion$/i));
  await graphControls(page, identity, screen);
}

async function lineage(page: Page, identity: CaptureIdentity, dataset: boolean) {
  const screen = dataset ? 'dataset-lineage' : 'contract-lineage';
  if (dataset) {
    await fileTab('mall.odcs.yaml', 'Contract')(page);
    await page.getByRole('button', { name: 'Open properties', exact: true }).click();
    await page.getByRole('tab', { name: 'Lineage', exact: true }).click();
  } else {
    await loadingBurst(page, identity, screen, 'mall.odcs.yaml', 'Graph');
  }
  await page.locator('.lineage-card').first().waitFor();
  await capture(page, identity, screen, 'first-view');
  await attempt(page, identity, screen, 'column-selected', async () => {
    await showLineageColumns(page);
    await page.locator('.lineage-card.center .lineage-row-name').first().click();
  });
  await closeSelectedPath(page);
  for (const hops of [1, 2, 3]) {
    await attempt(page, identity, screen, `hops-${hops}-list`, async () => {
      await page.getByRole('button', { name: `${hops} ${hops === 1 ? 'hop' : 'hops'}`, exact: true }).click();
      await page.getByRole('button', { name: /^Foreign keys \(/ }).click();
    });
    await page.keyboard.press('Escape');
  }
  await attempt(page, identity, screen, 'more-columns', async () => {
    await showLineageColumns(page);
    await page
      .getByRole('button', { name: /^Show all \d+ columns of/ })
      .first()
      .click();
  });
  await attempt(page, identity, screen, 'column-filter', async () => {
    await page
      .getByRole('textbox', { name: /Filter columns/i })
      .first()
      .fill('id');
  });
  await page.keyboard.press('Escape');
  const visited = new Set([await page.locator('.lineage-card.center').getAttribute('data-id')]);
  for (let walk = 1; walk <= 3; walk++) {
    await capture(page, identity, screen, `walk-${walk}-before`);
    const buttons = page.locator('.lineage-card:not(.center):not(.group)').getByRole('button', { name: 'Walk here', exact: true });
    const reachable = await buttons.evaluateAll(
      (elements, visited) =>
        elements.findIndex(element => {
          const id = element.closest('.lineage-card')?.getAttribute('data-id');
          const box = element.getBoundingClientRect();
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return !visited.includes(id ?? '') && !!hit && element.contains(hit);
        }),
      [...visited].filter((id): id is string => !!id),
    );
    await attempt(page, identity, screen, `walk-${walk}-hover`, async () => {
      if (reachable < 0) throw new Error('No uncovered Walk here button in the current canvas');
      await buttons.nth(reachable).hover();
    });
    await attempt(page, identity, screen, `walk-${walk}-after`, async () => {
      if (reachable < 0) throw new Error('No uncovered Walk here button in the current canvas');
      const id = await buttons.nth(reachable).evaluate(element => element.closest('.lineage-card')?.getAttribute('data-id'));
      await buttons.nth(reachable).click();
      if (id) visited.add(id);
    });
  }
  await graphControls(page, identity, screen);
}

async function openGraphStage(page: Page, run: () => Promise<void>) {
  // Each family starts without a modal or full-screen overlay left by a previous capture.
  const workspace = new URL(page.url());
  workspace.hash = '';
  await page.goto(workspace.href);
  await run();
}

/** Captures model, neighborhood, mapping, and ODCS graph stages for one viewport and theme. */
export async function captureGraphStates(page: Page, identity: CaptureIdentity) {
  if (process.env.SW_ONLY === 'neighborhood') {
    await neighborhood(page, identity);
    return;
  }
  await attempt(page, identity, 'full-graph', 'stages', () => fullGraph(page, identity));
  await attempt(page, identity, 'neighborhood', 'stages', () => openGraphStage(page, () => neighborhood(page, identity)));
  for (const dataset of [false, true]) {
    const stage = dataset ? 'dataset-stages' : 'contract-stages';
    await attempt(page, identity, 'lineage', stage, () => openGraphStage(page, () => lineage(page, identity, dataset)));
  }
  await attempt(page, identity, 'mapping-graph', 'stages', () =>
    openGraphStage(page, async () => {
      await loadingBurst(page, identity, 'mapping-graph', 'commerce.mapping.yaml', 'Graph');
      await capture(page, identity, 'mapping-graph', 'first-view');
      await graphControls(page, identity, 'mapping-graph');
    }),
  );
}
