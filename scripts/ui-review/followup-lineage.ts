// Defines independent lineage column, connection, toolbar, and zero-binding captures. Imported by followup-local.
import { expect, type Page } from '@playwright/test';
import { fileTab, showSidebar } from '../helpers/screen-tour';
import { clickConnection } from './followup-graphs';
import type { State, View } from './followup-capture';

async function openLineage(page: Page, dataset: boolean, file: string) {
  await fileTab(file, dataset ? 'Contract' : 'Graph')(page);
  if (dataset) {
    await page.getByRole('button', { name: 'Open properties', exact: true }).click();
    await page.getByRole('tab', { name: 'Lineage', exact: true }).click();
  }
  await page.locator('.lineage-card').first().waitFor();
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.waitForTimeout(400);
}

async function lineageCheck(page: Page) {
  return {
    cards: await page.locator('.lineage-card').count(),
    loading: await page.getByText('Laying out the lineage…', { exact: true }).count(),
    lists: await page.locator('.lineage-list').count(),
    selected_path: await page.getByRole('region', { name: 'Selected path', exact: true }).allTextContents(),
  };
}

/** Lists lineage states using real controls and the existing wide-lines test fixture. */
export function lineageStates(view: View): State[] {
  const states: State[] = [];
  for (const [screen, file, dataset] of [
    ['commerce-lineage', 'commerce.odcs.yaml', false],
    ['mall-properties-lineage', 'mall.odcs.yaml', true],
  ] as const) {
    states.push({
      screen,
      state: 'more-columns-open',
      action: async page => {
        await openLineage(page, dataset, file);
        await page
          .getByRole('button', { name: /^Show all \d+ columns of/ })
          .first()
          .click();
      },
      check: async page => {
        await expect(page.locator('.lineage-list').first()).toBeVisible();
        await expect(page.getByRole('button', { name: 'Show fewer', exact: true }).first()).toBeVisible();
        return lineageCheck(page);
      },
    });
    states.push({
      screen,
      state: 'single-line-selected',
      action: async (page, record) => {
        await openLineage(page, dataset, file);
        await page.locator('.lineage-flow').scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        try {
          record('clicked-line', await clickConnection(page, 'g.lineage-edge[data-edge-kind="foreign-key"][data-count="1"]'));
        } catch (error) {
          record('first-line-click-unavailable', String(error));
          const controls = page.getByRole('button', { name: 'Controls', exact: true });
          if (await controls.isVisible()) await controls.click();
          await page.getByRole('button', { name: 'Zoom out', exact: true }).click({ clickCount: 2 });
          if (await controls.isVisible()) await controls.click();
          await page.waitForTimeout(400);
          record('clicked-line-after-zoom', await clickConnection(page, 'g.lineage-edge[data-edge-kind="foreign-key"][data-count="1"]'));
        }
        const selectedPath = page.getByRole('button', { name: /^Selected path/ });
        if (await selectedPath.isVisible()) await selectedPath.click();
      },
      check: async page => {
        await expect(page.getByRole('region', { name: 'Selected path', exact: true })).toBeVisible();
        await expect(page.locator('g.lineage-edge[data-on-path="true"]').first()).toBeVisible();
        return lineageCheck(page);
      },
    });
    let bundleSize = 0;
    let bundlesBefore = 0;
    states.push({
      screen,
      state: 'bundled-line-split',
      action: async (page, record) => {
        await openLineage(page, dataset, file);
        await page.locator('.lineage-flow').scrollIntoViewIfNeeded();
        const counts = await page.locator('g.lineage-edge').evaluateAll(edges => edges.map(edge => Number(edge.getAttribute('data-count'))));
        record('visible-line-counts', counts);
        bundleSize = counts.find(count => count > 1) ?? 0;
        if (!bundleSize) throw new Error('The first-view canvas contains no bundled line; drawn counts: ' + counts.join(', '));
        const selector = `g.lineage-edge[data-count="${bundleSize}"]`;
        bundlesBefore = await page.locator(selector).count();
        record('clicked-bundle', await clickConnection(page, selector));
      },
      check: async page => {
        const bundlesAfter = await page.locator(`g.lineage-edge[data-count="${bundleSize}"]`).count();
        expect(bundlesAfter).toBeLessThan(bundlesBefore);
        return { split: true, bundle_size: bundleSize, bundles_before: bundlesBefore, bundles_after: bundlesAfter, ...(await lineageCheck(page)) };
      },
    });
    if (view.width === 1440) {
      states.push({
        screen,
        state: 'toolbar-controls-open',
        action: async page => {
          await openLineage(page, dataset, file);
          const controls = page.getByRole('button', { name: 'Controls', exact: true });
          if (!(await controls.count())) throw new Error('At 1440 the secondary controls render inline; there is no Controls menu to open');
          await controls.click();
        },
        check: async page => {
          await expect(page.getByRole('button', { name: 'Controls', exact: true })).toHaveAttribute('aria-expanded', 'true');
          return { panel_open: await page.getByRole('group', { name: 'Graph controls', exact: true }).isVisible() };
        },
      });
    }
    if (view.width === 1280) {
      states.push({
        screen,
        state: 'toolbar-zoom-row',
        action: page => openLineage(page, dataset, file),
        check: async page => {
          await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible();
          await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeVisible();
          return { zoom_in: await page.getByRole('button', { name: 'Zoom in', exact: true }).boundingBox(), zoom_out: await page.getByRole('button', { name: 'Zoom out', exact: true }).boundingBox() };
        },
      });
    }
  }
  states.push({
    screen: 'ubl-contract-lineage',
    state: 'wide-column-filter',
    action: async (page, record) => {
      await openLineage(page, false, 'ubl.odcs.yaml');
      await page.getByRole('textbox', { name: 'Find assets', exact: true }).fill('consignment');
      await page.getByRole('listbox', { name: 'Asset results' }).getByRole('option').filter({ hasText: 'Table' }).first().click();
      const center = page.locator('.lineage-card.center');
      await expect(center).toHaveAttribute('aria-label', 'Table consignment');
      await page.waitForTimeout(500);
      const more = center.getByRole('button', { name: /^Show all \d+ columns of/ });
      record('wide-card', { label: await more.getAttribute('aria-label') });
      await more.click();
      await center.getByRole('searchbox', { name: /^Filter columns of/ }).fill('carrier');
    },
    check: async page => {
      const center = page.locator('.lineage-card.center');
      await expect(center.getByRole('searchbox', { name: /^Filter columns of/ })).toHaveValue('carrier');
      return { ...(await lineageCheck(page)), filtered_count: await center.locator('.lineage-list-foot').innerText() };
    },
  });
  states.push({
    screen: 'wide-lineage',
    state: 'bundled-line-split',
    action: async (page, record) => {
      await openLineage(page, false, 'wide.odcs.yaml');
      await expect(page.locator('g.lineage-edge[data-count="9"]')).toHaveCount(1);
      record('before-split', { bundles: await page.locator('g.lineage-edge[data-count="9"]').count(), fixture: 'Existing lineage-browser-check wide-table fixture, nine reads' });
      record('clicked-bundle', await clickConnection(page, 'g.lineage-edge[data-count="9"]'));
    },
    check: async page => {
      await expect(page.locator('g.lineage-edge[data-count="9"]')).toHaveCount(0);
      await expect(page.locator('g.lineage-edge[data-edge-kind="reads"]')).toHaveCount(9);
      return { split: true, single_reads: 9 };
    },
  });
  return states;
}

/** Captures each requested empty mapping delay from a separate context and actual Graph click. */
export function emptyMappingStates(): State[] {
  return [1, 5, 15].map(seconds => {
    let opened = 0;
    return {
      screen: 'zero-mapping-graph',
      state: `after-${seconds}s`,
      timed: true,
      action: async (page, record) => {
        await showSidebar(page);
        await page.getByRole('button', { name: 'Model explorer', exact: true }).click();
        const project = page.getByRole('treeitem', { name: 'Unbound commerce', exact: true });
        if ((await project.getAttribute('aria-expanded')) === 'false') await project.getByRole('button', { name: 'Unbound commerce', exact: true }).click();
        await project.getByRole('button', { name: 'commerce.mapping.yaml', exact: true }).click();
        await page.waitForTimeout(500);
        opened = performance.now();
        await page.locator('.tabs').getByRole('button', { name: 'Graph', exact: true }).click();
        await page.waitForTimeout(Math.max(0, seconds * 1000 - (performance.now() - opened)));
        record('before-timed-capture', { elapsed_ms: performance.now() - opened, loading: await page.getByText('Laying out the lineage…', { exact: true }).count() });
      },
      check: async page => ({
        elapsed_ms: performance.now() - opened,
        loading: await page.getByText('Laying out the lineage…', { exact: true }).count(),
        cards: await page.locator('.lineage-card').count(),
        selected_tab: await page.locator('.tabs [aria-current=page]').innerText(),
        message: await page.locator('.mapping-canvas').innerText(),
      }),
    };
  });
}
