// Defines fresh Full graph and Neighborhood states. Imported by followup-local; no additional environment variables.
import { expect, type Page } from '@playwright/test';
import { fileTab } from '../helpers/screen-tour';
import { viewOptions, chooseLayout, setShown, showEveryEntity, revealGraphControls, hideGraphControls } from '../helpers/graph-options';
import type { State, View } from './followup-capture';

/** Measures the rendered viewport and the union of node boxes in pane coordinates. */
export async function graphMeasurement(page: Page) {
  return page.locator('.neighborhood-graph .react-flow').evaluate(pane => {
    const viewport = pane.querySelector('.react-flow__viewport')!;
    const matrix = new DOMMatrix(getComputedStyle(viewport).transform);
    const canvas = pane.getBoundingClientRect();
    const boxes = [...pane.querySelectorAll('.react-flow__node')].map(node => node.getBoundingClientRect());
    return {
      transform: { x: matrix.m41, y: matrix.m42, zoom: matrix.m11 },
      node_count: boxes.length,
      pane: { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height },
      node_union_relative: boxes.length
        ? {
            x: Math.min(...boxes.map(box => box.left)) - canvas.left,
            y: Math.min(...boxes.map(box => box.top)) - canvas.top,
            right: Math.max(...boxes.map(box => box.right)) - canvas.left,
            bottom: Math.max(...boxes.map(box => box.bottom)) - canvas.top,
          }
        : null,
    };
  });
}

/** Clicks an uncovered entity using the same node DOM as the repository graph checks. */
export async function clickNode(page: Page, selector: string) {
  const target = await page.locator(selector).evaluateAll(nodes => {
    for (const node of nodes) {
      const box = node.getBoundingClientRect();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const top = document.elementFromPoint(x, y);
      if (top && node.contains(top)) return { x, y, text: node.textContent };
    }
    return null;
  });
  if (!target) throw new Error(`No uncovered node matches ${selector}`);
  await page.mouse.click(target.x, target.y);
  return target;
}

/** Clicks a drawn SVG connection at an uncovered point without dispatching synthetic events. */
export async function clickConnection(page: Page, selector: string) {
  const target = await page.locator(selector).evaluateAll(edges => {
    for (const edge of edges) {
      const path = edge.querySelector('.react-flow__edge-interaction') as SVGPathElement | null;
      const matrix = path?.getScreenCTM();
      const wrapper = edge.closest('.react-flow__edge');
      if (!path || !matrix || !wrapper) continue;
      for (const fraction of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
        const local = path.getPointAtLength(path.getTotalLength() * fraction);
        const point = { x: matrix.a * local.x + matrix.c * local.y + matrix.e, y: matrix.b * local.x + matrix.d * local.y + matrix.f };
        const top = document.elementFromPoint(point.x, point.y);
        if (top && wrapper.contains(top)) return { ...point, edge: wrapper.getAttribute('data-id') };
      }
    }
    return null;
  });
  if (!target) throw new Error(`No uncovered connection matches ${selector}`);
  await page.mouse.click(target.x, target.y);
  return target;
}

async function fullGraph(page: Page, layout: 'network' | 'layered') {
  await fileTab('ubl.ontology.yaml', 'Graph')(page);
  await viewOptions(page, options => chooseLayout(options, layout));
  await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await showEveryEntity(page);
  await page.locator('.full-graph-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await page.getByRole('button', { name: 'Fit model', exact: true }).click();
  await page.waitForTimeout(500);
}

async function fullStateCheck(page: Page, labels = false, minimap = false, inspector = false) {
  const info = {
    labels: (await page.getByRole('button', { name: 'Labels', exact: true }).count()) ? await page.getByRole('button', { name: 'Labels', exact: true }).getAttribute('aria-pressed') : 'folded',
    minimap: await page.locator('.react-flow__minimap').count(),
    inspector: await page.locator('.inspector').isVisible(),
    layout: await page.locator('.full-graph').getAttribute('data-layout'),
  };
  if (info.labels !== 'folded') expect(info.labels).toBe(String(labels));
  expect(Boolean(info.minimap)).toBe(minimap);
  expect(info.inspector).toBe(inspector);
  return info;
}

/** Lists independent full-model states for the requested viewport. */
export function fullGraphStates(view: View): State[] {
  const states: State[] = [
    {
      screen: 'ubl-full-graph',
      state: 'network-node-selected',
      action: async (page, record) => {
        await fullGraph(page, 'network');
        record('clicked-node', await clickNode(page, '.full-entity'));
      },
      check: async page => {
        await expect(page.locator('.inspector h2')).toBeVisible();
        return fullStateCheck(page, false, false, true);
      },
    },
  ];
  if (view.width !== 1440) return states;
  states.push({
    screen: 'ubl-full-graph',
    state: 'layered-node-selected',
    action: async (page, record) => {
      await fullGraph(page, 'layered');
      record('clicked-node', await clickNode(page, '.full-entity'));
    },
    check: async page => fullStateCheck(page, false, false, true),
  });
  states.push({
    screen: 'ubl-full-graph',
    state: 'network-edge-selected',
    action: async (page, record) => {
      await fullGraph(page, 'network');
      record('clicked-edge', await clickConnection(page, '.full-graph .react-flow__edge'));
    },
    check: async page => {
      await expect(page.locator('.inspector .badge')).toBeVisible();
      return { ...(await fullStateCheck(page, false, false, true)), relationship: await page.locator('.inspector h2').innerText() };
    },
  });
  for (const [state, toggle] of [
    ['labels-alone', 'Labels'],
    ['mini-map-alone', 'Mini-map'],
  ]) {
    states.push({
      screen: 'ubl-full-graph',
      state,
      action: async page => {
        await fullGraph(page, 'network');
        await viewOptions(page, options => setShown(options, toggle, true));
      },
      check: page => fullStateCheck(page, toggle === 'Labels', toggle === 'Mini-map', false),
    });
  }
  return states;
}

/** Lists Neighborhood sequences with measurements after every transition. */
export function neighborhoodStates(view: View): State[] {
  if (view.theme !== 'light' || ![1280, 1440].includes(view.width)) return [];
  const names = view.width === 1280 ? ['first-labels'] : ['first-labels', 'pierce-back-labels', 'pierce-alone', 'node-selected'];
  return names.map(state => ({
    screen: 'ubl-neighborhood',
    state,
    action: async (page, record) => {
      await fileTab('ubl.ontology.yaml', 'Neighborhood')(page);
      await page.locator('.neighborhood-node').first().waitFor();
      record('first-view', await graphMeasurement(page));
      if (state.startsWith('pierce')) {
        await revealGraphControls(page);
        await page.getByRole('radiogroup', { name: 'Pierce direction' }).getByRole('radio', { name: 'Both', exact: true }).click();
        record('direction-both', await graphMeasurement(page));
        await page.getByRole('button', { name: 'Full pierce', exact: true }).click();
        await hideGraphControls(page);
        await expect(page.locator('.pierce-banner')).toBeVisible();
        await page.getByRole('button', { name: 'Stop', exact: true }).waitFor({ state: 'hidden' });
        await page.waitForTimeout(500);
        record('full-pierce', await graphMeasurement(page));
      }
      if (state === 'pierce-back-labels') {
        await page.locator('.neighborhood-graph').getByRole('button', { name: 'Back', exact: true }).click();
        await page.waitForTimeout(300);
        record('back', await graphMeasurement(page));
      }
      if (state.endsWith('labels')) {
        await viewOptions(page, options => setShown(options, 'Labels', true));
        record('labels-on', await graphMeasurement(page));
      }
      if (state === 'node-selected') {
        record('clicked-node', await clickNode(page, '.neighborhood-node'));
        record('node-selected', await graphMeasurement(page));
      }
    },
    check: async page => {
      const label = String(state.endsWith('labels'));
      await viewOptions(page, async options => {
        await expect(options.getByRole('button', { name: 'Labels', exact: true })).toHaveAttribute('aria-pressed', label);
      });
      expect(await page.locator('.inspector').isVisible()).toBe(state === 'node-selected');
      if (state === 'pierce-alone') await expect(page.locator('.pierce-banner')).toBeVisible();
      return {
        labels: label,
        measurement: await graphMeasurement(page),
        banner: await page.locator('.pierce-banner').allTextContents(),
        fitPrompt: await page.getByRole('button', { name: /^\d+ entities, Fit$/ }).allTextContents(),
      };
    },
  }));
}
