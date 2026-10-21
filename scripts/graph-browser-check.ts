import { chromium, expect, type Page } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { neighborhoodEdgeProblems, neighborhoodState, pickCenter } from './helpers/edge-geometry';
import { inspect } from '../src/model';
import { neighborhood, projectModel } from '../src/graph-view';
import { boundedClosure, PIERCE_BUDGET } from '../src/graph/pierce';
import { neighbours, registerSet, canvasOf } from '../src/graph/expansion';
// Real-browser check of the full graph and the neighborhood walk (SC-008; baseline defects 1–9) on the
// UBL, shopping center and 1,000-entity scale models, on an isolated data root. Screenshots of every
// step are written to /tmp/workbench-neighborhood-*.png.
const api = await startIsolatedApi();
for (const id of ['ubl', 'mall', 'commerce-scale']) await api.ws.loadExample(id);
const model = async (folder: string, file: string) =>
  inspect(await Bun.file(`public/examples/${folder}/${file}`).text(), file);
const ubl = await model('ubl', 'ubl.ontology.yaml'),
  mall = await model('mall', 'mall.ontology.yaml'),
  scale = await model('commerce', 'commerce-scale.ttl'),
  owl = await model('ubl', 'ubl.owl.ttl');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
// Defect 6: record any frame in which the empty-state message is shown.
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
  await page
    .getByRole('tree', { name: 'Projects' })
    .getByRole('button', { name: path, exact: true })
    .click();
};
const tab = (name: string) => page.locator('.tabs').getByRole('button', { name, exact: true });
const id = (m: typeof ubl, name: string) => m.entities.find(e => e.name === name)!.id;
// The page's state must equal the projection computed here from the same file.
async function expectState(
  m: typeof ubl,
  center: string,
  keep: string[] = [],
  extra: { limit?: number } = {},
) {
  const n = neighborhood(m.entities, m.edges, { center, keep, ...extra });
  await expect
    .poll(() => neighborhoodState(page))
    .toEqual({ center, shown: n.shown, total: n.total, hidden: n.hidden, nodes: n.shown + 1 });
  return n;
}
// The view fits once nodes are measured (and again when the canvas resizes): poll until it settles.
async function expectCentered() {
  await expect
    .poll(async () => {
      const box = (await page.locator('.react-flow__node.center').boundingBox())!,
        canvas = (await page.locator('.neighborhood-canvas').boundingBox())!;
      return (
        Math.abs(box.x + box.width / 2 - (canvas.x + canvas.width / 2)) < canvas.width * 0.06 &&
        box.y > canvas.y &&
        box.y + box.height < canvas.y + canvas.height
      );
    })
    .toBe(true);
}
const shot = (name: string) => page.screenshot({ path: `/tmp/workbench-neighborhood-${name}.png` });
try {
  await routeApi(page, api);
  await page.goto(process.env.UI_URL ?? 'http://127.0.0.1:5173/');
  await check(
    'full graph keeps all 45 UBL entities and 277 relationships; area zoom and layered layout',
    async () => {
      await openFile('ubl.ontology.yaml');
      await tab('Graph').click();
      await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
      await page.getByRole('button', { name: 'Fit model', exact: true }).click();
      await expect(page.locator('.full-graph-status')).toHaveAttribute('data-entity-count', '45');
      await expect(page.locator('.full-graph-status')).toHaveAttribute(
        'data-relationship-count',
        '277',
      );
      await page.screenshot({ path: '/tmp/real-graph-network.png' });
      await page.getByLabel('Graph layout').selectOption('layered');
      await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
      await page.screenshot({ path: '/tmp/real-graph-layered.png' });
    },
  );
  const walked: string[] = [];
  await check(
    'UBL: the picker ranks the exact match first; Order is centered with incoming left and outgoing right',
    async () => {
      await tab('Neighborhood').click();
      await page.getByRole('textbox', { name: 'Find a center' }).fill('order');
      await expect(
        page.getByRole('listbox', { name: 'Center candidates' }).getByRole('option').first(),
      ).toContainText('Order');
      await page
        .getByRole('listbox', { name: 'Center candidates' })
        .getByRole('option')
        .first()
        .click();
      const n = await expectState(ubl, id(ubl, 'Order'));
      walked.push(n.center!);
      await expectCentered();
      const canvasMid = (await page.locator('.react-flow__node.center').boundingBox())!.x;
      for (const i of n.incoming)
        expect(
          (await page.locator(`.react-flow__node[data-id="${i}"]`).boundingBox())!.x,
        ).toBeLessThan(canvasMid);
      for (const o of n.outgoing)
        expect(
          (await page.locator(`.react-flow__node[data-id="${o}"]`).boundingBox())!.x,
        ).toBeGreaterThan(canvasMid);
      expect(await neighborhoodEdgeProblems(page)).toEqual([]);
      await shot('ubl-step0');
    },
  );
  await check(
    'UBL: five steps across relationships (the last by keyboard), each with the right center, counts, origin and trail; no edge shares a path',
    async () => {
      for (let step = 1; step <= 5; step++) {
        const previous = walked.at(-1)!,
          n = neighborhood(ubl.entities, ubl.edges, {
            center: previous,
            keep: walked.length > 1 ? [walked.at(-2)!] : [],
          });
        const next = n.entities.slice(1).find(e => !walked.includes(e.id))!;
        const walkButton = page.getByRole('button', { name: `Walk to ${next.name}`, exact: true });
        if (step === 5) {
          await walkButton.focus();
          await page.keyboard.press('Enter');
        } else await walkButton.click();
        await expectState(ubl, next.id, [previous]);
        walked.push(next.id);
        await expect(page.locator(`.react-flow__node.origin[data-id="${previous}"]`)).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Walk' }).locator('ol li')).toHaveCount(
          step + 1,
        );
        await expect(
          page.getByRole('navigation', { name: 'Walk' }).locator('[aria-current=step]'),
        ).toHaveText(next.name);
        await expectCentered();
        expect(await neighborhoodEdgeProblems(page)).toEqual([]);
        await shot(`ubl-step${step}`);
      }
    },
  );
  await check(
    'UBL: Back five times returns through every center to Order; Forward moves again',
    async () => {
      for (let step = 4; step >= 0; step--) {
        await page.getByRole('button', { name: 'Back', exact: true }).click();
        await expect.poll(async () => (await neighborhoodState(page)).center).toBe(walked[step]);
      }
      await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: 'Forward', exact: true }).click();
      await expect.poll(async () => (await neighborhoodState(page)).center).toBe(walked[1]);
    },
  );
  await check(
    'UBL: links between neighbors can be shown and hidden; labels never overlap',
    async () => {
      const toggle = page.getByRole('button', { name: /^Links between neighbors/ });
      const before = await page.locator('.neighborhood-canvas .react-flow__edge').count();
      await toggle.click();
      await expect
        .poll(() => page.locator('.neighborhood-canvas .react-flow__edge').count())
        .not.toBe(before);
      await page.getByRole('button', { name: 'Labels off', exact: true }).click();
      expect(await neighborhoodEdgeProblems(page)).toEqual([]);
      await shot('ubl-labels');
      await page.getByRole('button', { name: 'Labels on', exact: true }).click();
      await toggle.click();
    },
  );
  await check(
    'UBL: toolbar search offers results; the chosen one stays the center after the search is cleared',
    async () => {
      await page.getByPlaceholder('Find an entity…').fill('Invoice');
      const results = page.getByRole('region', { name: 'Search results' });
      await expect(results.getByRole('option').first()).toContainText('Invoice');
      await results.getByRole('button').first().click();
      await expect(page.getByPlaceholder('Find an entity…')).toHaveValue('');
      await expect
        .poll(async () => (await neighborhoodState(page)).center)
        .toBe(id(ubl, 'Invoice'));
    },
  );
  await check(
    'UBL OWL: the classes-only projection holds with and without a center; technical resources only on request',
    async () => {
      await openFile('ubl.owl.ttl');
      await tab('Neighborhood').click();
      const kinds = () =>
        page.locator('.neighborhood-canvas .react-flow__node .node small').allTextContents();
      await expect.poll(async () => (await kinds()).length).toBeGreaterThan(1);
      expect((await kinds()).every(k => k.includes('OWL class'))).toBe(true);
      await page.locator('.neighborhood-canvas .walk-button').first().click();
      await page.waitForTimeout(300);
      expect((await kinds()).every(k => k.includes('OWL class'))).toBe(true);
      const technical = page.getByRole('button', { name: /^Technical resources hidden/ });
      await expect(technical).toBeVisible();
      await technical.click();
      await expect(
        page.getByRole('button', { name: 'Technical resources shown', exact: true }),
      ).toBeVisible();
      await shot('owl');
    },
  );
  await check(
    'shopping center: Property with its metric indicator; the indicator opens the metric list for Property',
    async () => {
      await openFile('mall.ontology.yaml');
      await tab('Neighborhood').click();
      await pickCenter(page, 'Property');
      await expectState(mall, id(mall, 'Property'));
      await expectCentered();
      expect(await neighborhoodEdgeProblems(page)).toEqual([]);
      await shot('mall');
      await page.getByRole('button', { name: /^Open \d+ metrics for Property$/ }).click();
      await expect(page.getByRole('textbox', { name: 'Find a metric' })).toHaveValue('Property');
      await expect(page.getByRole('region', { name: 'Metrics' })).toContainText('Occupancy rate');
    },
  );
  await check(
    'shopping center: the walk continues into the mapping file that maps Property, and Back returns to the ontology',
    async () => {
      await tab('Neighborhood').click();
      await expect
        .poll(async () => (await neighborhoodState(page)).center)
        .toBe(id(mall, 'Property'));
      await page.getByRole('button', { name: /Continue in mall\.mapping\.yaml/ }).click();
      await expect(page.locator('h1')).toContainText('mappings');
      await expect(page.locator('.react-flow__node.center')).toContainText('Property');
      await expect(
        page.getByRole('navigation', { name: 'Walk' }).locator('[aria-current=step]'),
      ).toHaveText('Property');
      await expect(page.getByRole('navigation', { name: 'Walk' })).toContainText(
        'same definition →',
      );
      await shot('mall-mapping');
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await expect(page.locator('h1')).toContainText('Shopping center administration ontology');
      await expect
        .poll(async () => (await neighborhoodState(page)).center)
        .toBe(id(mall, 'Property'));
    },
  );
  await check(
    '1,000 entities: searchable picker, hidden neighbors revealed on request',
    async () => {
      await openFile('commerce-scale.ttl');
      await tab('Neighborhood').click();
      const start = performance.now();
      await pickCenter(page, 'Customer 10000');
      await expectState(scale, id(scale, 'Customer 10000'));
      const options = await page
        .getByRole('textbox', { name: 'Find a center' })
        .evaluate(() => document.querySelectorAll('#center-picker-results li').length);
      expect(options).toBe(0);
      const n = neighborhood(scale.entities, scale.edges, { center: id(scale, 'Customer 10000') });
      if (n.hidden) {
        await page.getByRole('button', { name: /^\d+ more neighbors?$/ }).click();
        await expectState(scale, id(scale, 'Customer 10000'), [], { limit: 24 });
      }
      await expectCentered();
      expect(await neighborhoodEdgeProblems(page)).toEqual([]);
      await shot('scale');
      console.log(`  center chosen and laid out in ${Math.round(performance.now() - start)} ms`);
    },
  );
  // Pierce through (T047; FR-018–FR-024, SC-010, SC-011).
  const nodeIds = () =>
    page
      .locator('.neighborhood-canvas .react-flow__node')
      .evaluateAll(ns => ns.map(n => n.getAttribute('data-id')!).sort());
  const nodePositions = () =>
    page
      .locator('.neighborhood-canvas .react-flow__node')
      .evaluateAll(ns =>
        Object.fromEntries(
          ns.map(n => [n.getAttribute('data-id'), (n as HTMLElement).style.transform]),
        ),
      );
  const node = (m: typeof ubl, name: string) =>
    page.locator(`.neighborhood-canvas .react-flow__node[data-id="${id(m, name)}"]`);
  // The canvas the app must show, computed here from the file with the same pure functions.
  const ublProjection = projectModel(ubl.entities, ubl.edges);
  const expectedCanvas = (
    m: typeof ubl,
    center: string,
    steps: { expand?: string; collapse?: string }[],
  ) => {
    const p = projectModel(m.entities, m.edges),
      base = neighborhood(m.entities, m.edges, { center: id(m, center) }).entities.map(e => e.id),
      sets: any[] = [],
      by = new Map<string, any>();
    for (const s of steps) {
      if (s.expand) {
        const n = neighbours(p.edges, id(m, s.expand), 'both');
        const set = registerSet({
          kind: 'expand',
          from: id(m, s.expand),
          direction: 'both',
          nodes: n.nodes,
          edges: n.edges,
          frontier: {},
          total: 0,
          budget: 0,
        });
        sets.push(set);
        by.set(s.expand, set);
      }
      if (s.collapse)
        sets.push(
          registerSet({
            kind: 'collapse',
            from: id(m, s.collapse),
            target: by.get(s.collapse).id,
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
  await check(
    'UBL Order: expand OrderLine, LineItem and Item in place; placed nodes never move; the chain to Item and Price is on one canvas; the trail records each expansion',
    async () => {
      await openFile('ubl.ontology.yaml');
      await tab('Neighborhood').click();
      await pickCenter(page, 'Order');
      await expectState(ubl, id(ubl, 'Order'));
      const done: { expand?: string }[] = [];
      for (const name of ['OrderLine', 'LineItem', 'Item']) {
        const before = await nodePositions();
        await node(ubl, name)
          .getByRole('button', { name: `Expand ${name}` })
          .click();
        done.push({ expand: name });
        await expect.poll(nodeIds).toEqual(expectedCanvas(ubl, 'Order', done));
        const after = await nodePositions();
        for (const [k, v] of Object.entries(before)) expect(after[k], `${k} moved`).toBe(v);
        await expect(page.getByRole('navigation', { name: 'Walk' })).toContainText(
          `expanded ${name}`,
        );
      }
      for (const name of ['Order', 'OrderLine', 'LineItem', 'Item', 'Price'])
        await expect(node(ubl, name)).toHaveCount(1);
      await shot('expanded-chain');
    },
  );
  await check(
    'UBL: Collapse on Item removes only what expanding Item alone added; Undo expansion and Forward restore the exact canvas',
    async () => {
      const before = await nodePositions(),
        ids = await nodeIds();
      await node(ubl, 'Item').getByRole('button', { name: 'Collapse Item' }).click();
      await expect
        .poll(nodeIds)
        .toEqual(
          expectedCanvas(ubl, 'Order', [
            { expand: 'OrderLine' },
            { expand: 'LineItem' },
            { expand: 'Item' },
            { collapse: 'Item' },
          ]),
        );
      await page.getByRole('button', { name: 'Undo expansion' }).click();
      await expect.poll(nodeIds).toEqual(ids);
      expect(await nodePositions()).toEqual(before);
      await page
        .getByRole('navigation', { name: 'Walk' })
        .getByRole('button', { name: 'Forward' })
        .click();
      await expect
        .poll(nodeIds)
        .toEqual(
          expectedCanvas(ubl, 'Order', [
            { expand: 'OrderLine' },
            { expand: 'LineItem' },
            { expand: 'Item' },
            { collapse: 'Item' },
          ]),
        );
      // activating a relationship line expands its far end in place (FR-024); Walk here still re-centres
      await page.getByRole('button', { name: 'Walk to OrderLine' }).click();
      await expectState(ubl, id(ubl, 'OrderLine'), [id(ubl, 'Order')]);
    },
  );
  await check(
    'shopping center Lease, Outgoing: Full pierce adds every entity reachable from Lease once; the status gives shown entities and steps',
    async () => {
      await openFile('mall.ontology.yaml');
      await tab('Neighborhood').click();
      await pickCenter(page, 'Lease');
      const lease = id(mall, 'Lease'),
        p = projectModel(mall.entities, mall.edges),
        r = boundedClosure(p.entities, p.edges, [lease], {
          direction: 'out',
          valueTypes: true,
          technical: false,
          metrics: true,
          budget: PIERCE_BUDGET,
        });
      await page
        .getByRole('radiogroup', { name: 'Pierce direction' })
        .getByRole('radio', { name: 'Outgoing' })
        .click();
      await page.getByRole('button', { name: 'Full pierce' }).click();
      const status = page.locator('.pierce-banner');
      await expect(status).toContainText(`${r.shown} entities shown in ${r.maxStep} steps`);
      const ids = await nodeIds();
      for (const n of r.nodes) expect(ids).toContain(n);
      expect(new Set(ids).size).toBe(ids.length);
      await shot('pierce-lease');
    },
  );
  await check(
    '1,000 entities, Both: Full pierce stops at the 150-node budget with frontier markers and "N more reachable"; Expand further grows it; input stays responsive',
    async () => {
      await openFile('commerce-scale.ttl');
      await tab('Neighborhood').click();
      const p = projectModel(scale.entities, scale.edges),
        start = (await neighborhoodState(page)).center!;
      const r = boundedClosure(p.entities, p.edges, [start], {
        direction: 'both',
        valueTypes: true,
        technical: false,
        metrics: true,
        budget: PIERCE_BUDGET,
      });
      await page.evaluate(() => {
        (window as any).__long = 0;
        new PerformanceObserver(l => {
          for (const e of l.getEntries())
            (window as any).__long = Math.max((window as any).__long, e.duration);
        }).observe({ type: 'longtask', buffered: false });
      });
      await page
        .getByRole('radiogroup', { name: 'Pierce direction' })
        .getByRole('radio', { name: 'Both' })
        .click();
      await page.getByRole('button', { name: 'Full pierce' }).click();
      const status = page.locator('.pierce-banner');
      await expect(status).toContainText(`${r.total - r.shown} more reachable`, { timeout: 20000 });
      await expect(page.locator('.frontier-marker').first()).toBeVisible();
      expect(
        Number(await page.locator('.neighborhood-canvas').getAttribute('data-canvas-nodes')),
      ).toBeGreaterThanOrEqual(r.shown);
      await shot('pierce-budget');
      const long = await page.evaluate(() => (window as any).__long);
      console.log(`  longest main-thread task during pierce: ${long.toFixed(0)} ms`);
      expect(long).toBeLessThanOrEqual(100);
      await status.getByRole('button', { name: 'Expand further' }).click();
      const r2 = boundedClosure(p.entities, p.edges, [start], {
        direction: 'both',
        valueTypes: true,
        technical: false,
        metrics: true,
        budget: 2 * PIERCE_BUDGET,
      });
      await expect(page.locator('.pierce-banner')).toContainText(
        `${r2.total - r2.shown} more reachable`,
        { timeout: 20000 },
      );
    },
  );
  await check(
    'no empty-state flash on any center or document change; no browser errors',
    async () => {
      expect(await page.evaluate(() => (window as any).__emptySeen)).toBe(0);
      expect(errors).toEqual([]);
    },
  );
  console.log(`${passed} graph and neighborhood checks passed on isolated data root ${api.root}.`);
} finally {
  await browser.close();
  await api.stop();
}
