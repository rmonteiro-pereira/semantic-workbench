// Checks responsive layouts, overlays and navigation in an isolated browser workspace.
import { appUrl } from './helpers/base-url';
import { viewOptions } from './helpers/graph-options';
import { LOCAL_READER } from '../server/projects/reader';
import { chromium, expect, type Locator, type Page } from '@playwright/test';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { treeRowProblems } from './helpers/tree-geometry';
import { neighborhoodEdgeProblems, neighborhoodState, pickCenter } from './helpers/edge-geometry';
import { inspect } from '../src/model';
import { layoutProblems, lineageProblems } from './helpers/layout-geometry';
import { screenProblems, showScreen, tourScreens } from './helpers/screen-tour';

// Isolated API fixture: exercising viewport changes never modifies the local workspace. The UBL
// ontology is imported first so that it opens first.
const api = await startIsolatedApi();
await api.ws.importBatch(
  {
    files: [
      {
        path: 'ubl.ontology.yaml',
        source: await Bun.file('public/examples/ubl/ubl.ontology.yaml').text(),
      },
    ],
  },
  LOCAL_READER,
);
await api.ws.importBatch(
  {
    files: await Promise.all(
      ['commerce.odcs.yaml', 'sales.ossie.yaml'].map(async path => ({
        path,
        source: await Bun.file(`public/examples/commerce/${path}`).text(),
      })),
    ),
  },
  LOCAL_READER,
);
// A long file name for the sidebar's two-line names.
await api.ws.importBatch(
  {
    files: [
      {
        path: 'customer-orders-invoices-and-payments-reconciliation-for-regional-warehouses.ossie.yaml',
        source: 'name: Long names\nontology:\n  - concept: Customer\n    type: EntityType\n',
      },
    ],
  },
  LOCAL_READER,
);
const ublModel = inspect(
  await Bun.file('public/examples/ubl/ubl.ontology.yaml').text(),
  'ubl.ontology.yaml',
);
const name40 = ublModel.entities.find(e => e.id === 'ontology/40')!.name;
const centerOf = async (page: Page) => (await neighborhoodState(page)).center;
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
let passed = 0;
// RESPONSIVE_ONLY runs only the checks whose names start with it (the mutation harness uses it).
const only = process.env.RESPONSIVE_ONLY;
async function check(name: string, action: () => Promise<void>) {
  if (only && !name.startsWith(only)) return;
  await action();
  console.log('PASS', name);
  passed++;
}
async function openPage(width: number, height: number) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', error => errors.push(`${width}×${height}: ${error.message}`));
  await routeApi(page, api);
  // Mutants for the mutation harness: a status line back over the mini-map and controls, and
  // status messages that never dismiss by themselves.
  if (process.env.RESPONSIVE_MUTATION === 'overlay') {
    await page.addInitScript(() =>
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent =
          '.full-graph-status{position:absolute!important;left:0!important;right:0!important;bottom:0!important;z-index:30!important}';
        document.head.append(style);
      }),
    );
    console.log('INJECTED_OVERLAY_MUTATION');
  }
  if (process.env.RESPONSIVE_MUTATION === 'small-text') {
    await page.addInitScript(() =>
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '.workspace-label{font-size:9px!important}';
        document.head.append(style);
      }),
    );
    console.log('INJECTED_SMALL_TEXT_MUTATION');
  }
  if (process.env.RESPONSIVE_MUTATION === 'status-stays')
    await page.route('**/src/main.tsx*', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const anchor = 'const timer = setTimeout(() => setMessage(""), 5e3);';
      if (!source.includes(anchor)) throw Error('Status mutation anchor missing');
      console.log('INJECTED_STATUS_MUTATION');
      await route.fulfill({ response, body: source.replace(anchor, 'const timer = 0;') });
    });
  await page.goto(appUrl());
  await expect(page.locator('h1')).toContainText('UBL');
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.react-flow__node-entity').first()).toBeVisible();
  return page;
}
async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(size.document).toBeLessThanOrEqual(size.viewport + 1);
}
async function visibleGraph(page: Page) {
  const canvas = page.locator('.react-flow');
  await expect(canvas).toBeVisible();
  await expect
    .poll(
      async () =>
        page.locator('.react-flow__node').evaluateAll(nodes => {
          const parent = document.querySelector('.react-flow')!.getBoundingClientRect();
          return nodes.filter(node => {
            const rect = node.getBoundingClientRect();
            return (
              rect.width > 1 &&
              rect.height > 1 &&
              rect.right > parent.left &&
              rect.left < parent.right &&
              rect.bottom > parent.top &&
              rect.top < parent.bottom
            );
          }).length;
        }),
      { timeout: 15_000, message: 'At least one measured graph node intersects the actual canvas' },
    )
    .toBeGreaterThan(0);
}
async function clickVisibleEdge(page: Page) {
  let point: { x: number; y: number } | null = null;
  await expect
    .poll(
      async () => {
        point = await page.locator('.react-flow__edge-interaction').evaluateAll(paths => {
          for (const element of paths) {
            const path = element as SVGPathElement;
            const transform = path.getScreenCTM();
            if (!transform) continue;
            for (let sample = 1; sample < 30; sample++) {
              const local = path.getPointAtLength((path.getTotalLength() * sample) / 30);
              const x = transform.a * local.x + transform.c * local.y + transform.e;
              const y = transform.b * local.x + transform.d * local.y + transform.f;
              if (
                document.elementFromPoint(x, y)?.closest('.react-flow__edge') ===
                path.closest('.react-flow__edge')
              )
                return { x, y };
            }
          }
          return null;
        });
        return !!point;
      },
      { timeout: 10000, message: 'Relationship hit area becomes accessible after fit animation' },
    )
    .toBe(true);
  await page.mouse.click(point!.x, point!.y);
}
try {
  for (const [width, height] of [
    [1280, 720],
    [1366, 768],
    [1920, 1080],
    [2560, 1440],
    [1024, 768],
    [390, 844],
  ]) {
    const page = await openPage(width!, height!);
    const desktop = width! >= 1100;
    await check(
      `${width}×${height}: compact shell, graph real estate and contained controls`,
      async () => {
        const header = await page.locator('main > header.workspace-header').boundingBox();
        expect(header).not.toBeNull();
        expect(header!.height).toBeLessThanOrEqual(desktop ? 64 : 110);
        const graph = await page.locator('.react-flow').boundingBox();
        expect(graph).not.toBeNull();
        expect(graph!.height).toBeGreaterThan(height! * (desktop ? 0.7 : 0.55));
        expect(graph!.width).toBeGreaterThan(desktop ? width! * 0.5 : width! * 0.7);
        await noOverflow(page);
        await visibleGraph(page);
        await expect(
          page.getByRole('button', {
            name: desktop ? 'Hide sidebar' : 'Open workspace',
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({ path: `/tmp/workbench-responsive-${width}x${height}.png` });
      },
    );
    await check(
      `${width}×${height}: workspace toggle preserves graph and document access`,
      async () => {
        const before = (await page.locator('.react-flow').boundingBox())!.width;
        // On desktop one toggle hides and shows the sidebar; below 1100 px the header button opens
        // the drawer. Examples is a collapsed group once projects exist.
        if (desktop) {
          await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
          await expect
            .poll(async () => (await page.locator('.react-flow').boundingBox())!.width)
            .toBeGreaterThan(before + 150);
        }
        await page
          .getByRole('button', { name: desktop ? 'Show sidebar' : 'Open workspace', exact: true })
          .click();
        await expect(
          page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }),
        ).toBeInViewport();
        await expect(page.getByRole('group', { name: 'Examples' })).toBeVisible();
        await expect(page.locator('input[type=file]')).toHaveCount(1);
        // Project tree rows: name, delete icon and menu stay side by side at every viewport.
        await expect(
          page.getByRole('button', { name: 'Delete ubl.ontology.yaml', exact: true }),
        ).toBeVisible();
        expect(await treeRowProblems(page)).toEqual([]);
        if (width === 390)
          await page.screenshot({ path: '/tmp/workbench-responsive-drawer-390.png' });
        if (desktop) await page.getByRole('button', { name: 'Hide sidebar', exact: true }).click();
        else await page.keyboard.press('Escape');
        await expect(
          page.getByRole('button', {
            name: desktop ? 'Show sidebar' : 'Open workspace',
            exact: true,
          }),
        ).toBeVisible();
        await visibleGraph(page);
        await noOverflow(page);
      },
    );
    await check(
      `${width}×${height}: neighborhood center, inspector and repeated view transitions work`,
      async () => {
        await page
          .locator('.tabs')
          .getByRole('button', { name: 'Neighborhood', exact: true })
          .click();
        await pickCenter(page, name40);
        await expect.poll(() => centerOf(page)).toBe('ontology/40');
        await expect.poll(() => neighborhoodEdgeProblems(page)).toEqual([]);
        await viewOptions(page, async options => {
          await options.getByRole('button', { name: 'Labels off', exact: true }).click();
        });
        await expect.poll(() => neighborhoodEdgeProblems(page)).toEqual([]);
        await viewOptions(page, async options => {
          await options.getByRole('button', { name: 'Labels on', exact: true }).click();
        });
        if (width === 1280)
          await page.screenshot({ path: '/tmp/workbench-responsive-neighborhood-1280.png' });
        const focused = page.locator('.react-flow__node[data-id="ontology/40"]');
        await expect(focused).toBeVisible();
        await visibleGraph(page);
        await expect
          .poll(async () => {
            const bounds = await focused.boundingBox();
            return bounds ? Math.min(bounds.width, bounds.height) : 0;
          })
          .toBeGreaterThan(10);
        await expect(page.locator('.inspector h2')).toBeInViewport();
        if (!desktop)
          await page.getByRole('button', { name: 'Close details', exact: true }).click();
        const neighbor = page.locator('.react-flow__node:not([data-id="ontology/40"])').first();
        const neighborId = await neighbor.getAttribute('data-id');
        await neighbor.click();
        await expect.poll(() => centerOf(page)).toBe(neighborId);
        await expect.poll(() => neighborhoodEdgeProblems(page)).toEqual([]);
        await expect(page.locator('.inspector h2')).toBeInViewport();
        await page.getByRole('button', { name: 'Close details', exact: true }).click();
        await expect(page.locator('.inspector')).toHaveCount(0);
        for (let index = 0; index < 3; index++) {
          await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
          await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
          await visibleGraph(page);
          await page
            .locator('.tabs')
            .getByRole('button', { name: 'Neighborhood', exact: true })
            .click();
          await visibleGraph(page);
        }
        await noOverflow(page);
      },
    );
    if (desktop)
      await check(
        `${width}×${height}: relationship inspection closes and restores canvas width`,
        async () => {
          const before = (await page.locator('.react-flow').boundingBox())!.width;
          await clickVisibleEdge(page);
          await expect(page.locator('.inspector h2')).toBeInViewport();
          await expect(page.locator('.relationship-details')).toBeVisible();
          await page.getByRole('button', { name: 'Close details', exact: true }).click();
          await expect(page.locator('.inspector')).toHaveCount(0);
          await expect
            .poll(async () => (await page.locator('.react-flow').boundingBox())!.width)
            .toBeGreaterThanOrEqual(before - 1);
        },
      );
    await page.close();
  }
  const page = await openPage(1920, 1080);
  await check(
    'overview-selected entity becomes neighborhood center and survives desktop resizing',
    async () => {
      await page.locator('.tabs').getByRole('button', { name: 'Overview', exact: true }).click();
      await page.locator('[data-entity-id="ontology/40"]').click();
      await page.getByRole('button', { name: 'Neighborhood', exact: true }).last().click();
      await expect.poll(() => centerOf(page)).toBe('ontology/40');
      await expect(page.locator('.react-flow__node[data-id="ontology/40"]')).toBeVisible();
      await page.getByRole('button', { name: 'Close details', exact: true }).click();
      for (const [width, height] of [
        [1280, 720],
        [2560, 1440],
        [1366, 768],
      ]) {
        await page.setViewportSize({ width: width!, height: height! });
        await visibleGraph(page);
        await noOverflow(page);
        await expect.poll(() => centerOf(page)).toBe('ontology/40');
        await expect.poll(() => neighborhoodEdgeProblems(page)).toEqual([]);
      }
    },
  );
  await page.close();
  // Full screen: Graph and Neighborhood fill the screen, details open over the graph, and Escape
  // (or the exit control) restores the earlier layout, zoom and selection.
  const transform = (p: Page) =>
    p
      .locator('.react-flow__viewport')
      .first()
      .evaluate(el => getComputedStyle(el).transform);
  const fsPage = await openPage(1440, 900);
  await check(
    'full screen: Graph fills the screen, details overlay it, Escape restores zoom and selection',
    async () => {
      await fsPage.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
      await expect(fsPage.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
      await fsPage.getByRole('button', { name: 'Fit model' }).click();
      await fsPage.mouse.move(700, 500);
      await fsPage.mouse.wheel(0, -240);
      await expect.poll(() => transform(fsPage)).not.toBe('none');
      await fsPage.waitForTimeout(400);
      const before = await transform(fsPage);
      await fsPage.getByRole('button', { name: 'Enter full screen' }).click();
      await expect(fsPage.locator('.canvas-row.is-fullscreen')).toBeVisible();
      await expect
        .poll(async () => {
          const b = (await fsPage.locator('.canvas-row').boundingBox())!;
          return Math.round(b.width) >= 1438 && Math.round(b.height) >= 898;
        })
        .toBe(true);
      await expect.poll(() => transform(fsPage)).not.toBe(before);
      await fsPage.locator('.react-flow__node-entity').first().click();
      const inspector = fsPage.locator('.inspector');
      await expect(inspector).toBeVisible();
      const selectedName = await fsPage.locator('.inspector h2').textContent();
      // Details and the graph share the full-screen width so the panel cannot cover graph
      // controls.
      const graphBox = (await fsPage.locator('.react-flow').boundingBox())!;
      const detailsBox = (await inspector.boundingBox())!;
      expect(graphBox.width).toBeGreaterThan(1000);
      expect(graphBox.x + graphBox.width).toBeLessThanOrEqual(detailsBox.x + 1);
      expect(graphBox.width + detailsBox.width).toBeGreaterThan(1400);
      expect(await layoutProblems(fsPage)).toEqual([]);
      await fsPage.screenshot({ path: '/tmp/workbench-fullscreen-graph.png' });
      await fsPage.keyboard.press('Escape');
      await expect(fsPage.locator('.canvas-row.is-fullscreen')).toHaveCount(0);
      await expect.poll(() => transform(fsPage), { timeout: 3000 }).toBe(before);
      await expect(fsPage.locator('.inspector h2')).toHaveText(selectedName!);
      await fsPage.getByRole('button', { name: 'Close details', exact: true }).click();
    },
  );
  await check(
    'full screen: the F key works in Neighborhood, and the exit control restores the view',
    async () => {
      await fsPage
        .locator('.tabs')
        .getByRole('button', { name: 'Neighborhood', exact: true })
        .click();
      await pickCenter(fsPage, name40);
      await expect.poll(() => centerOf(fsPage)).toBe('ontology/40');
      await fsPage.waitForTimeout(400);
      const before = await transform(fsPage);
      await fsPage.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await fsPage.keyboard.press('f');
      await expect(fsPage.locator('.canvas-row.is-fullscreen')).toBeVisible();
      await expect.poll(() => neighborhoodEdgeProblems(fsPage)).toEqual([]);
      await fsPage.screenshot({ path: '/tmp/workbench-fullscreen-neighborhood.png' });
      await fsPage.getByRole('button', { name: 'Exit full screen' }).click();
      await expect(fsPage.locator('.canvas-row.is-fullscreen')).toHaveCount(0);
      await expect.poll(() => transform(fsPage), { timeout: 3000 }).toBe(before);
      await expect.poll(() => centerOf(fsPage)).toBe('ontology/40');
      // Full screen belongs to the graph views: other tabs have no control and F does nothing
      // there.
      await fsPage.locator('.tabs').getByRole('button', { name: 'Catalog', exact: true }).click();
      await expect(fsPage.getByRole('button', { name: 'Enter full screen' })).toHaveCount(0);
      await fsPage.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await fsPage.keyboard.press('f');
      await expect(fsPage.locator('.canvas-row.is-fullscreen')).toHaveCount(0);
    },
  );
  await fsPage.close();
  // Resize sweep: every view reflows across the viewport matrix and on resize between sizes, with
  // no horizontal page scroll and no control cut off.
  const sweep = await openPage(1440, 900);
  const sizes: [number, number][] = [
    [2560, 1440],
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [1024, 768],
    [800, 900],
    [390, 844],
    [1440, 900],
  ];
  async function tab(p: Page, name: string) {
    if (!(await p.locator('.tabs').isVisible())) return;
    await p.locator('.tabs').getByRole('button', { name, exact: true }).click();
  }
  // Makes the sidebar reachable. Right after a resize the page may still show the other layout,
  // so wait for the one that matches the viewport before deciding what to click.
  async function showSidebar(p: Page) {
    const open = p.getByRole('button', { name: 'Open workspace', exact: true });
    if ((p.viewportSize()?.width ?? 1440) < 1100) {
      await expect(open).toBeVisible();
      await open.click();
      return;
    }
    await expect(open).toHaveCount(0);
    // The desktop sidebar can be hidden by an earlier check; its state persists per browser.
    const show = p.getByRole('button', { name: 'Show sidebar', exact: true });
    if (await show.isVisible()) await show.click();
  }
  async function sidebarNav(p: Page, name: RegExp) {
    await showSidebar(p);
    await p.getByRole('button', { name }).click();
  }
  async function openFile(p: Page, path: string) {
    await showSidebar(p);
    await p.getByRole('button', { name: path, exact: true }).click();
  }
  const views: [string, (p: Page) => Promise<void>][] = [
    [
      'Graph',
      async p => {
        await openFile(p, 'ubl.ontology.yaml');
        await tab(p, 'Graph');
        await expect(p.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
      },
    ],
    ['Neighborhood', async p => tab(p, 'Neighborhood')],
    ['Overview', async p => tab(p, 'Overview')],
    ['Catalog', async p => tab(p, 'Catalog')],
    ['Source', async p => tab(p, 'Source')],
    ['Mappings', async p => tab(p, 'Mappings')],
    [
      'Metrics',
      async p => {
        await openFile(p, 'sales.ossie.yaml');
        await p
          .locator('.tabs')
          .getByRole('button', { name: /^Metrics/ })
          .click();
      },
    ],
    [
      'Contract',
      async p => {
        await openFile(p, 'commerce.odcs.yaml');
        await tab(p, 'Contract');
        await expect(p.getByRole('region', { name: 'Contract overview' })).toBeVisible();
      },
    ],
    [
      'Dataset page',
      async p => {
        await p.getByRole('button', { name: 'Open orders', exact: true }).click();
        await expect(p.getByRole('region', { name: 'Dataset orders' })).toBeVisible();
      },
    ],
    [
      'Lineage',
      async p => {
        await openFile(p, 'commerce.odcs.yaml');
        await tab(p, 'Graph');
        await expect(
          p.getByRole('region', { name: 'Lineage graph' }).locator('.lineage-card').first(),
        ).toBeVisible({ timeout: 10_000 });
      },
    ],
    [
      'Source control',
      async p => {
        await sidebarNav(p, /^Source control/);
        await expect(p.getByRole('region', { name: 'Source Control' })).toBeVisible();
      },
    ],
  ];
  for (const [view, show] of views) {
    await check(
      `resize sweep: ${view} reflows at every size without horizontal scroll or cut-off controls`,
      async () => {
        await sweep.setViewportSize({ width: 1440, height: 900 });
        await show(sweep);
        const found: string[] = [];
        for (const [width, height] of sizes) {
          await sweep.setViewportSize({ width, height });
          await sweep.waitForTimeout(250);
          for (const problem of await layoutProblems(sweep))
            found.push(`${width}×${height}: ${problem}`);
          // Review screenshots at the four reference sizes (phone, small laptop, laptop, wide
          // screen).
          if ([390, 1280, 1440, 2560].includes(width))
            await sweep.screenshot({
              path: `/tmp/workbench-sweep-${view.toLowerCase().replace(/ /g, '-')}-${width}.png`,
            });
        }
        expect(found).toEqual([]);
      },
    );
  }
  // Overlaps: floating overlays never cover each other or a control, in every view, at the six
  // supported viewports, with and without the inspector. Popovers stay anchored below their
  // control and inside the viewport; area titles stay inside their area.
  const overlays = [
    '.react-flow__minimap',
    '.full-graph-status',
    '.graph-bundle-choice',
    'main > .status',
    '.full-graph-tools',
    '.neighborhood-tools',
    '.inspector',
  ];
  const six: [number, number][] = [
    [1280, 720],
    [1366, 768],
    [1920, 1080],
    [2560, 1440],
    [1024, 768],
    [390, 844],
  ];
  await check(
    'roles: person menu and disabled control explanations fit every viewport',
    async () => {
      for (const [width, height] of six) {
        const page = await browser.newPage({ viewport: { width, height } });
        try {
          await routeApi(page, api, async route => {
            const path = new URL(route.request().url()).pathname;
            if (path === '/api/me') {
              await route.fulfill({
                json: {
                  mode: 'server',
                  name: 'Viewer with a long display name',
                  verifiedEmail: 'viewer@example.org',
                  csrf: 'geometry-only',
                  roles: { workspace: ['viewer'], projects: {} },
                  roleNames: { viewer: 'Viewer' },
                  can: {},
                  requires: { commit: 'Requires Editor' },
                  creationDomains: [],
                },
              });
              return true;
            }
            if (path === '/api/projects') {
              const projects = await api.ws.listProjects(LOCAL_READER);
              await route.fulfill({
                json: projects.map(project => ({
                  ...project,
                  actions: ['read', 'history', 'viewOwnState'],
                })),
              });
              return true;
            }
            return false;
          });
          await page.goto(appUrl());
          const commit = page.getByRole('button', { name: /^Commit/ }).first();
          await expect(commit).toBeDisabled();
          await expect(commit).toHaveAttribute('title', /Requires Editor/);
          await commit.hover({ force: true });
          await page.getByRole('button', { name: 'Person menu', exact: true }).click();
          expect(await layoutProblems(page)).toEqual([]);
          const menu = page.getByRole('menu');
          await expect(menu).toBeVisible();
          const bounds = await menu.boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height + 1);
        } finally {
          await page.close();
        }
      }
    },
  );
  // A workspace drawer left open by a narrow size would cover the page after resizing.
  const closeDrawer = async (p: Page) => {
    if (await p.locator('#workspace-sidebar[role=dialog]').count())
      await p.keyboard.press('Escape');
  };
  const closeDetails = async (p: Page) => {
    const close = p.getByRole('button', { name: 'Close details', exact: true });
    if (await close.count()) await close.first().click();
  };
  // Below 1100 px the selected path is a dialog opened from the "Selected path" button in the walk
  // row; from 1100 px it is a panel beside the canvas and the button does not exist.
  const pathButton = (graph: Locator) => graph.getByRole('button', { name: /^Selected path/ });
  const pathInDialog = (p: Page) => p.viewportSize()!.width < 1100;
  async function showSelectedPath(graph: Locator, p: Page) {
    if (pathInDialog(p)) {
      await expect(pathButton(graph)).toBeVisible();
      await pathButton(graph).click();
      const dialog = p.getByRole('dialog', { name: 'Selected path' });
      await expect(dialog.getByRole('region', { name: 'Selected path' })).toBeVisible();
      return;
    }
    await expect(pathButton(graph)).toHaveCount(0);
    await expect(graph.getByRole('region', { name: 'Selected path' })).toBeVisible();
  }
  async function hideSelectedPath(graph: Locator, p: Page) {
    if (pathInDialog(p)) await p.getByRole('button', { name: 'Done', exact: true }).click();
  }
  async function clearSelectedPath(graph: Locator, p: Page) {
    if (pathInDialog(p)) {
      await pathButton(graph).click();
      await p.getByRole('button', { name: 'Clear path', exact: true }).click();
      return;
    }
    await graph.getByRole('button', { name: 'Clear the selected path' }).click();
  }
  // Lineage cards and canvas: at the four reference sizes, with and without a selected path.
  await check(
    'lineage: cards, rows, badges, pager and toolbar fit; cards never overlap; the canvas stays usable beside the path panel',
    async () => {
      const found: string[] = [];
      await sweep.setViewportSize({ width: 1440, height: 900 });
      await openFile(sweep, 'commerce.odcs.yaml');
      await tab(sweep, 'Graph');
      const graph = sweep.getByRole('region', { name: 'Lineage graph' });
      for (const [width, height] of [
        [390, 844],
        [1280, 720],
        [1440, 900],
        [2560, 1440],
      ] as const) {
        await closeDrawer(sweep);
        await sweep.setViewportSize({ width, height });
        await sweep.waitForTimeout(300);
        await graph.getByRole('button', { name: 'Fit' }).click();
        await sweep.waitForTimeout(300);
        for (const problem of await lineageProblems(sweep))
          found.push(`${width}×${height}: ${problem}`);
        await graph
          .getByRole('group', { name: 'Contract object orders' })
          .getByRole('button', { name: 'orders.amount', exact: true })
          .click({ force: true });
        await showSelectedPath(graph, sweep);
        for (const problem of await layoutProblems(sweep))
          found.push(`${width}×${height} with the path open: ${problem}`);
        await hideSelectedPath(graph, sweep);
        await sweep.waitForTimeout(300);
        for (const problem of await lineageProblems(sweep))
          found.push(`${width}×${height} with a path: ${problem}`);
        for (const problem of await layoutProblems(sweep))
          found.push(`${width}×${height} with a path: ${problem}`);
        await sweep.screenshot({ path: `/tmp/workbench-lineage-path-${width}.png` });
        await clearSelectedPath(graph, sweep);
      }
      expect(found).toEqual([]);
    },
  );
  // Opens the inspector on an entity where the view allows selecting one.
  const details: Record<string, (p: Page) => Promise<void>> = {
    Graph: async p => {
      await p.locator('.react-flow__node-entity').first().click();
    },
    Neighborhood: async p => {
      await p.locator('.react-flow__node').last().click();
    },
    Overview: async p => {
      await p.locator('.area-entities button').first().click();
    },
    Catalog: async p => {
      await p.locator('.catalog-card > button').first().click();
    },
  };
  async function overlapProblems(p: Page, where: string) {
    const found = (await layoutProblems(p, { overlays })).filter(problem =>
      problem.startsWith('overlay '),
    );
    return found.map(problem => `${where}: ${problem}`);
  }
  for (const [view, show] of views) {
    await check(
      `overlaps: ${view} has no overlay over another overlay or a control at the six viewports, with and without details`,
      async () => {
        await sweep.setViewportSize({ width: 1440, height: 900 });
        await closeDrawer(sweep);
        await show(sweep);
        const found: string[] = [];
        for (const [width, height] of six) {
          await sweep.setViewportSize({ width, height });
          await closeDrawer(sweep);
          await closeDetails(sweep);
          await sweep.waitForTimeout(250);
          found.push(...(await overlapProblems(sweep, `${width}×${height}`)));
          if (details[view]) {
            // The workspace drawer covers the page on narrow screens; close it before selecting.
            await details[view](sweep);
            await expect(sweep.locator('.inspector')).toBeVisible();
            await sweep.waitForTimeout(250);
            found.push(...(await overlapProblems(sweep, `${width}×${height} with details`)));
            if (width === 1280 || width === 390)
              await sweep.screenshot({
                path: `/tmp/workbench-overlap-${view.toLowerCase().replace(/ /g, '-')}-${width}.png`,
              });
            await closeDetails(sweep);
          }
        }
        expect(found).toEqual([]);
      },
    );
  }
  await check(
    'overlaps: the graph bundle selector, status line, mini-map and zoom controls stay apart at the six viewports',
    async () => {
      await sweep.setViewportSize({ width: 1440, height: 900 });
      await closeDrawer(sweep);
      await openFile(sweep, 'ubl.ontology.yaml');
      await tab(sweep, 'Graph');
      await expect(sweep.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
      // Labels are turned on and areas collapsed, so a bundled connection (its label counts its
      // relationships) can be selected to show the bundle selector.
      await viewOptions(sweep, async options => {
        const labels = options.getByRole('button', { name: /^Labels (off|on)$/ });
        if ((await labels.textContent())?.includes('off')) await labels.click();
        // The mini-map is off by default; it is turned on so the overlap checks cover it.
        await options.getByRole('button', { name: 'Map off', exact: true }).click();
        await options.getByRole('button', { name: 'Collapse areas', exact: true }).click();
      });
      await expect(sweep.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60_000 });
      await sweep.getByRole('button', { name: 'Fit model', exact: true }).click();
      await sweep.waitForTimeout(450);
      // Click a visible point of an edge labelled "N relationships" (a bundled connection).
      const point = await sweep.locator('.react-flow__edge').evaluateAll(edges => {
        for (const edge of edges) {
          if (!/\d+ relationships/.test(edge.textContent ?? '')) continue;
          const path = edge.querySelector('.react-flow__edge-interaction') as SVGPathElement | null;
          const m = path?.getScreenCTM();
          if (!path || !m) continue;
          for (let i = 1; i < 30; i++) {
            const local = path.getPointAtLength((path.getTotalLength() * i) / 30);
            const x = m.a * local.x + m.c * local.y + m.e;
            const y = m.b * local.x + m.d * local.y + m.f;
            if (document.elementFromPoint(x, y)?.closest('.react-flow__edge') === edge)
              return { x, y };
          }
        }
        return null;
      });
      expect(point).not.toBeNull();
      await sweep.mouse.click(point!.x, point!.y);
      await expect(sweep.locator('.graph-bundle-choice')).toBeVisible();
      const found: string[] = [];
      for (const [width, height] of six) {
        await sweep.setViewportSize({ width, height });
        await sweep.waitForTimeout(250);
        if (await sweep.locator('.graph-bundle-choice').isVisible())
          found.push(...(await overlapProblems(sweep, `${width}×${height}`)));
        else found.push(`${width}×${height}: bundle selector not visible`);
        if (width === 390 || width === 1280)
          await sweep.screenshot({ path: `/tmp/workbench-overlap-bundle-${width}.png` });
      }
      await closeDetails(sweep);
      await viewOptions(sweep, async options => {
        await options.getByRole('button', { name: 'Expand all', exact: true }).click();
      });
      expect(found).toEqual([]);
    },
  );
  await check(
    'overlaps: business-area titles stay inside their area and long names keep a tooltip',
    async () => {
      const found: string[] = [];
      for (const [width, height] of [
        [1280, 720],
        [390, 844],
      ] as const) {
        await sweep.setViewportSize({ width, height });
        await sweep.getByRole('button', { name: 'Fit model', exact: true }).click();
        await sweep.waitForTimeout(450);
        expect(await sweep.locator('.full-area-title').count()).toBeGreaterThan(0);
        found.push(
          ...(await sweep.locator('.full-area-title').evaluateAll(
            (titles, size) =>
              titles.flatMap(title => {
                const node = title.closest('.react-flow__node')!.getBoundingClientRect();
                const box = title.getBoundingClientRect();
                const name = title.querySelector('strong')!;
                const out: string[] = [];
                if (box.left < node.left - 1 || box.right > node.right + 1)
                  out.push(`${size}: area title "${name.textContent}" spills out of its area`);
                if (name.scrollWidth > name.clientWidth + 1 && !title.closest('[title]'))
                  out.push(`${size}: area title "${name.textContent}" is cut without a tooltip`);
                return out;
              }),
            `${width}×${height}`,
          )),
        );
      }
      expect(found).toEqual([]);
    },
  );
  await check(
    'popovers: the grouping details stay anchored below their control and inside the viewport',
    async () => {
      const found: string[] = [];
      for (const [width, height] of six) {
        await sweep.setViewportSize({ width, height });
        await sweep.waitForTimeout(250);
        const summary = sweep
          .getByRole('button', { name: 'Grouping details' })
          .or(sweep.locator('summary[aria-label="Grouping details"]'))
          .first();
        await summary.click();
        const pop = sweep.locator('.grouping-details[open]');
        await expect(pop).toBeVisible();
        const s = (await sweep.locator('summary[aria-label="Grouping details"]').boundingBox())!;
        const b = (await pop.boundingBox())!;
        const header = (await sweep.locator('main > header.workspace-header').boundingBox())!;
        if (b.left < -1 || b.right > width + 1 || b.bottom > height + 1)
          found.push(`${width}×${height}: grouping details outside the viewport`);
        if (b.top < header.y + header.height - 1)
          found.push(`${width}×${height}: grouping details cover the header`);
        if (b.top < s.y - 1)
          found.push(`${width}×${height}: grouping details open above their control`);
        if (width === 390)
          await sweep.screenshot({ path: '/tmp/workbench-grouping-popover-390.png' });
        await sweep.locator('summary[aria-label="Grouping details"]').click();
        await expect(pop).toHaveCount(0);
      }
      expect(found).toEqual([]);
    },
  );
  const lineageOverlays = [
    '.lineage-toolbar',
    '.lineage-trail',
    '.lineage-busy',
    '.lineage-path',
    '.lineage-foot',
    '.lineage-stage .react-flow__minimap',
  ];
  async function assertContained(p: Page, selector: string) {
    for (const element of await p.locator(selector).all()) {
      if (!(await element.isVisible())) continue;
      await expect(element).toBeInViewport({ ratio: 1 });
      const bounds = await element.boundingBox();
      expect(bounds, selector).not.toBeNull();
      expect(bounds!.x, selector).toBeGreaterThanOrEqual(-1);
      expect(bounds!.y, selector).toBeGreaterThanOrEqual(-1);
      expect(bounds!.x + bounds!.width, selector).toBeLessThanOrEqual(p.viewportSize()!.width + 1);
      expect(bounds!.y + bounds!.height, selector).toBeLessThanOrEqual(
        p.viewportSize()!.height + 1,
      );
    }
  }
  async function assertFinalOverlays(p: Page, selectors: string[]) {
    await expect.poll(() => layoutProblems(p, { overlays: selectors })).toEqual([]);
    await assertContained(p, selectors.join(', '));
    expect(await overlapProblems(p, 'final sweep')).toEqual([]);
  }
  async function selectLineagePath(p: Page) {
    const graph = p.getByRole('region', { name: 'Lineage graph' });
    await expect(graph.locator('.lineage-card').first()).toBeVisible();
    await graph.getByRole('button', { name: 'Fit', exact: true }).click();
    await graph
      .getByRole('group', { name: 'Contract object orders' })
      .getByRole('button', { name: 'orders.amount', exact: true })
      .click({ force: true });
    await showSelectedPath(graph, p);
    await hideSelectedPath(graph, p);
  }
  async function sweepLineage(p: Page, width: number) {
    let releaseLayout = () => {};
    const layoutGate = new Promise<void>(resolve => {
      releaseLayout = resolve;
    });
    // Hold the real worker response so the transient loading note can be measured reliably.
    const workerPattern = '**/*elk-worker*';
    await p.route(workerPattern, async route => {
      await layoutGate;
      await route.continue();
    });
    try {
      await openFile(p, 'commerce.odcs.yaml');
      await closeDrawer(p);
      await tab(p, 'Graph');
      await expect(p.locator('.lineage-busy')).toBeVisible();
      await assertFinalOverlays(p, lineageOverlays);
    } finally {
      releaseLayout();
      await p.unroute(workerPattern);
    }
    await expect(p.locator('.lineage-busy')).toHaveCount(0);
    for (const selector of ['.lineage-toolbar', '.lineage-trail', '.lineage-foot']) {
      await expect(p.locator(selector)).toBeVisible();
    }
    await expect(p.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible();
    await assertFinalOverlays(p, lineageOverlays);
    await selectLineagePath(p);
    await assertFinalOverlays(p, lineageOverlays);
    await p.screenshot({ path: `/tmp/workbench-final-sweep-lineage-${width}.png` });
  }
  async function sweepPierce(p: Page, width: number) {
    await openFile(p, 'ubl.ontology.yaml');
    await closeDrawer(p);
    await tab(p, 'Neighborhood');
    await pickCenter(p, name40);
    await closeDetails(p);
    const tools = p.locator('.neighborhood-tools');
    await tools.getByRole('button', { name: 'Full pierce', exact: true }).click();
    await expect(p.locator('.pierce-banner')).toBeVisible();
    const pierceOverlays = [...overlays, '.pierce-banner'];
    await assertFinalOverlays(p, pierceOverlays);
    // Selecting the current center preserves the pierce step and its banner.
    await p.locator('.react-flow__node[data-id="ontology/40"]').click();
    await expect(p.locator('.inspector')).toBeVisible();
    await expect(p.locator('.pierce-banner')).toBeVisible();
    await assertFinalOverlays(p, pierceOverlays);
    await p.screenshot({ path: `/tmp/workbench-final-sweep-pierce-${width}.png` });
    await closeDetails(p);
  }
  const dialogNames = [
    'Commit',
    'Validation details',
    'Add concept',
    'Grouping suggestions',
    'Import',
    'View definition',
    'Export menu',
    'Lineage options',
    'Trash',
  ];
  async function openSweepDialog(p: Page, name: string) {
    const header = p.locator('.workspace-header');
    if (['Grouping suggestions', 'Import', 'Trash'].includes(name)) {
      await showSidebar(p);
      const labels = {
        'Grouping suggestions': /grouping suggestion/,
        Import: /^Import/,
        Trash: /^Trash$/,
      };
      await p
        .locator('#workspace-sidebar')
        .getByRole('button', {
          name: labels[name as keyof typeof labels],
        })
        .click();
      return;
    }
    const file = name === 'Lineage options' ? 'commerce.odcs.yaml' : 'ubl.ontology.yaml';
    await openFile(p, file);
    await closeDrawer(p);
    if (name === 'Lineage options') {
      await tab(p, 'Graph');
      await p.getByRole('button', { name: /Lineage options/ }).click();
    } else if (name === 'View definition') {
      await tab(p, 'Catalog');
      await p.locator('.catalog button').first().click();
      await p.getByRole('button', { name: 'View definition' }).click();
    } else if (name === 'Add concept') {
      await header.getByRole('button', { name: 'New', exact: true }).click();
      await p.getByRole('menuitem', { name: 'Add concept…', exact: true }).click();
    } else if (name === 'Validation details') {
      await p.getByRole('button', { name: /^Validation details/ }).click();
    } else {
      const label = name === 'Commit' ? /^Commit/ : /^More actions$/;
      await header.getByRole('button', { name: label }).click();
    }
  }
  async function assertUnclipped(p: Page, selector: string) {
    await assertContained(p, selector);
    const problems = await p.locator(selector).evaluateAll(elements => {
      const found: string[] = [];
      for (const element of elements) {
        const bounds = element.getBoundingClientRect();
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          // A modal dialog sits in the browser's top layer, so elements around it in the
          // page cannot clip it, wherever it is placed in the DOM.
          if (parent.matches('dialog[open]:modal')) break;
          const style = getComputedStyle(parent);
          const clip = parent.getBoundingClientRect();
          const clippedX =
            style.overflowX !== 'visible' &&
            (bounds.left < clip.left - 1 || bounds.right > clip.right + 1);
          const clippedY =
            style.overflowY !== 'visible' &&
            (bounds.top < clip.top - 1 || bounds.bottom > clip.bottom + 1);
          if (clippedX || clippedY)
            found.push(`${element.textContent} clipped by ${parent.className}`);
        }
      }
      return found;
    });
    expect(problems).toEqual([]);
  }
  async function assertDialogLayout(p: Page) {
    const box = p.locator('.workbench-dialog');
    await expect(box).toBeVisible();
    await expect(box.locator(':scope > h2')).toBeVisible();
    await assertContained(p, '.workbench-dialog');
    const footerSelector = '.workbench-dialog > footer, .workbench-dialog > .repair-actions';
    const footer = p.locator(footerSelector);
    await expect(footer).toBeVisible();
    const buttons = footer.getByRole('button');
    expect(await buttons.count()).toBeGreaterThan(0);
    for (const button of await buttons.all()) await expect(button).toBeVisible();
    const chrome =
      '.workbench-dialog > h2, ' +
      '.workbench-dialog > footer button, .workbench-dialog > .repair-actions button';
    await assertUnclipped(p, chrome);
    const controls = box.locator('button, input:not([type=hidden]), select, textarea, a[href]');
    for (const control of (await controls.all()).reverse()) {
      if (!(await control.isVisible())) continue;
      if (await control.evaluate(element => !!element.closest('footer, .repair-actions'))) continue;
      await control.scrollIntoViewIfNeeded();
      const bounds = (await control.boundingBox())!;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual((await footer.boundingBox())!.y + 1);
      break;
    }
    await assertUnclipped(p, chrome);
    expect(
      await layoutProblems(p, {
        overlays: [footerSelector],
        ignore: ':not(.workbench-dialog):not(.workbench-dialog *)',
      }),
    ).toEqual([]);
    await noOverflow(p);
  }
  async function sweepDialog(p: Page, name: string, width: number) {
    await openSweepDialog(p, name);
    if (name === 'Export menu') {
      await expect(p.getByRole('menu')).toBeVisible();
      await expect(p.getByRole('menuitem', { name: /^Export/ })).toBeVisible();
      await assertContained(p, '[role=menu]');
      await noOverflow(p);
    } else {
      await assertDialogLayout(p);
    }
    const area = name.toLowerCase().replaceAll(' ', '-');
    await p.screenshot({ path: `/tmp/workbench-final-sweep-dialog-${area}-${width}.png` });
    await p.keyboard.press('Escape');
    await closeDrawer(p);
    await closeDetails(p);
  }
  for (const [width, height] of six) {
    for (const [area, run] of [
      ['lineage', sweepLineage],
      ['pierce', sweepPierce],
    ] as const) {
      await check(
        `overlaps: ${area} stays contained and clear at ${width} by ${height}`,
        async () => {
          const finalPage = await openPage(width, height);
          try {
            await run(finalPage, width);
          } finally {
            await finalPage.close();
          }
        },
      );
    }
  }
  await check(
    'overlaps: dialogs keep their titles and actions clear at all six viewports',
    async () => {
      await api.ws.loadExample('flights');
      await api.ws.importBatch(
        {
          files: [
            {
              path: 'flights.mapping.yaml',
              source: await Bun.file('public/examples/ossie/flights.mapping.yaml').text(),
            },
          ],
        },
        LOCAL_READER,
      );
      for (const [width, height] of six) {
        const finalPage = await openPage(width, height);
        try {
          for (const name of dialogNames) await sweepDialog(finalPage, name, width);
        } finally {
          await finalPage.close();
        }
      }
    },
  );
  // Status messages: a message never covers a control, disappears by itself within six seconds,
  // and clears on the next action. The sidebar re-opens or closes itself just after a resize; wait
  // for it to settle, then open it only if the loader is not already on screen.
  async function loadCommerce() {
    await sweep.waitForTimeout(400);
    const load = sweep.getByRole('button', { name: /Load commerce workspace/ });
    const openWorkspace = sweep.getByRole('button', { name: 'Open workspace', exact: true });
    if (!(await load.isVisible()) && (await openWorkspace.isVisible())) await openWorkspace.click();
    // The examples sit in a collapsed Examples group once projects exist.
    if (!(await load.isVisible()))
      await sweep.getByRole('group', { name: 'Examples' }).locator('summary').click();
    await load.click();
  }
  await check(
    'status messages: never cover a control, auto-dismiss within 6 s and clear on the next action',
    async () => {
      for (const [width, height] of [
        [1280, 720],
        [390, 844],
      ] as const) {
        await sweep.setViewportSize({ width, height });
        await closeDrawer(sweep);
        await loadCommerce();
        const status = sweep.locator('main > .status');
        await expect(status).toBeVisible();
        await closeDrawer(sweep);
        expect(await overlapProblems(sweep, `${width}×${height}`)).toEqual([]);
        await expect(status).toHaveCount(0, { timeout: 6_500 });
      }
      await sweep.setViewportSize({ width: 1440, height: 900 });
      await closeDrawer(sweep);
      await loadCommerce();
      await expect(sweep.locator('main > .status')).toBeVisible();
      await tab(sweep, 'Catalog');
      await expect(sweep.locator('main > .status')).toHaveCount(0, { timeout: 1_000 });
    },
  );
  // Navigation state: exactly one sidebar item and one tab are current, and they match.
  await check(
    'navigation: the sidebar item and the tab marked current match the view shown',
    async () => {
      await sweep.setViewportSize({ width: 1440, height: 900 });
      const nav = async () =>
        sweep.locator('#workspace-sidebar button.nav[aria-current="page"]').allTextContents();
      const tabs = async () => sweep.locator('.tabs [aria-current="page"]').allTextContents();
      await closeDrawer(sweep);
      await openFile(sweep, 'ubl.ontology.yaml');
      await sweep.getByRole('button', { name: 'Model explorer', exact: true }).click();
      await expect.poll(async () => (await nav()).map(t => t.trim())).toEqual(['Model explorer']);
      await expect.poll(async () => (await tabs()).map(t => t.trim())).toEqual(['Graph']);
      for (const name of ['Overview', 'Neighborhood', 'Overview', 'Catalog', 'Mappings']) {
        await tab(sweep, name);
        await expect.poll(async () => (await tabs()).map(t => t.trim())).toEqual([name]);
        await expect.poll(async () => (await nav()).map(t => t.trim())).toEqual(['Model explorer']);
      }
      await sweep.getByRole('button', { name: 'Source editor', exact: true }).click();
      await expect.poll(async () => (await nav()).map(t => t.trim())).toEqual(['Source editor']);
      await expect.poll(async () => (await tabs()).map(t => t.trim())).toEqual(['Source']);
      await sidebarNav(sweep, /^Source control/);
      await expect
        .poll(async () => (await nav()).map(t => t.trim().replace(/\d+$/, '')))
        .toEqual(['Source control']);
      await expect.poll(tabs).toEqual([]);
      // Neighborhood and Overview are separate views: each keeps its own state.
      await tab(sweep, 'Neighborhood');
      await pickCenter(sweep, name40);
      await expect.poll(() => centerOf(sweep)).toBe('ontology/40');
      await tab(sweep, 'Overview');
      await expect(sweep.locator('.area-entities button').first()).toBeVisible();
      await tab(sweep, 'Neighborhood');
      await expect.poll(() => centerOf(sweep)).toBe('ontology/40');
    },
  );
  // Mapping canvas: same card geometry rules on the mapped commerce mapping, with a selection.
  await check(
    'mapping graph: cards, rows, badges, finding markers and toolbar fit; cards never overlap; the canvas stays usable beside the path panel',
    async () => {
      await api.ws.loadExample('mapped-commerce');
      await sweep.setViewportSize({ width: 1440, height: 900 });
      await sweep.reload();
      await openFile(sweep, 'commerce.mapping.yaml');
      await tab(sweep, 'Graph');
      const graph = sweep.getByRole('region', { name: 'Mapping graph' });
      await expect(graph.locator('.lineage-card').first()).toBeVisible({ timeout: 15_000 });
      const found: string[] = [];
      for (const [width, height] of [
        [390, 844],
        [1280, 720],
        [1440, 900],
        [2560, 1440],
      ] as const) {
        await closeDrawer(sweep);
        await sweep.setViewportSize({ width, height });
        await sweep.waitForTimeout(300);
        await graph.getByRole('button', { name: 'Fit' }).click();
        await sweep.waitForTimeout(300);
        for (const problem of await lineageProblems(sweep))
          found.push(`${width}×${height}: ${problem}`);
        for (const problem of await layoutProblems(sweep))
          found.push(`${width}×${height}: ${problem}`);
        await graph
          .getByRole('group', { name: 'Concept Customer' })
          .locator('.lineage-card-title')
          .click({ force: true });
        await showSelectedPath(graph, sweep);
        await hideSelectedPath(graph, sweep);
        await sweep.waitForTimeout(300);
        for (const problem of await lineageProblems(sweep))
          found.push(`${width}×${height} with a selection: ${problem}`);
        for (const problem of await layoutProblems(sweep))
          found.push(`${width}×${height} with a selection: ${problem}`);
        await sweep.screenshot({ path: `/tmp/workbench-mapping-graph-path-${width}.png` });
        await clearSelectedPath(graph, sweep);
      }
      expect(found).toEqual([]);
    },
  );
  await sweep.close();
  // The sidebar resizes by pointer and keyboard within 220–520 px and remembers it; names wrap to
  // two lines and keep their full text; Examples is collapsed when projects exist; one sidebar
  // toggle on desktop, the drawer's close button only below 1100 px.
  await check(
    'sidebar: resize by pointer and keyboard (220–520, persisted), two-line names, collapsed Examples, one toggle',
    async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(`sidebar: ${error.message}`));
      await routeApi(page, api);
      await page.goto(appUrl());
      const sidebar = page.locator('#workspace-sidebar');
      const separator = page.getByRole('separator', { name: 'Resize sidebar' });
      await expect(separator).toBeVisible();
      await expect(separator).toHaveAttribute('aria-orientation', 'vertical');
      await expect(separator).toHaveAttribute('aria-valuemin', '220');
      await expect(separator).toHaveAttribute('aria-valuemax', '520');
      await expect(separator).toHaveAttribute('aria-valuenow', '300');
      expect(Math.round((await sidebar.boundingBox())!.width)).toBe(300);
      // Pointer: drag the separator 100 px to the right, then far beyond the maximum.
      let box = (await separator.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      await expect(separator).toHaveAttribute('aria-valuenow', '400');
      expect(Math.round((await sidebar.boundingBox())!.width)).toBe(400);
      box = (await separator.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 600, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();
      await expect(separator).toHaveAttribute('aria-valuenow', '520');
      // Keyboard: Home, End and arrows of 16 px.
      await separator.focus();
      await page.keyboard.press('Home');
      await expect(separator).toHaveAttribute('aria-valuenow', '220');
      await page.keyboard.press('ArrowLeft');
      await expect(separator).toHaveAttribute('aria-valuenow', '220');
      await page.keyboard.press('ArrowRight');
      await expect(separator).toHaveAttribute('aria-valuenow', '236');
      await page.keyboard.press('End');
      await expect(separator).toHaveAttribute('aria-valuenow', '520');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await expect(separator).toHaveAttribute('aria-valuenow', '488');
      // Remembered per browser.
      await page.reload();
      await expect(page.getByRole('separator', { name: 'Resize sidebar' })).toHaveAttribute(
        'aria-valuenow',
        '488',
      );
      expect(Math.round((await sidebar.boundingBox())!.width)).toBe(488);
      // Narrowest width: names wrap to at most two lines and keep their full text; rows stay tidy.
      await page.getByRole('separator', { name: 'Resize sidebar' }).focus();
      await page.keyboard.press('Home');
      const clipped = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.project-tree .tree-row')].flatMap(row => {
          const button = row.querySelector<HTMLElement>('.project-toggle,.document')!;
          const text = button.querySelector<HTMLElement>('span')!;
          const full = button.getAttribute('aria-label') ?? text.textContent ?? '';
          const lines = Math.round(
            text.getBoundingClientRect().height /
              parseFloat(getComputedStyle(text).lineHeight || '16'),
          );
          const cut =
            text.scrollHeight > text.clientHeight + 1 || text.scrollWidth > text.clientWidth + 1;
          const problems: string[] = [];
          if (lines > 2) problems.push(`${full}: ${lines} lines`);
          if (
            cut &&
            (button.getAttribute('title') ?? text.getAttribute('title')) !== full &&
            !(button.getAttribute('title') ?? text.getAttribute('title') ?? '').includes(full)
          )
            problems.push(`${full}: cut without a title`);
          return problems;
        }),
      );
      expect(clipped).toEqual([]);
      expect(await treeRowProblems(page)).toEqual([]);
      await page.screenshot({ path: '/tmp/workbench-sidebar-220.png' });
      // Examples: collapsed because projects exist; it opens on demand.
      const examples = page.getByRole('group', { name: 'Examples' });
      await expect(examples).toBeVisible();
      await expect(page.getByRole('button', { name: /Load UBL business model/ })).toBeHidden();
      await examples.locator('summary').click();
      await expect(page.getByRole('button', { name: /Load UBL business model/ })).toBeVisible();
      // One toggle on desktop; the drawer's close button is not shown.
      await expect(page.getByRole('button', { name: 'Close workspace drawer' })).toBeHidden();
      await expect(page.getByRole('button', { name: /^(Open|Close) workspace$/ })).toHaveCount(0);
      const toggle = page.getByRole('button', { name: 'Hide sidebar' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await toggle.click();
      await expect(sidebar).toBeHidden();
      await expect(page.getByRole('button', { name: 'Show sidebar' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      await page.getByRole('button', { name: 'Show sidebar' }).click();
      await expect(sidebar).toBeVisible();
      await expect(page.getByRole('separator', { name: 'Resize sidebar' })).toHaveAttribute(
        'aria-valuenow',
        '220',
      );
      // Drawer mode: no separator and no desktop toggle; the drawer has its close button.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('separator', { name: 'Resize sidebar' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^(Hide|Show) sidebar$/ })).toHaveCount(0);
      await page.getByRole('button', { name: 'Open workspace', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Close workspace drawer' })).toBeVisible();
      await context.close();
    },
  );
  // Every screen and dialog of the tour: readable text, no collisions, nothing cut off.
  const tour = tourScreens({ ontology: 'ubl.ontology.yaml', contract: 'commerce.odcs.yaml' });
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ]) {
    const tourPage = await openPage(width!, height!);
    await check(`screens: ${width}×${height} readable text and no overlaps`, async () => {
      for (const screen of tour) {
        await showScreen(tourPage, screen);
        expect(await screenProblems(tourPage, screen)).toEqual([]);
        await noOverflow(tourPage);
      }
    });
    await tourPage.close();
  }
  await check('no uncaught browser errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} responsive UI checks passed`);
} finally {
  await browser.close();
  await api.stop();
}
