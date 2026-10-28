// Checks that graph edges stay attached to their nodes during browser interactions.
import { appUrl } from './helpers/base-url';
import { chooseLayout, showEveryEntity, viewOptions } from './helpers/graph-options';
import { chromium, expect, type Page } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { inspect } from '../src/core/model';
import { groupRelationships } from '../src/graph/graph-view';
import { LOCAL_READER } from '../src/server/projects/reader';
import { expectModelName } from './helpers/header';
const filename = 'flights.ontology.yaml';
const source = await Bun.file('public/examples/ossie/' + filename).text();
const api = await startIsolatedApi();
await api.ws.importBatch({ files: [{ path: filename, source }] }, LOCAL_READER);
const links = groupRelationships(inspect(source, filename).edges).map(e => ({
  id: e.id,
  source: e.source,
  target: e.target,
}));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
let passed = 0;
await routeApi(page, api);
async function check(name: string, run: () => Promise<void>) {
  await run();
  console.log('PASS', name);
  passed++;
}
async function distances() {
  return page.evaluate(links => {
    const borderDistance = (p: { x: number; y: number }, r: DOMRect) => {
      const outsideX = Math.max(r.left - p.x, 0, p.x - r.right);
      const outsideY = Math.max(r.top - p.y, 0, p.y - r.bottom);
      return outsideX || outsideY
        ? Math.hypot(outsideX, outsideY)
        : Math.min(p.x - r.left, r.right - p.x, p.y - r.top, r.bottom - p.y);
    };
    const result: { id: string; source: number; target: number }[] = [];
    for (const link of links) {
      const edge = [...document.querySelectorAll('.react-flow__edge')].find(
        e => e.getAttribute('data-id') === link.id,
      );
      const path = edge?.querySelector('.react-flow__edge-path') as SVGPathElement | null;
      const node = (id: string) =>
        [...document.querySelectorAll('.react-flow__node')]
          .find(n => n.getAttribute('data-id') === id)
          ?.querySelector('.full-entity');
      const a = node(link.source);
      const b = node(link.target);
      if (!path || !a || !b) continue;
      const m = path.getScreenCTM();
      if (!m) continue;
      const point = (t: number) => {
        const p = path.getPointAtLength(t);
        return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
      };
      result.push({
        id: link.id,
        source: borderDistance(point(0), a.getBoundingClientRect()),
        target: borderDistance(point(path.getTotalLength()), b.getBoundingClientRect()),
      });
    }
    return result;
  }, links);
}
async function attached(label: string) {
  await expect
    .poll(
      async () => {
        const measurements = await distances();
        return measurements.length;
      },
      { timeout: 15000 },
    )
    .toBeGreaterThan(5);
  try {
    await expect
      .poll(async () => Math.max(...(await distances()).flatMap(m => [m.source, m.target])), {
        timeout: 15000,
        message: label + ' SVG endpoints remain on actual rendered entity borders',
      })
      .toBeLessThanOrEqual(4.5);
  } catch (error) {
    console.log(
      'DETACHED_ENDPOINTS',
      JSON.stringify((await distances()).filter(m => m.source > 4.5 || m.target > 4.5)),
    );
    await page.screenshot({ path: '/tmp/edge-attachment-failure.png' });
    throw error;
  }
}
// Resolves once the canvas viewport has stopped moving, so a fit or zoom animation cannot carry a
// node under an overlay between choosing it and clicking it.
async function waitForViewportToSettle() {
  await page.evaluate(
    () =>
      new Promise<void>(resolve => {
        const stillFrames = 10;
        let unchangedFrames = 0;
        let lastTransform = '';
        const watch = () => {
          const viewport = document.querySelector('.react-flow__viewport');
          const transform = viewport ? getComputedStyle(viewport).transform : '';
          unchangedFrames = transform === lastTransform ? unchangedFrames + 1 : 0;
          lastTransform = transform;
          if (unchangedFrames >= stillFrames) resolve();
          else requestAnimationFrame(watch);
        };
        watch();
      }),
  );
}
// Picks a node whose own area is reachable at the click point (its centre) and at the drag point.
// A correct layout may put some nodes under the mini-map, and those cannot be clicked.
async function targetSelector(selector: string) {
  await waitForViewportToSettle();
  const candidates = page.locator(selector);
  for (let i = 0; i < (await candidates.count()); i++) {
    const candidate = candidates.nth(i);
    if (
      await candidate.evaluate(n => {
        const r = n.getBoundingClientRect();
        const points = [
          { x: r.x + r.width / 2, y: r.y + r.height / 2 },
          { x: r.x + Math.min(r.width / 2, 60), y: r.y + Math.min(r.height / 2, 18) },
        ];
        const owner = n.closest('.react-flow__node');
        return points.every(
          point =>
            document.elementFromPoint(point.x, point.y)?.closest('.react-flow__node') === owner,
        );
      })
    )
      return candidate;
  }
  throw Error('No clickable node/area');
}
async function drag(page: Page, selector: string, dx: number, dy: number) {
  const target = await targetSelector(selector);
  await expect(target).toBeVisible();
  const r = await target.boundingBox();
  if (!r) throw Error('Missing drag bounds');
  const x = r.x + Math.min(r.width / 2, 60);
  const y = r.y + Math.min(r.height / 2, 18);
  await page.mouse.move(x, y);
  await page.mouse.down();
  try {
    for (let step = 1; step <= 8; step++) {
      await page.mouse.move(x + (dx * step) / 8, y + (dy * step) / 8);
      await page.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const metrics = await distances();
      const worst = Math.max(...metrics.flatMap(m => [m.source, m.target]));
      if (worst > 4.5) {
        console.log(
          'DURING_DRAG_DETACHED',
          step,
          JSON.stringify(metrics.filter(m => m.source > 4.5 || m.target > 4.5)),
        );
        await page.screenshot({ path: '/tmp/edge-attachment-failure.png' });
      }
      expect(worst, 'Every drag frame endpoint attaches to live entity border').toBeLessThanOrEqual(
        4.5,
      );
      if (step === 7 && selector.includes('businessArea'))
        await page.screenshot({ path: '/tmp/edge-attachment-parent-drag-fixed.png' });
    }
  } finally {
    await page.mouse.up();
  }
  const moved = await target.boundingBox();
  expect(
    Math.hypot(moved!.x - r.x, moved!.y - r.y),
    'Real drag moved the entity/area',
  ).toBeGreaterThan(8);
}

try {
  await page.goto(appUrl());
  await expectModelName(page, /Flights/);
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
  await viewOptions(page, options => chooseLayout(options, 'network'));
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
  // A small pane opens with one card per area; these checks measure entity cards.
  await showEveryEntity(page);
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
  await check('network graph path endpoints attach to actual entity borders', async () => {
    await page.waitForTimeout(450);
    await attached('initial network');
  });
  await check('zoomed worker routes attach after hover and selection', async () => {
    await viewOptions(page, async options => {
      await options.getByLabel('Zoom to group').selectOption({ index: 1 });
    });
    await expect(page.locator('.full-graph-status')).toHaveAttribute('data-routing', 'worker', {
      timeout: 30000,
    });
    await attached('zoomed network');
    await page.getByRole('button', { name: 'Fit model', exact: true }).click();
    await attached('fit before hover');
    const node = await targetSelector('.react-flow__node-entity .full-entity');
    await node.hover();
    await attached('hover');
    await node.click();
    await expect(page.locator('.inspector h2')).toBeVisible();
    await attached('selected');
    await page.getByRole('button', { name: 'Close details', exact: true }).click();
    await attached('closed inspector');
  });
  await check('individual entity dragging preserves endpoints', async () => {
    await drag(page, '.react-flow__node-entity .full-entity', 96, 48);
    await attached('entity drag');
  });
  await check('parent area dragging preserves child edge attachment', async () => {
    await drag(page, '.react-flow__node-businessArea .full-area-title', 96, 48);
    await attached('area drag');
  });
  await check('layered and network layout changes preserve attachment', async () => {
    for (const layout of ['layered', 'network'] as const) {
      await viewOptions(page, options => chooseLayout(options, layout));
      await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
      await attached(layout);
      await drag(page, '.react-flow__node-entity .full-entity', 48, 24);
      await attached(`${layout} after dragging`);
    }
  });
  await page.screenshot({ path: '/tmp/edge-attachment-network.png' });
  await check('browser has no runtime errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} edge attachment UI checks passed`);
} finally {
  await browser.close();
  await api.stop();
}
