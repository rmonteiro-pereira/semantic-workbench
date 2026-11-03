// Captures the reported UBL regressions in an isolated workspace and writes every finding, even
// when an earlier screen fails. Pass a new output directory for each inspection round.
// Follow the directory with scenario names to repeat only the affected screens.
import { chromium, expect, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { appUrl } from './helpers/base-url';
import { startIsolatedApi, routeApi } from './helpers/isolated-api';
import { fileTab, geometryProblems } from './helpers/screen-tour';
import { clippedTextProblems } from './helpers/clipped-text';
import { graphCanvasProblems } from './helpers/graph-canvas-geometry';
import { pickCenter } from './helpers/edge-geometry';
import { revealGraphControls } from './helpers/graph-options';
import { odcsGraphProblems } from './helpers/odcs-graph-geometry';
import { withCleanup } from './helpers/processes';
import { projectFile } from '../src/server/projects/paths';

const output = process.argv[2];
if (!output) throw new Error('Pass a new output directory for this inspection round.');
const directory = resolve(output);
mkdirSync(directory, { recursive: false });
const api = await startIsolatedApi();
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const contract = 'ubl.odcs.yaml';
const table = 'invoice__statement_document_reference';
const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];
type ReviewScreen = {
  name: string;
  scope: string;
  show: (page: Page) => Promise<void>;
  inspect?: (page: Page) => Promise<string[]>;
};
type Finding = { screen: string; width: number; height: number; screenshot: string; problems: string[] };
const findings: Finding[] = [];

async function openGraph(page: Page) {
  await fileTab('ubl.ontology.yaml', 'Graph')(page);
  await expect(page.locator('.full-graph-loading')).toHaveCount(0, { timeout: 60000 });
  await expect(page.locator('.full-entity').first()).toBeVisible();
  await page.mouse.move(0, 0);
}

async function openCommit(page: Page) {
  await fileTab('ubl.ontology.yaml', 'Graph')(page);
  await page
    .locator('.workspace-header')
    .getByRole('button', { name: /^Commit/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'Commit', exact: true })).toBeVisible();
  await expect(page.locator('.commit-diff .cm-editor').first()).toBeVisible();
}

async function cutContent(page: Page, scope: string) {
  return page.locator(scope).evaluate(root => {
    const problems: string[] = [];
    for (const element of root.querySelectorAll<HTMLElement>('strong, small, code, span, .cm-scroller')) {
      if (!element.getClientRects().length || !element.clientWidth) continue;
      const style = getComputedStyle(element);
      const wide = element.scrollWidth > element.clientWidth + 1;
      const tall = element.scrollHeight > element.clientHeight + 1;
      if ((wide && style.overflowX !== 'visible') || (tall && ['hidden', 'clip'].includes(style.overflowY))) {
        problems.push(`clipped content in .${element.className || element.tagName}: ${(element.textContent ?? '').trim().slice(0, 90)}`);
      }
    }
    return problems;
  });
}

const screens: ReviewScreen[] = [
  {
    name: 'commit',
    scope: '.commit-dialog',
    show: openCommit,
    inspect: async page => {
      const width = await page.locator('.commit-dialog').evaluate(element => element.getBoundingClientRect().width);
      return page.viewportSize()!.width >= 1024 && width < page.viewportSize()!.width * 0.85 ? ['Commit does not use the available horizontal space'] : [];
    },
  },
  {
    name: 'commit-new-file',
    scope: '.commit-dialog',
    show: async page => {
      await openCommit(page);
      await page.locator('.commit-file').filter({ hasText: 'visual-review-notes.txt' }).click();
      await expect(page.locator('.commit-diff')).toContainText('New file for visual review');
    },
  },
  {
    name: 'graph-idle',
    scope: '.full-graph',
    show: openGraph,
    inspect: async page => {
      const problems = await graphCanvasProblems(page, 'model');
      const edgeIds = () => page.locator('.full-graph .react-flow__edge').evaluateAll(edges => edges.map(edge => edge.getAttribute('data-id')));
      const idle = new Set(await edgeIds());
      const opaqueTitles = await page.locator('.full-graph .full-area-title').evaluateAll(titles => titles.filter(title => getComputedStyle(title).backgroundColor !== 'rgba(0, 0, 0, 0)').length);
      if (opaqueTitles) problems.push(`${opaqueTitles} group titles obscure the relationship paths`);
      await page.locator('.full-entity').filter({ hasText: 'Receipt Advice' }).first().hover();
      const hoverOnly = (await edgeIds()).filter(id => !idle.has(id));
      if (hoverOnly.length) problems.push(`${hoverOnly.length} relationships appear only on hover`);
      await page.mouse.move(0, 0);
      return problems;
    },
  },
  {
    name: 'graph-selected',
    scope: '.full-graph',
    show: async page => {
      await openGraph(page);
      const entity = page.locator('.full-entity').filter({ hasText: 'Receipt Advice' }).first();
      await entity.click();
      await page.mouse.move(0, 0);
    },
    inspect: page => graphCanvasProblems(page, 'model'),
  },
  {
    name: 'graph-history',
    scope: '.walk-trail',
    show: async page => {
      await fileTab('ubl.ontology.yaml', 'Neighborhood')(page);
      await pickCenter(page, 'Order');
      for (let cycle = 0; cycle < 4; cycle++) {
        await expect(page.locator('.neighborhood-canvas')).toHaveAttribute('data-viewport-ready', 'true');
        await page.getByRole('button', { name: 'Expand Country', exact: true }).click();
        await page.getByRole('button', { name: 'Collapse Country', exact: true }).click();
      }
    },
    inspect: async page => {
      const problems: string[] = [];
      const buttons = page.locator('.walk-trail ol button');
      for (const button of [buttons.first(), buttons.last()]) {
        await button.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        const clipped = await button.evaluate(element => {
          const frame = element.closest('ol')!.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
          return box.left - ring < frame.left - 1 || box.right + ring > frame.right + 1 || box.top - ring < frame.top - 1 || box.bottom + ring > frame.bottom + 1;
        });
        if (clipped) problems.push(`history label or focus ring is clipped: ${await button.innerText()}`);
      }
      return problems;
    },
  },
  {
    name: 'grouping-menu',
    scope: '.grouping-menu',
    show: async page => {
      await openGraph(page);
      await revealGraphControls(page);
      await page.locator('.grouping-trigger').click();
      await expect(page.getByRole('menu')).toBeVisible();
    },
    inspect: async page => ((await page.getByRole('menu').innerText()).includes('Curated example areas') ? ['grouping exposes application rules specific to the UBL example'] : []),
  },
  {
    name: 'odcs-element-after-global-expansion',
    scope: '.odcs-dataset',
    show: async page => {
      await fileTab(contract, 'Graph')(page);
      await expect(page.locator('.lineage-card.center')).toBeVisible();
      await page.getByRole('button', { name: '3 hops', exact: true }).click();
      await fileTab(contract, 'Contract')(page);
      await page.getByRole('button', { name: `Open ${table}`, exact: true }).click();
      await page.getByRole('tab', { name: 'Lineage', exact: true }).click();
      await expect(page.locator('.odcs-lineage-host .lineage-card.center')).toBeVisible();
      await page.locator('.odcs-lineage-host').scrollIntoViewIfNeeded();
    },
    inspect: async page => {
      const problems = await odcsGraphProblems(page, { fitAllCards: true });
      await expect(page.locator('.odcs-lineage-host .lineage-card')).toHaveCount(3);
      const center = await page.locator('.lineage-card.center').getAttribute('aria-label');
      if (center !== `Table ${table}`) problems.push(`element lineage is centered on ${center} instead of ${table}`);
      if (!((await page.getByRole('button', { name: '1 hop', exact: true }).getAttribute('aria-pressed')) === 'true')) {
        problems.push('element lineage inherits the global graph depth instead of starting at one degree');
      }
      if (await page.getByRole('button', { name: /^[45] hops$/ }).count()) problems.push('depth controls still offer four or five hops');
      await revealGraphControls(page);
      if (!(await page.getByRole('button', { name: 'Full pierce', exact: true }).count())) problems.push('Full pierce is not offered under its requested name');
      return problems;
    },
  },
  {
    name: 'metric-lineage',
    scope: '.kpi-detail',
    show: async page => {
      await fileTab('ubl.semantic.yaml', 'Metrics')(page);
      await page.getByRole('button', { name: /Order count: explain$/ }).click();
      await expect(page.locator('.kpi-lineage')).toBeVisible();
      await page.locator('.kpi-lineage').scrollIntoViewIfNeeded();
    },
  },
];
const requestedScreens = new Set(process.argv.slice(3));
const reviewScreens = screens.filter(screen => !requestedScreens.size || requestedScreens.has(screen.name));

await withCleanup(
  async () => {
    try {
      await browser?.close();
    } finally {
      await api.stop();
    }
  },
  async () => {
    const unknownScreens = [...requestedScreens].filter(name => !screens.some(screen => screen.name === name));
    if (unknownScreens.length) throw new Error(`Unknown review scenarios: ${unknownScreens.join(', ')}`);
    const project = await api.ws.loadExample('ubl');
    appendFileSync(projectFile(api.ws.layout, project.slug, 'ubl.ontology.yaml'), '\n# Visual review fixture\n');
    writeFileSync(
      projectFile(api.ws.layout, project.slug, 'visual-review-notes.txt'),
      `New file for visual review\n${'A long description that must remain readable in the Commit diff. '.repeat(8)}\n`,
    );
    browser = await chromium.launch({ channel: process.env.SW_BROWSER_CHANNEL });
    for (const viewport of viewports) {
      for (const screen of reviewScreens) {
        const page = await browser.newPage({ viewport, colorScheme: 'light' });
        page.setDefaultTimeout(10_000);
        page.setDefaultNavigationTimeout(30_000);
        const problems: string[] = [];
        page.on('pageerror', error => problems.push(`browser error: ${error.message}`));
        const screenshot = `${screen.name}-${viewport.width}.png`;
        try {
          await routeApi(page, api);
          await page.goto(appUrl());
          await screen.show(page);
          await page.waitForTimeout(500);
          problems.push(...(await geometryProblems(page, screen.scope)), ...(await clippedTextProblems(page, screen.scope)), ...(await cutContent(page, screen.scope)));
          if (screen.inspect) problems.push(...(await screen.inspect(page)));
        } catch (error) {
          problems.push(`inspection failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        try {
          await page.screenshot({ path: join(directory, screenshot) });
        } catch (error) {
          problems.push(`capture failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          await page.close();
        }
        findings.push({ screen: screen.name, ...viewport, screenshot, problems: [...new Set(problems)] });
        writeFileSync(join(directory, 'report.json'), JSON.stringify({ baseUrl: appUrl(), findings }, null, 2));
        console.log(`${problems.length ? 'FAIL' : 'PASS'} ${screen.name} ${viewport.width}: ${problems.length} findings`);
      }
    }
  },
);
const failures = findings.filter(finding => finding.problems.length > 0);
console.log(`Visual review: ${findings.length} captures, ${failures.length} screens with findings. Report: ${join(directory, 'report.json')}`);
if (failures.length) process.exitCode = 1;
