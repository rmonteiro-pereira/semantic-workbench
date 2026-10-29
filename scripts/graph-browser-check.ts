// Checks graph navigation and rendering at multiple scales in an isolated browser workspace.
import { appUrl } from './helpers/base-url';
import { recordResizeErrors } from './helpers/resize-errors';
import { checkExpansionViewports } from './graph-expansion-checks';
import { chooseLayout, setShown, viewOptions } from './helpers/graph-options';
import { chromium, expect } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { neighborhoodCardProblems } from './helpers/card-geometry';
import { neighborhoodEdgeProblems, neighborhoodState, pickCenter } from './helpers/edge-geometry';
import { inspect } from '../src/shared/core/model';
import { neighborhood, projectModel } from '../src/app/graph/graph-view';
import { boundedClosure, PIERCE_BUDGET } from '../src/app/graph/pierce';
import { neighbours, registerSet, canvasOf } from '../src/app/graph/expansion';
import { expectModelName } from './helpers/header';
// Real-browser check of the full graph and the neighborhood walk on the UBL, shopping center and
// 1,000-entity scale models, on an isolated data root. Screenshots of every step are written to
// /tmp/workbench-neighborhood-*.png.
const api = await startIsolatedApi();
for (const id of ['ubl', 'mall', 'commerce-scale']) await api.ws.loadExample(id);
const model = async (folder: string, file: string) => inspect(await Bun.file(`public/examples/${folder}/${file}`).text(), file);
const ubl = await model('ubl', 'ubl.ontology.yaml');
const mall = await model('mall', 'mall.ontology.yaml');
const scale = await model('commerce', 'commerce-scale.ttl');
await model('ubl', 'ubl.owl.ttl');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', message => {
  if ((message.type() === 'error' && !/Failed to load resource/.test(message.text())) || (message.type() === 'warning' && message.text().includes('[React Flow]'))) {
    errors.push(message.text());
  }
});
await recordResizeErrors(page, message => errors.push(message));
// Record any frame in which the empty-state message is shown.
await page.addInitScript(() => {
  (window as any).__emptySeen = 0;
  new MutationObserver(() => {
    if (document.querySelector('.neighborhood-canvas .graph-empty')) (window as any).__emptySeen++;
  }).observe(document, { subtree: true, childList: true });
});
let passed = 0;
async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}
const openFile = async (path: string) => {
  await page.getByRole('tree', { name: 'Projects' }).getByRole('button', { name: path, exact: true }).click();
};
const tab = (name: string) => page.locator('.tabs').getByRole('button', { name, exact: true });
const id = (m: typeof ubl, name: string) => m.entities.find(e => e.name === name)!.id;
// The page's state must equal the projection computed here from the same file.
async function expectState(entityModel: typeof ubl, center: string, keep: string[] = [], extra: { limit?: number } = {}) {
  const view = neighborhood(entityModel.entities, entityModel.edges, { center, keep, ...extra });
  await expect
    .poll(() => neighborhoodState(page))
    .toEqual({
      center,
      shown: view.shown,
      total: view.total,
      hidden: view.hidden,
      nodes: view.shown + 1,
    });
  return view;
}
// The view fits once nodes are measured (and again when the canvas resizes): poll until it
// settles.
async function expectCentered() {
  await expect
    .poll(async () => {
      const box = (await page.locator('.react-flow__node.center').boundingBox())!;
      const canvas = (await page.locator('.neighborhood-canvas').boundingBox())!;
      return Math.abs(box.x + box.width / 2 - (canvas.x + canvas.width / 2)) < canvas.width * 0.06 && box.y > canvas.y && box.y + box.height < canvas.y + canvas.height;
    })
    .toBe(true);
}
const shot = (name: string) => page.screenshot({ path: `/tmp/workbench-neighborhood-${name}.png` });
try {
  await routeApi(page, api);
  await page.goto(appUrl());
  await check('full graph keeps all 45 UBL entities and 277 relationships; area zoom and layered layout', async () => {
    await openFile('ubl.ontology.yaml');
    await tab('Graph').click();
    await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
    await page.getByRole('button', { name: 'Fit model', exact: true }).click();
    await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '45');
    await expect(page.locator('.full-graph-status')).toHaveAttribute('data-relationship-count', '277');
    // The first view names every entity in the Network layout; no area is folded into a count.
    await expect(page.locator('.full-graph-status strong')).toHaveCount(0);
    await expect(page.locator('.full-graph .react-flow__node-entity')).toHaveCount(45);
    await viewOptions(page, async options => {
      await expect(
        options.getByRole('radiogroup', { name: 'Graph layout' }).getByRole('radio', {
          name: 'Network',
          exact: true,
        }),
      ).toBeChecked();
    });
    await page.screenshot({ path: '/tmp/real-graph-network.png' });
    await viewOptions(page, async options => {
      await chooseLayout(options, 'layered');
    });
    await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
    await page.screenshot({ path: '/tmp/real-graph-layered.png' });
    await viewOptions(page, async options => {
      await chooseLayout(options, 'network');
    });
    await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
    await page.screenshot({ path: '/tmp/real-graph-network.png' });
  });
  await check('full graph: the mini-map is off until switched on, and the choice is remembered', async () => {
    const miniMap = page.locator('.react-flow__minimap');
    await expect(miniMap).toHaveCount(0);
    await viewOptions(page, async options => {
      await setShown(options, 'Mini-map', true);
    });
    await expect(miniMap).toBeVisible();
    await page.reload();
    await openFile('ubl.ontology.yaml');
    await tab('Graph').click();
    await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
    await expect(miniMap).toBeVisible();
    await viewOptions(page, async options => {
      await setShown(options, 'Mini-map', false);
    });
    await expect(miniMap).toHaveCount(0);
  });
  const walked: string[] = [];
  await check('UBL: the picker ranks the exact match first; Order is centered with incoming left and outgoing right', async () => {
    await tab('Neighborhood').click();
    await page.getByRole('textbox', { name: 'Find a center' }).fill('order');
    await expect(page.getByRole('listbox', { name: 'Center candidates' }).getByRole('option').first()).toContainText('Order');
    await page.getByRole('listbox', { name: 'Center candidates' }).getByRole('option').first().click();
    const view = await expectState(ubl, id(ubl, 'Order'));
    walked.push(view.center!);
    await expectCentered();
    const canvasMid = (await page.locator('.react-flow__node.center').boundingBox())!.x;
    for (const incomingId of view.incoming) expect((await page.locator(`.react-flow__node[data-id="${incomingId}"]`).boundingBox())!.x).toBeLessThan(canvasMid);
    for (const outgoingId of view.outgoing) expect((await page.locator(`.react-flow__node[data-id="${outgoingId}"]`).boundingBox())!.x).toBeGreaterThan(canvasMid);
    expect(await neighborhoodEdgeProblems(page)).toEqual([]);
    await shot('ubl-step0');
  });
  await check('UBL: five steps across relationships (the last by keyboard), each with the right center, counts, origin and trail; no edge shares a path', async () => {
    for (let step = 1; step <= 5; step++) {
      const previous = walked.at(-1)!;
      const view = neighborhood(ubl.entities, ubl.edges, {
        center: previous,
        keep: walked.length > 1 ? [walked.at(-2)!] : [],
      });
      const next = view.entities.slice(1).find(e => !walked.includes(e.id))!;
      const walkButton = page.getByRole('button', { name: `Walk to ${next.name}`, exact: true });
      if (step === 5) {
        await walkButton.focus();
        await page.keyboard.press('Enter');
      } else await walkButton.click();
      await expectState(ubl, next.id, [previous]);
      walked.push(next.id);
      await expect(page.locator(`.react-flow__node.origin[data-id="${previous}"]`)).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Walk' }).locator('ol li')).toHaveCount(step + 1);
      await expect(page.getByRole('navigation', { name: 'Walk' }).locator('[aria-current=step]')).toHaveText(next.name);
      await expectCentered();
      expect(await neighborhoodEdgeProblems(page)).toEqual([]);
      await shot(`ubl-step${step}`);
    }
  });
  await check('UBL: Back five times returns through every center to Order; Forward moves again', async () => {
    for (let step = 4; step >= 0; step--) {
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect.poll(async () => (await neighborhoodState(page)).center).toBe(walked[step]);
    }
    // Back is the workspace's Back: past the first center it still undoes earlier actions.
    await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Forward', exact: true }).click();
    await expect.poll(async () => (await neighborhoodState(page)).center).toBe(walked[1]);
  });
  await check('UBL: links between neighbors can be shown and hidden; labels never overlap', async () => {
    const toggleLinks = () =>
      viewOptions(page, async options => {
        await options.getByRole('button', { name: /^Links between neighbors/ }).click();
      });
    const showLabels = (shown: boolean) => viewOptions(page, options => setShown(options, 'Labels', shown));
    const before = await page.locator('.neighborhood-canvas .react-flow__edge').count();
    await toggleLinks();
    await expect.poll(() => page.locator('.neighborhood-canvas .react-flow__edge').count()).not.toBe(before);
    await showLabels(true);
    expect(await neighborhoodEdgeProblems(page)).toEqual([]);
    await shot('ubl-labels');
    await showLabels(false);
    await toggleLinks();
  });
  await check('UBL: toolbar search offers results; the chosen one stays the center after the search is cleared', async () => {
    await page.getByPlaceholder('Find an entity…').fill('Invoice');
    const results = page.getByRole('region', { name: 'Search results' });
    await expect(results.getByRole('option').first()).toContainText('Invoice');
    await results.getByRole('button').first().click();
    await expect(page.getByPlaceholder('Find an entity…')).toHaveValue('');
    await expect.poll(async () => (await neighborhoodState(page)).center).toBe(id(ubl, 'Invoice'));
  });
  await check('UBL Party: nine clicks of Show all connected leave one trail step; cards are whole, apart, labelled in words, and no edge crosses a card', async () => {
    await openFile('ubl.ontology.yaml');
    await tab('Neighborhood').click();
    await pickCenter(page, 'Party');
    await page.getByRole('radiogroup', { name: 'Pierce direction' }).getByRole('radio', { name: 'Both' }).click();
    const trail = page.getByRole('navigation', { name: 'Walk' });
    const steps = trail.locator('ol li');
    const stepsBefore = await steps.count();
    const pierce = page.getByRole('button', { name: 'Show all connected' });
    for (let click = 0; click < 9; click++) {
      await pierce.click();
      await expect(pierce).toBeEnabled();
    }
    await expect(page.locator('.neighborhood-canvas')).toHaveAttribute('data-viewport-ready', 'true');
    await page.waitForTimeout(500);
    await expect(trail.getByRole('button', { name: 'All connected to Party' })).toHaveCount(1);
    await expect(trail).not.toContainText('pierced');
    expect(await steps.count()).toBeLessThanOrEqual(stepsBefore + 1);
    const kinds = await page.locator('.neighborhood-canvas .react-flow__node .node > small').allTextContents();
    expect(kinds.some(kind => kind.includes('Entity type'))).toBe(true);
    expect(kinds.some(kind => kind.includes('EntityType'))).toBe(false);
    expect(await neighborhoodCardProblems(page)).toEqual([]);
  });
  await check('UBL OWL: the classes-only projection holds with and without a center; technical resources only on request', async () => {
    await openFile('ubl.owl.ttl');
    await tab('Neighborhood').click();
    const kinds = () => page.locator('.neighborhood-canvas .react-flow__node .node small').allTextContents();
    await expect.poll(async () => (await kinds()).length).toBeGreaterThan(1);
    expect((await kinds()).every(k => k.includes('OWL class'))).toBe(true);
    await page.locator('.neighborhood-canvas .walk-button').first().click();
    await page.waitForTimeout(300);
    expect((await kinds()).every(k => k.includes('OWL class'))).toBe(true);
    await viewOptions(page, async options => {
      const technical = options.getByRole('button', { name: /^Technical resources/ });
      await expect(technical).toHaveAttribute('aria-pressed', 'false');
      await setShown(options, /^Technical resources/, true);
    });
    await shot('owl');
  });
  await check('shopping center: Property with its metric indicator; the indicator opens the metric list for Property', async () => {
    await openFile('mall.ontology.yaml');
    await tab('Neighborhood').click();
    await pickCenter(page, 'Property');
    await expectState(mall, id(mall, 'Property'));
    await expectCentered();
    expect(await neighborhoodEdgeProblems(page)).toEqual([]);
    await shot('mall');
    const metricBadge = page.getByRole('button', {
      name: /^Open \d+ metrics for Property$/,
    });
    // The fitted view keeps the indicator; zooming in is not needed to see it.
    await expect(metricBadge).toBeVisible();
    await metricBadge.click();
    await expect(page.getByRole('textbox', { name: 'Find a metric' })).toHaveValue('Property');
    await expect(page.getByRole('region', { name: 'Metrics' })).toContainText('Occupancy rate');
  });
  await check('shopping center: the walk continues into the mapping file that maps Property, and Back returns to the ontology', async () => {
    await tab('Neighborhood').click();
    await expect.poll(async () => (await neighborhoodState(page)).center).toBe(id(mall, 'Property'));
    await page.getByRole('button', { name: /Continue in mall\.mapping\.yaml/ }).click();
    await expectModelName(page, /mappings/);
    await expect(page.locator('.react-flow__node.center')).toContainText('Property');
    await expect(page.getByRole('navigation', { name: 'Walk' }).locator('[aria-current=step]')).toHaveText('Property');
    await expect(page.getByRole('navigation', { name: 'Walk' })).toContainText('same definition →');
    await shot('mall-mapping');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expectModelName(page, /Shopping center administration ontology/);
    await expect.poll(async () => (await neighborhoodState(page)).center).toBe(id(mall, 'Property'));
  });
  await check('1,000 entities: searchable picker, hidden neighbors revealed on request', async () => {
    await openFile('commerce-scale.ttl');
    await tab('Neighborhood').click();
    const start = performance.now();
    await pickCenter(page, 'Customer 10000');
    await expectState(scale, id(scale, 'Customer 10000'));
    const options = await page.getByRole('textbox', { name: 'Find a center' }).evaluate(() => document.querySelectorAll('#center-picker-results li').length);
    expect(options).toBe(0);
    const view = neighborhood(scale.entities, scale.edges, {
      center: id(scale, 'Customer 10000'),
    });
    if (view.hidden) {
      await page.getByRole('button', { name: /^\d+ more neighbors?$/ }).click();
      await expectState(scale, id(scale, 'Customer 10000'), [], { limit: 24 });
    }
    await expectCentered();
    expect(await neighborhoodEdgeProblems(page)).toEqual([]);
    await shot('scale');
    console.log(`  center chosen and laid out in ${Math.round(performance.now() - start)} ms`);
  });

  const nodeIds = () => page.locator('.neighborhood-canvas .react-flow__node').evaluateAll(ns => ns.map(n => n.getAttribute('data-id')!).sort());
  // Every node on the canvas, including those scrolled off screen: large canvases render only the
  // visible part, so the DOM alone can miss nodes that are there.
  const canvasIds = async () => ((await page.locator('.neighborhood-canvas').getAttribute('data-canvas-ids')) ?? '').split(' ').filter(Boolean).sort();
  const nodePositions = () =>
    page.locator('.neighborhood-canvas .react-flow__node').evaluateAll(ns => Object.fromEntries(ns.map(n => [n.getAttribute('data-id'), (n as HTMLElement).style.transform])));
  const node = (m: typeof ubl, name: string) => page.locator(`.neighborhood-canvas .react-flow__node[data-id="${id(m, name)}"]`);
  // The canvas the app must show, computed here from the file with the same pure functions.
  const expectedCanvas = (entityModel: typeof ubl, center: string, steps: { expand?: string; collapse?: string }[]) => {
    const projection = projectModel(entityModel.entities, entityModel.edges);
    const base = neighborhood(entityModel.entities, entityModel.edges, { center: id(entityModel, center) }).entities.map(e => e.id);
    const sets: any[] = [];
    const by = new Map<string, any>();
    for (const step of steps) {
      if (step.expand) {
        const expansion = neighbours(projection.edges, id(entityModel, step.expand), 'both');
        const set = registerSet({
          kind: 'expand',
          from: id(entityModel, step.expand),
          direction: 'both',
          nodes: expansion.nodes,
          edges: expansion.edges,
          frontier: {},
          total: 0,
          budget: 0,
        });
        sets.push(set);
        by.set(step.expand, set);
      }
      if (step.collapse)
        sets.push(
          registerSet({
            kind: 'collapse',
            from: id(entityModel, step.collapse),
            target: by.get(step.collapse).id,
            direction: 'both',
            nodes: [],
            edges: [],
            frontier: {},
            total: 0,
            budget: 0,
          }),
        );
    }
    return canvasOf(base, sets).nodes.sort();
  };
  await check('UBL Order: expand OrderLine, LineItem and Item in place; placed nodes never move; the chain to Item and Price is on one canvas; the trail records each expansion', async () => {
    await openFile('ubl.ontology.yaml');
    await tab('Neighborhood').click();
    await pickCenter(page, 'Order');
    await expectState(ubl, id(ubl, 'Order'));
    const done: { expand?: string }[] = [];
    for (const name of ['OrderLine', 'LineItem', 'Item']) {
      await expect(page.locator('.neighborhood-canvas')).toHaveAttribute('data-viewport-ready', 'true');
      const before = await nodePositions();
      await node(ubl, name)
        .getByRole('button', { name: `Expand ${name}` })
        .click();
      done.push({ expand: name });
      await expect.poll(nodeIds).toEqual(expectedCanvas(ubl, 'Order', done));
      await expect(page.locator('.neighborhood-canvas')).toHaveAttribute('data-viewport-ready', 'true');
      const after = await nodePositions();
      for (const [key, value] of Object.entries(before)) expect(after[key], `${key} moved`).toBe(value);
      await expect(page.getByRole('navigation', { name: 'Walk' })).toContainText(`expanded ${name}`);
    }
    for (const name of ['Order', 'OrderLine', 'LineItem', 'Item', 'Price']) await expect(node(ubl, name)).toHaveCount(1);
    await shot('expanded-chain');
  });
  await check('UBL: Collapse on Item removes only what expanding Item alone added; Undo expansion and Forward restore the exact canvas', async () => {
    const before = await nodePositions();
    const ids = await nodeIds();
    await node(ubl, 'Item').getByRole('button', { name: 'Collapse Item' }).click();
    await expect.poll(nodeIds).toEqual(expectedCanvas(ubl, 'Order', [{ expand: 'OrderLine' }, { expand: 'LineItem' }, { expand: 'Item' }, { collapse: 'Item' }]));
    await page.getByRole('button', { name: 'Undo expansion' }).click();
    await expect.poll(nodeIds).toEqual(ids);
    await expect(page.locator('.neighborhood-canvas')).toHaveAttribute('data-viewport-ready', 'true');
    expect(await nodePositions()).toEqual(before);
    await page.getByRole('navigation', { name: 'Walk' }).getByRole('button', { name: 'Forward' }).click();
    await expect.poll(nodeIds).toEqual(expectedCanvas(ubl, 'Order', [{ expand: 'OrderLine' }, { expand: 'LineItem' }, { expand: 'Item' }, { collapse: 'Item' }]));
    // Activating a relationship line expands its far end in place; Walk here still re-centres.
    await page.getByRole('button', { name: 'Walk to OrderLine' }).click();
    await expectState(ubl, id(ubl, 'OrderLine'), [id(ubl, 'Order')]);
  });
  await check('shopping center Lease, Outgoing: Show all connected adds every entity reachable from Lease once; the status gives shown entities and steps', async () => {
    await openFile('mall.ontology.yaml');
    await tab('Neighborhood').click();
    await pickCenter(page, 'Lease');
    const lease = id(mall, 'Lease');
    const projection = projectModel(mall.entities, mall.edges);
    const closure = boundedClosure(projection.entities, projection.edges, [lease], {
      direction: 'out',
      valueTypes: true,
      technical: false,
      metrics: true,
      budget: PIERCE_BUDGET,
    });
    await page.getByRole('radiogroup', { name: 'Pierce direction' }).getByRole('radio', { name: 'Outgoing' }).click();
    await page.getByRole('button', { name: 'Show all connected' }).click();
    const status = page.locator('.pierce-banner');
    await expect(status).toContainText(`${closure.shown} entities shown in ${closure.maxStep} steps`);
    const ids = await canvasIds();
    for (const node of closure.nodes) expect(ids).toContain(node);
    expect(new Set(ids).size).toBe(ids.length);
    await shot('pierce-lease');
  });
  await check('1,000 entities, Both: Show all connected stops at the 150-node budget with frontier markers and "N more reachable"; Expand further grows it; input stays responsive', async () => {
    await openFile('commerce-scale.ttl');
    await tab('Neighborhood').click();
    const projection = projectModel(scale.entities, scale.edges);
    const start = (await neighborhoodState(page)).center!;
    const closure = boundedClosure(projection.entities, projection.edges, [start], {
      direction: 'both',
      valueTypes: true,
      technical: false,
      metrics: true,
      budget: PIERCE_BUDGET,
    });
    await page.evaluate(() => {
      (window as any).__long = 0;
      new PerformanceObserver(l => {
        for (const e of l.getEntries()) (window as any).__long = Math.max((window as any).__long, e.duration);
      }).observe({ type: 'longtask', buffered: false });
    });
    await page.getByRole('radiogroup', { name: 'Pierce direction' }).getByRole('radio', { name: 'Both' }).click();
    await page.getByRole('button', { name: 'Show all connected' }).click();
    const status = page.locator('.pierce-banner');
    await expect(status).toContainText(`${closure.total - closure.shown} more reachable`, { timeout: 20000 });
    await expect(page.locator('.frontier-marker').first()).toBeVisible();
    expect(Number(await page.locator('.neighborhood-canvas').getAttribute('data-canvas-nodes'))).toBeGreaterThanOrEqual(closure.shown);
    await shot('pierce-budget');
    const long = await page.evaluate(() => (window as any).__long);
    console.log(`  longest main-thread task during pierce: ${long.toFixed(0)} ms`);
    expect(long).toBeLessThanOrEqual(100);
    await status.getByRole('button', { name: 'Expand further' }).click();
    const furtherClosure = boundedClosure(projection.entities, projection.edges, [start], {
      direction: 'both',
      valueTypes: true,
      technical: false,
      metrics: true,
      budget: 2 * PIERCE_BUDGET,
    });
    await expect(page.locator('.pierce-banner')).toContainText(`${furtherClosure.total - furtherClosure.shown} more reachable`, { timeout: 20000 });
  });
  await check('no empty-state flash on any center or document change; no browser errors', async () => {
    expect(await page.evaluate(() => (window as any).__emptySeen)).toBe(0);
    expect(errors).toEqual([]);
  });
  await checkExpansionViewports(browser, api);
  console.log(`${passed} graph and neighborhood checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}
