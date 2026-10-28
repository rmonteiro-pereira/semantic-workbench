// Checks the workspace sidebar layout in a real browser: the footer (including the Theme control)
// stays fully visible at every window height, and the project list fills the space between the
// navigation and the footer, also after loading examples and after deleting a file or a project.
import { appUrl } from './helpers/base-url';
import { example } from './helpers/examples';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { chromium, expect, type Page } from '@playwright/test';

const api = await startIsolatedApi();
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
let passed = 0;

async function check(name: string, run: () => Promise<void>) {
  await run();
  passed++;
  console.log('PASS', name);
}

async function openPage(width: number, height: number) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', error => errors.push(error.message));
  await routeApi(page, api);
  await page.goto(appUrl());
  await page.locator('.project-tree, .projects-empty').first().waitFor();
  return page;
}

type SidebarGeometry = {
  windowHeight: number;
  sidebarScrolls: boolean;
  footerTop: number;
  footerBottom: number;
  settingsBottom: number;
  listTop: number;
  listBottom: number;
  lastRowBottom: number;
  listScrollable: boolean;
  visibleRows: number;
};

function readSidebarGeometry(page: Page): Promise<SidebarGeometry> {
  return page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>('.workspace-sidebar')!;
    const footer = document.querySelector('.sidebar-footer')!.getBoundingClientRect();
    const settings = document
      .querySelector('.sidebar-footer .settings-toggle')!
      .getBoundingClientRect();
    const list = document.querySelector<HTMLElement>('.workspace-sidebar .documents')!;
    const listBox = list.getBoundingClientRect();
    const rows = [...list.querySelectorAll('.tree-row, .project-file')].map(row =>
      row.getBoundingClientRect(),
    );
    const visible = rows.filter(
      row => row.top >= listBox.top - 1 && row.bottom <= listBox.bottom + 1,
    );
    return {
      windowHeight: window.innerHeight,
      sidebarScrolls: sidebar.scrollHeight > sidebar.clientHeight + 1,
      footerTop: footer.top,
      footerBottom: footer.bottom,
      settingsBottom: settings.bottom,
      listTop: listBox.top,
      listBottom: listBox.bottom,
      lastRowBottom: Math.max(0, ...visible.map(row => row.bottom)),
      listScrollable: list.scrollHeight > list.clientHeight + 1,
      visibleRows: visible.length,
    };
  });
}

function expectFooterVisible(geometry: SidebarGeometry, label: string) {
  expect(geometry.sidebarScrolls, `${label}: the sidebar itself scrolls`).toBe(false);
  expect(geometry.footerBottom, `${label}: footer bottom`).toBeLessThanOrEqual(
    geometry.windowHeight + 1,
  );
  expect(geometry.settingsBottom, `${label}: Settings row bottom`).toBeLessThanOrEqual(
    geometry.windowHeight + 1,
  );
}

// The list must reach the footer, and when it scrolls its last complete row must sit near the
// bottom edge instead of leaving blank space below it.
function expectListFillsSpace(geometry: SidebarGeometry, label: string) {
  expect(geometry.listBottom, `${label}: list ends at the footer`).toBeGreaterThanOrEqual(
    geometry.footerTop - 12,
  );
  if (geometry.listScrollable) {
    expect(geometry.listBottom - geometry.lastRowBottom, `${label}: blank space`).toBeLessThan(60);
  }
}

async function loadExamples(page: Page) {
  for (const name of [
    /^UBL/,
    /^Commerce workspace/,
    /^Mapped commerce/,
    /^Ossie Flights/,
    /^Subscription billing/,
    /^Shopping center/,
  ]) {
    await (await example(page, name)).click();
    await expect(page.locator('.project-tree')).toBeVisible();
    await page.waitForTimeout(300);
  }
}

async function confirmDelete(page: Page, label: string, title: string) {
  await page.getByRole('button', { name: `Actions for ${label}`, exact: true }).click();
  await page
    .getByRole('menu', { name: `Actions for ${label}` })
    .getByRole('menuitem', { name: 'Delete', exact: true })
    .click();
  await page.waitForTimeout(300);
  // A file nothing refers to is deleted at once; only a project or a referenced file asks first.
  const dialog = page.getByRole('dialog', { name: title });
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  }
  await expect(page.locator('.undo-toast')).toBeVisible();
  await page.waitForTimeout(400);
}

try {
  await check('the footer stays fully visible from 900 down to 500 px high', async () => {
    for (const width of [1280, 1440]) {
      for (const height of [900, 800, 700, 600, 550, 500]) {
        const page = await openPage(width, height);
        await loadExamples(page);
        const label = `${width}×${height}`;
        const geometry = await readSidebarGeometry(page);
        expectFooterVisible(geometry, label);
        expectListFillsSpace(geometry, label);
        await page.close();
      }
    }
  });

  await check('six examples in a row leave the list filling the space', async () => {
    const page = await openPage(1440, 900);
    await loadExamples(page);
    const geometry = await readSidebarGeometry(page);
    expect(geometry.visibleRows, 'visible rows').toBeGreaterThanOrEqual(5);
    expectListFillsSpace(geometry, '1440×900');
    await page.close();
  });

  await check('the footer stays visible with the sidebar resized', async () => {
    const page = await openPage(1280, 600);
    await loadExamples(page);
    const separator = page.getByRole('separator', { name: 'Resize sidebar' });
    await separator.focus();
    for (const key of ['End', 'Home']) {
      await page.keyboard.press(key);
      const geometry = await readSidebarGeometry(page);
      expectFooterVisible(geometry, `sidebar resized with ${key}`);
      expectListFillsSpace(geometry, `sidebar resized with ${key}`);
    }
    await page.close();
  });

  await check('deleting a file and a project keeps selection, scroll and list height', async () => {
    const page = await openPage(1440, 700);
    await loadExamples(page);
    const tree = page.getByRole('tree', { name: 'Projects' });
    const list = page.locator('.workspace-sidebar .documents');
    await tree.getByRole('button', { name: 'ubl.semantic.yaml', exact: true }).click();
    await expect(tree.locator('[aria-selected="true"]')).toHaveCount(1);
    await confirmDelete(page, 'ubl.owl.ttl in UBL business model', 'Delete ubl.owl.ttl?');
    let geometry = await readSidebarGeometry(page);
    expectFooterVisible(geometry, 'after file delete');
    expectListFillsSpace(geometry, 'after file delete');
    await expect(tree.locator('[aria-selected="true"]')).toHaveCount(1);
    await expect(tree.locator('[aria-selected="true"]')).toBeInViewport();
    await list.evaluate(element => {
      element.scrollTop = element.scrollHeight;
    });
    const projectLabel = await tree
      .locator('.project > .tree-row')
      .last()
      .getByRole('button', { name: /^Actions for / })
      .getAttribute('aria-label');
    const name = projectLabel!.replace('Actions for ', '');
    await confirmDelete(page, name, `Delete project ${name}?`);
    geometry = await readSidebarGeometry(page);
    expectFooterVisible(geometry, 'after project delete');
    expectListFillsSpace(geometry, 'after project delete');
    await page.close();
  });

  expect(errors).toEqual([]);
  console.log(`${passed} sidebar layout checks passed`);
} finally {
  await browser.close();
  await api.stop();
}
