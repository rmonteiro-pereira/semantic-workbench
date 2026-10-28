// Checks responsive layouts, overlays and navigation in an isolated browser workspace.
import { tabStripProblems } from './helpers/strip-geometry';
import { recordResizeErrors } from './helpers/resize-errors';
import { appUrl } from './helpers/base-url';
import { expectInitialGraphSettled } from './helpers/graph-readiness';
import {
  hideGraphControls,
  revealGraphControls,
  setShown,
  showEveryEntity,
  viewOptions,
} from './helpers/graph-options';
import { LOCAL_READER } from '../src/server/projects/reader';
import { chromium, expect, type Locator, type Page } from '@playwright/test';
import { plainCommerceModel } from './helpers/commerce-fixture';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import {
  addProjectKeyboardProblems,
  addProjectMenuProblems,
  exampleListProblems,
  headerGeometry,
  headerScreenProblems,
  headerScreens,
  moreActionsProblems,
  moreActionsWork,
  settingsPanelProblems,
  phoneRowProblems,
} from './helpers/header-tour';
import {
  disabledNewItemProblems,
  failingSaveProblems,
  headerContentProblems,
} from './helpers/header-title-tour';
import { expectFileOpen, expectModelName, isPhoneHeader, openNewMenu } from './helpers/header';
import { treeRowProblems } from './helpers/tree-geometry';
import { neighborhoodEdgeProblems, neighborhoodState, pickCenter } from './helpers/edge-geometry';
import { inspect } from '../src/shared/core/model';
import { NEIGHBOR_PAGE } from '../src/app/graph/graph-view';
import { layoutProblems, lineageProblems } from './helpers/layout-geometry';
import { fileTab, screenProblems, showScreen, type Screen } from './helpers/screen-tour';
import { tourGroups } from './helpers/all-tours';
import { editContainmentProblems } from './helpers/edit-tour';
import { adminScreens, leaveAdminPage } from './helpers/admin-tour';
import { editTitleProblems, odcsLayoutProblems, sidewaysTableProblems } from './helpers/odcs-tour';
import { projectDialogBackdropProblems } from './helpers/project-dialog-tour';
import { pageLayoutProblems } from './helpers/page-layout';
import { dialogStandardProblems } from './helpers/dialog-geometry';
import {
  contentWidthProblems,
  expectKeyboardTabReveal,
  headerTitleProblems,
  shellScreens,
  sidebarTreeProblems,
} from './helpers/shell-tour';
import { odcsGraphScreenProblems, odcsGraphScreens } from './helpers/odcs-graph-tour';
import { graphScreenProblems, graphScreens } from './helpers/graph-tour';
import { EXPECTED_EXAMPLE_METRICS } from './example-metric-checks';
import { exampleMetricScreens } from './helpers/examples-tour';
import {
  DARK_TOUR_SIZES,
  chooseTheme,
  darkTourScreens,
  themedScreenProblems,
} from './helpers/theme-tour';
import { addProjectItem, chooseSetting } from './helpers/sidebar-menus';

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
    // With attributes, the average order value builds on two other metrics, which widens the
    // lineage canvas until the far-zoom title of a metric card is a pixel taller than its card.
    // These screens keep the earlier plain metrics until the canvas fits that card.
    files: [
      {
        path: 'commerce.odcs.yaml',
        source: await Bun.file('public/examples/commerce/commerce.odcs.yaml').text(),
      },
      { path: 'sales.ossie.yaml', source: await plainCommerceModel() },
    ],
  },
  LOCAL_READER,
);
// A mapping document, so the Mappings tab can open the query composer.
await api.ws.importBatch(
  {
    name: 'Flights',
    files: await Promise.all(
      ['flights.ontology.yaml', 'flights.semantic_model.yaml', 'flights.mapping.yaml'].map(
        async path => ({
          path,
          source: await Bun.file(`public/examples/ossie/${path}`).text(),
        }),
      ),
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
// The canvas heights at 1280×720 on the release where the secondary controls sat in a dialog,
// minus 2 px: the Graph tab of the mall ontology and of the mall data contract.
const MALL_GRAPH_CANVAS_HEIGHT = [
  ['mall.ontology.yaml', 473],
  ['mall.odcs.yaml', 421],
] as const;
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
  const alwaysRun = name === 'no uncaught browser errors';
  if (only && !name.startsWith(only) && !alwaysRun) return;
  await action();
  console.log('PASS', name);
  passed++;
}
async function recordPageErrors(page: Page, label: string) {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  await recordResizeErrors(page, message => errors.push(`${label}: ${message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) {
      errors.push(`${label}: ${message.text()}`);
    }
  });
}

// The header measured with the UBL ontology open, after Admin moved into Settings. A phone used
// two rows before the one-row phone header. Wider windows keep the geometry of the one-row header
// with New and Export inside More actions.
const PHONE_HEADER_HEIGHT_BEFORE = 93;
const ublSlug = api.ws
  .documentsFor(LOCAL_READER)
  .find(candidate => candidate.filename === 'ubl.ontology.yaml')!.project;
const ublProject = (await api.ws.listProjects(LOCAL_READER)).find(
  project => project.slug === ublSlug,
)!;
const ublHeader = {
  fileName: 'ubl.ontology.yaml',
  projectName: ublProject.name,
  kind: ublModel.kind,
};
const DESKTOP_HEADER_GEOMETRY: Record<number, { height: number; controls: string[] }> = {
  1280: {
    height: 58,
    controls: [
      'Hide sidebar@316,11,36,36',
      'Save state@763,32,45,16',
      'Commit…@1115,11,107,36',
      'More actions@1228,11,36,36',
    ],
  },
  1440: {
    height: 58,
    controls: [
      'Hide sidebar@316,11,36,36',
      'Save state@763,32,45,16',
      'Commit…@1275,11,107,36',
      'More actions@1388,11,36,36',
    ],
  },
};

async function checkPhoneHeader(page: Page) {
  // The earlier screens leave the sidebar drawer open, and its backdrop covers the header.
  if (await page.locator('#workspace-sidebar[role=dialog]').count()) {
    await page.keyboard.press('Escape');
  }
  await expect(page.locator('.workspace-scrim')).toHaveCount(0);
  const { height } = await headerGeometry(page);
  console.log(
    `header height at ${page.viewportSize()!.width}px: ${height}px (was ${PHONE_HEADER_HEIGHT_BEFORE}px)`,
  );
  expect(height).toBeLessThan(PHONE_HEADER_HEIGHT_BEFORE);
  expect(await phoneRowProblems(page)).toEqual([]);
}

async function openPage(width: number, height: number) {
  const page = await browser.newPage({ viewport: { width, height } });
  await recordPageErrors(page, `${width}×${height}`);
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
  if (process.env.RESPONSIVE_MUTATION === 'far-details-hidden') {
    await page.addInitScript(() =>
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '.neighborhood-node .node small{display:none!important}';
        document.head.append(style);
      }),
    );
    console.log('INJECTED_FAR_DETAILS_MUTATION');
  }
  if (process.env.RESPONSIVE_MUTATION === 'graph-names-small') {
    await page.addInitScript(() =>
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '.full-graph .full-entity strong{font-size:6px!important}';
        document.head.append(style);
      }),
    );
    console.log('INJECTED_GRAPH_NAMES_MUTATION');
  }
  if (process.env.RESPONSIVE_MUTATION === 'graph-column-small') {
    await page.addInitScript(() =>
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '.lineage-row-name{font-size:8px!important}';
        document.head.append(style);
      }),
    );
    console.log('INJECTED_GRAPH_COLUMN_MUTATION');
  }
  if (process.env.RESPONSIVE_MUTATION === 'catalog-title') {
    await page.addInitScript(() =>
      new MutationObserver(() =>
        document
          .querySelectorAll('.catalog-card p[title]')
          .forEach(paragraph => paragraph.removeAttribute('title')),
      ).observe(document, { childList: true, subtree: true }),
    );
    console.log('INJECTED_CATALOG_TITLE_MUTATION');
  }
  if (process.env.RESPONSIVE_MUTATION === 'save-state-cut') {
    await page.addInitScript(() =>
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '.header-meta .save-state{max-width:90px!important}';
        document.head.append(style);
      }),
    );
    console.log('INJECTED_SAVE_STATE_MUTATION');
  }
  if (process.env.RESPONSIVE_MUTATION === 'status-stays')
    await page.route('**/src/app/main.tsx*', async route => {
      const response = await route.fetch();
      const source = await response.text();
      const anchor = 'const timer = setTimeout(() => setMessage(""), 5e3);';
      if (!source.includes(anchor)) throw Error('Status mutation anchor missing');
      console.log('INJECTED_STATUS_MUTATION');
      await route.fulfill({
        response,
        body: source.replace(anchor, 'const timer = 0;'),
      });
    });
  await page.goto(appUrl());
  await expectModelName(page, /UBL/);
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(page.locator('.react-flow__node-entity').first()).toBeVisible();
  await expectInitialGraphSettled(page);
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
      {
        timeout: 15_000,
        message: 'At least one measured graph node intersects the actual canvas',
      },
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
      {
        timeout: 10000,
        message: 'Relationship hit area becomes accessible after fit animation',
      },
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
        await page.screenshot({
          path: `/tmp/workbench-responsive-${width}x${height}.png`,
        });
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
          .getByRole('button', {
            name: desktop ? 'Show sidebar' : 'Open workspace',
            exact: true,
          })
          .click();
        await expect(
          page.getByRole('button', { name: 'ubl.ontology.yaml', exact: true }),
        ).toBeInViewport();
        await expect(page.getByRole('button', { name: 'Add project', exact: true })).toBeVisible();
        await expect(page.locator('input[type=file]')).toHaveCount(1);
        // Project tree rows: name, delete icon and menu stay side by side at every viewport.
        await expect(
          page.getByRole('button', {
            name: 'Delete ubl.ontology.yaml',
            exact: true,
          }),
        ).toBeVisible();
        expect(await treeRowProblems(page)).toEqual([]);
        if (width === 390)
          await page.screenshot({
            path: '/tmp/workbench-responsive-drawer-390.png',
          });
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
        await viewOptions(page, options => setShown(options, 'Labels', true));
        await expect.poll(() => neighborhoodEdgeProblems(page)).toEqual([]);
        await viewOptions(page, options => setShown(options, 'Labels', false));
        if (width === 1280)
          await page.screenshot({
            path: '/tmp/workbench-responsive-neighborhood-1280.png',
          });
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
          await expect(page.locator('.full-graph-loading')).toHaveCount(0, {
            timeout: 60_000,
          });
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
    await check(
      `${width}×${height}: zoomed far out, neighborhood cards keep their type, description and full name`,
      async () => {
        await page
          .locator('.tabs')
          .getByRole('button', { name: 'Neighborhood', exact: true })
          .click();
        await pickCenter(page, name40);
        await expect.poll(() => centerOf(page)).toBe('ontology/40');
        const opened = await neighborhoodState(page);
        expect(opened.shown).toBe(Math.min(NEIGHBOR_PAGE, opened.total ?? 0));
        await revealGraphControls(page);
        const zoomOutSteps = 5;
        for (let step = 0; step < zoomOutSteps; step++) {
          await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
          await page.waitForTimeout(250);
        }
        const cards = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('.neighborhood-node .node')]
            .filter(card => card.getBoundingClientRect().width > 0)
            .map(card => {
              const name = card.querySelector<HTMLElement>('strong')!;
              const type = card.querySelector<HTMLElement>('small');
              const description = card.querySelector<HTMLElement>(':scope > span');
              return {
                nameIsWhole:
                  name.textContent === name.title && name.scrollWidth <= name.clientWidth,
                typeShown: !!type && getComputedStyle(type).display !== 'none',
                descriptionShown: !description || getComputedStyle(description).display !== 'none',
              };
            }),
        );
        expect(cards.length).toBeGreaterThan(0);
        expect(cards.every(card => card.nameIsWhole)).toBe(true);
        expect(cards.every(card => card.typeShown)).toBe(true);
        expect(cards.every(card => card.descriptionShown)).toBe(true);
        // Labels on is a request to see every relationship name, whatever the zoom.
        await viewOptions(page, options => setShown(options, 'Labels', true));
        await expect.poll(() => page.locator('.relationship-label').count()).toBeGreaterThan(0);
        await viewOptions(page, options => setShown(options, 'Labels', false));
        await revealGraphControls(page);
        for (let step = 0; step < zoomOutSteps; step++) {
          await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
        }
        await hideGraphControls(page);
        await page.waitForTimeout(250);
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
      await expect(fsPage.locator('.full-graph-loading')).toHaveCount(0, {
        timeout: 60_000,
      });
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
      await showEveryEntity(fsPage);
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
      await fsPage.screenshot({
        path: '/tmp/workbench-fullscreen-neighborhood.png',
      });
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
        await expect(p.locator('.full-graph-loading')).toHaveCount(0, {
          timeout: 60_000,
        });
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
        await expect(p.getByRole('region', { name: 'Table orders' })).toBeVisible();
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
        await recordPageErrors(page, `roles ${width}×${height}`);
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
    'lineage: cards, rows, badges, lists and toolbar fit; cards never overlap; the canvas stays usable beside the path panel',
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
          .getByRole('group', { name: 'Table orders' })
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
        await sweep.screenshot({
          path: `/tmp/workbench-lineage-path-${width}.png`,
        });
        await clearSelectedPath(graph, sweep);
      }
      expect(found).toEqual([]);
    },
  );
  // Opens the inspector on an entity where the view allows selecting one.
  const details: Record<string, (p: Page) => Promise<void>> = {
    Graph: async p => {
      await revealGraphControls(p);
      await showEveryEntity(p);
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
      await expect(sweep.locator('.full-graph-loading')).toHaveCount(0, {
        timeout: 60_000,
      });
      // Labels are turned on and areas collapsed, so a bundled connection (its label counts its
      // relationships) can be selected to show the bundle selector.
      await viewOptions(sweep, async options => {
        await setShown(options, 'Labels', true);
        // The mini-map is off by default; it is turned on so the overlap checks cover it.
        await setShown(options, 'Mini-map', true);
        // A pane this size may already open with the areas collapsed.
        const collapse = options.getByRole('button', {
          name: 'Collapse areas',
          exact: true,
        });
        if (await collapse.isEnabled()) await collapse.click();
      });
      await expect(sweep.locator('.full-graph-loading')).toHaveCount(0, {
        timeout: 60_000,
      });
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
          await sweep.screenshot({
            path: `/tmp/workbench-overlap-bundle-${width}.png`,
          });
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
          await sweep.screenshot({
            path: '/tmp/workbench-grouping-popover-390.png',
          });
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
    // Fit shows every card, which lays them out again before the view settles.
    await p.waitForTimeout(800);
    await graph
      .getByRole('group', { name: 'Table orders' })
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
    // A phone folds the zoom buttons behind the Controls button.
    const zoomOrControls = width <= 650 ? 'Controls' : 'Zoom in';
    await expect(p.getByRole('button', { name: zoomOrControls, exact: true })).toBeVisible();
    await assertFinalOverlays(p, lineageOverlays);
    await selectLineagePath(p);
    await assertFinalOverlays(p, lineageOverlays);
    await p.screenshot({
      path: `/tmp/workbench-final-sweep-lineage-${width}.png`,
    });
  }
  async function sweepPierce(p: Page, width: number) {
    await openFile(p, 'ubl.ontology.yaml');
    await closeDrawer(p);
    await tab(p, 'Neighborhood');
    await pickCenter(p, name40);
    await closeDetails(p);
    const tools = p.locator('.neighborhood-tools');
    await revealGraphControls(p);
    await tools.getByRole('button', { name: 'Show all connected', exact: true }).click();
    await expect(p.locator('.pierce-banner')).toBeVisible();
    const pierceOverlays = [...overlays, '.pierce-banner'];
    await assertFinalOverlays(p, pierceOverlays);
    // Selecting the current center preserves the pierce step and its banner.
    // On a phone the pierce view opens on what it added, so the centre can be off screen.
    const centreNode = p.locator('.react-flow__node[data-id="ontology/40"]');
    if (width <= 650) await centreNode.dispatchEvent('click');
    else await centreNode.click();
    await expect(p.locator('.inspector')).toBeVisible();
    await expect(p.locator('.pierce-banner')).toBeVisible();
    await assertFinalOverlays(p, pierceOverlays);
    await p.screenshot({
      path: `/tmp/workbench-final-sweep-pierce-${width}.png`,
    });
    await closeDetails(p);
  }
  const dialogNames = [
    'Commit',
    'Validation details',
    'Add concept',
    'Grouping suggestions',
    'Import',
    'View definition',
    'Trash',
  ];
  async function openSweepDialog(p: Page, name: string) {
    const header = p.locator('.workspace-header');
    if (['Grouping suggestions', 'Import', 'Trash'].includes(name)) {
      await showSidebar(p);
      if (name === 'Import') {
        await (await addProjectItem(p, 'Import files')).click();
        return;
      }
      const labels = {
        'Grouping suggestions': /grouping suggestion/,
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
    await openFile(p, 'ubl.ontology.yaml');
    await closeDrawer(p);
    if (name === 'View definition') {
      await tab(p, 'Catalog');
      await p.locator('.catalog button').first().click();
      await p.getByRole('button', { name: 'View definition' }).click();
    } else if (name === 'Add concept') {
      await openNewMenu(p);
      await p.getByRole('menuitem', { name: 'Add concept…', exact: true }).click();
    } else if (name === 'Validation details') {
      await p.getByRole('button', { name: /^Validation details/ }).click();
    } else {
      await header.getByRole('button', { name: /^Commit/ }).click();
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
    await assertDialogLayout(p);
    const area = name.toLowerCase().replaceAll(' ', '-');
    await p.screenshot({
      path: `/tmp/workbench-final-sweep-dialog-${area}-${width}.png`,
    });
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
    const addProjectButton = sweep.getByRole('button', {
      name: 'Add project',
      exact: true,
    });
    const openWorkspace = sweep.getByRole('button', {
      name: 'Open workspace',
      exact: true,
    });
    if (!(await addProjectButton.isVisible()) && (await openWorkspace.isVisible())) {
      await openWorkspace.click();
    }
    // The examples are under Add project, then Load an example.
    await addProjectButton.click();
    await sweep.getByRole('menuitem', { name: 'Load an example', exact: true }).click();
    await sweep.getByRole('menuitem', { name: /Commerce workspace/ }).click();
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
      await expect(sweep.locator('main > .status')).toHaveCount(0, {
        timeout: 1_000,
      });
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
      // The tabs and the entity search stay above Source control; none is marked current.
      await expect.poll(tabs).toEqual([]);
      await expect(sweep.locator('.tabs').getByRole('button', { name: 'Graph' })).toBeVisible();
      await expect(sweep.getByPlaceholder('Find an entity…')).toBeVisible();
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
      await expect(graph.locator('.lineage-card').first()).toBeVisible({
        timeout: 15_000,
      });
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
        await sweep.screenshot({
          path: `/tmp/workbench-mapping-graph-path-${width}.png`,
        });
        await clearSelectedPath(graph, sweep);
      }
      expect(found).toEqual([]);
    },
  );
  await sweep.close();
  // The sidebar resizes by pointer and keyboard within 220–520 px and remembers it; names wrap to
  // two lines and keep their full text; Examples is a menu; one sidebar
  // toggle on desktop, the drawer's close button only below 1100 px.
  await check(
    'sidebar: resize by pointer and keyboard (220–520, persisted), two-line names, Add project menu, one toggle',
    async () => {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      await recordPageErrors(page, 'sidebar');
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
      // Add project: a closed menu button that opens on demand, even in the narrowest sidebar.
      const addProject = page.getByRole('button', {
        name: 'Add project',
        exact: true,
      });
      await expect(addProject).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Import files' })).toBeHidden();
      await addProject.click();
      await expect(page.getByRole('menuitem', { name: 'Import files' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(addProject).toBeFocused();
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
  // Every screen and dialog of every tour: readable text, no collisions, nothing cut off.
  const groups = tourGroups({
    ontology: 'ubl.ontology.yaml',
    contract: 'commerce.odcs.yaml',
    metricsModel: 'sales.ossie.yaml',
    // Mappings lists only the open project's mappings; the Flights project has one.
    mappedFile: 'flights.ontology.yaml',
  });
  // Checks that only some groups need on top of the shared ones.
  const extraProblems: Record<string, (page: Page, screen: Screen) => Promise<string[]>> = {
    screens: (page, screen) => pageLayoutProblems(page, screen.name),
    'edit screens': (page, screen) => editContainmentProblems(page, screen.name),
    'ODCS screens': async (page, screen) => [
      ...(await tabStripProblems(page)),
      ...(await sidewaysTableProblems(page)),
      ...(await odcsLayoutProblems(page, screen.name)),
      ...(screen.name === 'odcs-property-edit' ? await editTitleProblems(page) : []),
    ],
    'project dialogs': async (page, screen) =>
      screen.name.startsWith('project-') ? projectDialogBackdropProblems(page) : [],
    'export dialog': page => projectDialogBackdropProblems(page),
  };
  for (const group of groups) {
    for (const [width, height] of [
      [390, 844],
      [1280, 720],
      [1440, 900],
      [2560, 1440],
    ]) {
      const tourPage = await openPage(width!, height!);
      await check(`${group.title}: ${width}×${height} ${group.summary}`, async () => {
        for (const screen of group.screens) {
          await showScreen(tourPage, screen);
          expect(await screenProblems(tourPage, screen)).toEqual([]);
          if (screen.dialog)
            expect(await dialogStandardProblems(tourPage), screen.name).toEqual([]);
          const extra = extraProblems[group.title];
          if (extra) expect(await extra(tourPage, screen)).toEqual([]);
          await noOverflow(tourPage);
        }
      });
      await tourPage.close();
    }
  }
  // The shell: header status, graph toolbars, the sidebar footer and dialogs opened from the drawer.
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ]) {
    const shellPage = await openPage(width!, height!);
    await check(
      `shell: ${width}×${height} header, toolbars, sidebar footer and drawer`,
      async () => {
        const phone = width! < 1100;
        // From 1200 px the header shows the whole save state instead of cutting it with an ellipsis.
        if (width! >= 1200) {
          const text = shellPage.locator('.save-state-text');
          const cut = await text.evaluate(el => el.scrollWidth > el.clientWidth + 1);
          expect(cut, 'the save state is cut').toBe(false);
        }
        // Graph toolbars keep their frequent controls to at most two rows: the rest is in a dialog.
        const toolbar = async (selector: string) =>
          (await shellPage.locator(selector).boundingBox())!;
        expect((await toolbar('.full-graph-tools')).height).toBeLessThanOrEqual(58);
        await shellPage.locator('.tabs').getByRole('button', { name: 'Neighborhood' }).click();
        await expect(shellPage.locator('.neighborhood-tools')).toBeVisible();
        expect((await toolbar('.neighborhood-tools')).height).toBeLessThanOrEqual(phone ? 58 : 104);
        // The sidebar keeps Import and the examples in view below a scrolling project tree.
        await showSidebar(shellPage);
        const footer = (await shellPage.locator('.sidebar-footer').boundingBox())!;
        expect(footer.y + footer.height).toBeLessThanOrEqual(height! + 1);
        await expect(
          shellPage.getByRole('button', { name: 'Settings', exact: true }),
        ).toBeInViewport();
        const tree = (await shellPage.locator('.workspace-sidebar .documents').boundingBox())!;
        expect(tree.height).toBeGreaterThanOrEqual(150);
        // A dialog opened from the phone drawer closes the drawer, and focus goes back to the
        // workspace button.
        if (phone) {
          await shellPage.getByRole('button', { name: 'Trash', exact: true }).click();
          await expect(shellPage.getByRole('dialog', { name: 'Trash' })).toBeVisible();
          await expect(shellPage.locator('#workspace-sidebar')).toHaveAttribute('inert', '');
          await shellPage.keyboard.press('Escape');
          await expect(shellPage.getByRole('button', { name: 'Open workspace' })).toBeFocused();
        }
      },
    );
    await shellPage.close();
  }
  // The Admin page: every section at each size, with text, collisions and containment checked.
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ]) {
    const adminPage = await openPage(width!, height!);
    await check(
      `admin page: ${width}×${height} readable text, no overlaps, content fits`,
      async () => {
        for (const screen of adminScreens()) {
          await showScreen(adminPage, screen);
          expect(
            await screenProblems(adminPage, {
              ...screen,
              dialog: '.admin-page',
            }),
          ).toEqual([]);
          await noOverflow(adminPage);
          for (const part of ['.admin-nav', '.admin-content']) {
            const box = await adminPage.locator(part).boundingBox();
            expect(
              box && box.x >= 0 && box.x + box.width <= width! + 1,
              `${screen.name} ${part}`,
            ).toBe(true);
          }
          await expect(
            adminPage.getByRole('button', {
              name: 'Back to workspace',
              exact: true,
            }),
          ).toBeVisible();
        }
        await leaveAdminPage(adminPage);
      },
    );
    await adminPage.close();
  }
  // The header: file actions, save state with Commit and the account sit in groups of one control
  // height without overlap, and its menus and the Examples menu stay inside the window.
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ]) {
    const headerPage = await openPage(width!, height!);
    await check(
      `header: ${width}×${height} groups, control height, menus and keyboard`,
      async () => {
        for (const screen of headerScreens('ubl.ontology.yaml')) {
          await showScreen(headerPage, screen);
          expect(await headerScreenProblems(headerPage, screen)).toEqual([]);
          expect(await screenProblems(headerPage, screen)).toEqual([]);
          await noOverflow(headerPage);
        }
        await headerPage.keyboard.press('Escape');
        if (isPhoneHeader(headerPage)) {
          await checkPhoneHeader(headerPage);
        } else {
          // Local mode has no person menu, so the empty Account group stays hidden.
          for (const name of ['Commit…', 'More actions']) {
            await expect(headerPage.getByRole('button', { name, exact: true })).toBeVisible();
          }
          const before = DESKTOP_HEADER_GEOMETRY[width!];
          if (before) expect(await headerGeometry(headerPage)).toEqual(before);
        }
        expect(await headerContentProblems(headerPage, ublHeader)).toEqual([]);
        expect(await moreActionsProblems(headerPage)).toEqual([]);
        await moreActionsWork(headerPage);
        expect(await disabledNewItemProblems(headerPage)).toEqual([]);
        const saveState = headerPage.getByRole('status', {
          name: 'Save state',
          exact: true,
        });
        await expect(saveState).toBeVisible();
        await addProjectKeyboardProblems(headerPage);
        expect(await addProjectMenuProblems(headerPage)).toEqual([]);
        expect(await exampleListProblems(headerPage)).toEqual([]);
        expect(await settingsPanelProblems(headerPage)).toEqual([]);
        // Admin lives in Settings at every width, the phone drawer included.
        await chooseSetting(headerPage, 'Admin');
        await headerPage.locator('.admin-page').waitFor();
        await leaveAdminPage(headerPage);
      },
    );
    await headerPage.close();
  }
  // A save that needs action is drawn in the danger colour, on a phone and on a wide window.
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
  ]) {
    const failingPage = await openPage(width!, height!);
    await check(
      `header: ${width}×${height} a failing save shows in the danger colour`,
      async () => {
        await showScreen(failingPage, headerScreens('ubl.ontology.yaml')[0]!);
        expect(await failingSaveProblems(failingPage)).toEqual([]);
      },
    );
    await failingPage.close();
  }
  // The ODCS graph and its dialogs: whole cards, readable column names, clear lines and labels, a
  // legend, the hop row, and readable text without collisions.
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ]) {
    const graphPage = await openPage(width!, height!);
    await check(
      `ODCS graph: ${width}×${height} whole cards, clear lines, legend, readable`,
      async () => {
        for (const screen of odcsGraphScreens('commerce.odcs.yaml')) {
          await showScreen(graphPage, screen);
          expect(await screenProblems(graphPage, screen)).toEqual([]);
          expect(await odcsGraphScreenProblems(graphPage, screen)).toEqual([]);
          await noOverflow(graphPage);
        }
      },
    );
    await graphPage.close();
  }
  // The metric screens of every shipped example, in a workspace that holds all of them.
  if (!only || 'examples:'.startsWith(only) || only.startsWith('examples:')) {
    const exampleApi = await startIsolatedApi();
    try {
      for (const setId of Object.keys(EXPECTED_EXAMPLE_METRICS))
        await exampleApi.ws.loadExample(setId);
      for (const [width, height] of [
        [390, 844],
        [1280, 720],
        [1440, 900],
        [2560, 1440],
      ]) {
        const examplePage = await browser.newPage({
          viewport: { width: width!, height: height! },
        });
        await recordPageErrors(examplePage, `examples ${width}×${height}`);
        await routeApi(examplePage, exampleApi);
        await examplePage.goto(appUrl());
        await expect(examplePage.locator('h1')).toBeVisible();
        await check(
          `examples: ${width}×${height} metric screens readable, no overlaps`,
          async () => {
            for (const screen of exampleMetricScreens()) {
              await showScreen(examplePage, screen);
              expect(await screenProblems(examplePage, screen)).toEqual([]);
              await noOverflow(examplePage);
            }
          },
        );
        if (width === 1280) {
          await check(
            'examples: 1280×720 mall Graph toolbars keep the canvas height they had as dialogs',
            async () => {
              for (const [file, minimumHeight] of MALL_GRAPH_CANVAS_HEIGHT) {
                await fileTab(file, 'Graph')(examplePage);
                await expect(examplePage.locator('.full-graph-loading')).toHaveCount(0);
                await examplePage.waitForTimeout(500);
                const canvas = (await examplePage
                  .locator('.react-flow:visible')
                  .first()
                  .boundingBox())!;
                expect(canvas.height, `${file} canvas height`).toBeGreaterThanOrEqual(
                  minimumHeight,
                );
              }
            },
          );
        }
        await examplePage.close();
      }
    } finally {
      await exampleApi.stop();
    }
  }
  // The dark theme, chosen through the Theme control: readable text with enough contrast, no
  // overlaps and nothing cut off, on the same screens.
  for (const [width, height] of DARK_TOUR_SIZES) {
    const darkPage = await openPage(width, height);
    await check(`dark theme: ${width}×${height} readable text and no overlaps`, async () => {
      await chooseTheme(darkPage, 'Dark');
      for (const screen of darkTourScreens(groups, width)) {
        await showScreen(darkPage, screen);
        expect(await themedScreenProblems(darkPage, screen)).toEqual([]);
        await noOverflow(darkPage);
      }
    });
    await darkPage.close();
  }
  // The whole-model graph and the neighborhood: names that read, detail only where it reads, no
  // overlapping cards, a toolbar that fits, and a canvas that keeps most of a phone screen.
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1440, 900],
    [2560, 1440],
  ]) {
    const canvasPage = await openPage(width!, height!);
    await check(
      `graph canvases: ${width}×${height} readable names, no overlaps, toolbar fits`,
      async () => {
        for (const screen of graphScreens('ubl.ontology.yaml')) {
          await showScreen(canvasPage, screen);
          expect(await screenProblems(canvasPage, screen)).toEqual([]);
          expect(await graphScreenProblems(canvasPage, screen)).toEqual([]);
          await noOverflow(canvasPage);
        }
      },
    );
    await canvasPage.close();
  }
  // The shell parts of the main screens: header tooltips and short save state, the tab strip cues,
  // the open file in the sidebar tree and one content width on wide windows.
  for (const [width, height] of DARK_TOUR_SIZES) {
    const shellTourPage = await openPage(width, height);
    await check(`shell screens: ${width}×${height} header, tab strip, tree and width`, async () => {
      for (const screen of shellScreens('ubl.ontology.yaml', 'commerce.odcs.yaml')) {
        await showScreen(shellTourPage, screen);
        expect(await screenProblems(shellTourPage, screen)).toEqual([]);
        expect(await headerTitleProblems(shellTourPage, width), screen.name).toEqual([]);
        expect(await tabStripProblems(shellTourPage), screen.name).toEqual([]);
        expect(await contentWidthProblems(shellTourPage, width), screen.name).toEqual([]);
        await noOverflow(shellTourPage);
        await expectKeyboardTabReveal(shellTourPage);
      }
      expect(await sidebarTreeProblems(shellTourPage, 'commerce.odcs.yaml')).toEqual([]);
    });
    await shellTourPage.close();
  }
  // A phone drawer the person opened while the workspace is still loading must stay open when the
  // first file opens by itself.
  await check('sidebar: the phone drawer opened during loading stays open', async () => {
    const loadingPage = await openPage(390, 844);
    await loadingPage.route(
      url => url.pathname.startsWith('/api/') && !url.pathname.includes('events'),
      async route => {
        if (route.request().method() === 'GET') await new Promise(done => setTimeout(done, 1200));
        await route.fallback();
      },
    );
    await loadingPage.goto(appUrl());
    await loadingPage.getByRole('button', { name: 'Open workspace', exact: true }).click();
    const closeButton = loadingPage.getByRole('button', {
      name: 'Close workspace drawer',
    });
    await expect(closeButton).toBeVisible();
    await expectFileOpen(loadingPage, { timeout: 30_000 });
    await loadingPage.waitForTimeout(500);
    await expect(closeButton).toBeVisible();
    await loadingPage.close();
  });
  await check('no uncaught browser errors', async () => expect(errors).toEqual([]));
  console.log(`${passed} responsive UI checks passed`);
} finally {
  await browser.close();
  await api.stop();
}
