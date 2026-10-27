// The whole-model graph and neighborhood screens, for the responsive suite and the capture tools.
import { expect, type Page } from '@playwright/test';
import { revealGraphControls, setShown, viewOptions } from './graph-options';
import { fileTab, type Screen } from './screen-tour';
import { graphCanvasProblems } from './graph-canvas-geometry';
import { graphControlsProblems } from './graph-paint-geometry';

/** Hover targets on the neighborhood's relationship lines, each one reachable by the pointer. */
async function reachableEdgePoints(page: Page) {
  return page.evaluate(() => {
    const points: { x: number; y: number }[] = [];
    for (const path of document.querySelectorAll<SVGPathElement>(
      '.neighborhood-graph .react-flow__edge-path',
    )) {
      const matrix = path.getScreenCTM();
      if (!matrix) continue;
      for (const fraction of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        const local = path.getPointAtLength(path.getTotalLength() * fraction);
        const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix);
        const hit = document.elementFromPoint(screen.x, screen.y)?.closest('.react-flow__edge');
        if (hit === path.closest('.react-flow__edge')) points.push({ x: screen.x, y: screen.y });
      }
    }
    return points;
  });
}

// A label is drawn only where it fits whole inside the canvas, so a line whose label would hang
// over the edge of a panned view shows none; the pointer tries lines until one shows its label.
async function hoverRelationship(page: Page) {
  const points = await reachableEdgePoints(page);
  expect(points.length, 'a neighborhood relationship has a reachable hover target').toBeGreaterThan(
    0,
  );
  const label = page.locator('.neighborhood-graph .relationship-label').first();
  for (const point of points) {
    await page.mouse.move(point.x, point.y);
    if (await label.isVisible()) return;
    await page.waitForTimeout(60);
  }
  await expect(label).toBeVisible();
}

/** Lists the model graph and the neighborhood in their first view and after opening more. */
export function graphScreens(ontology: string): Screen[] {
  return [
    { name: 'graph-model-first-view', show: fileTab(ontology, 'Graph') },
    {
      name: 'graph-model-all-areas',
      show: async page => {
        await fileTab(ontology, 'Graph')(page);
        await revealGraphControls(page);
        const expandAll = page.getByRole('button', { name: 'Expand all', exact: true });
        if (await expandAll.isEnabled()) await expandAll.click();
        await page.waitForTimeout(1500);
      },
    },
    {
      name: 'graph-model-options',
      show: async page => {
        await fileTab(ontology, 'Graph')(page);
        await revealGraphControls(page);
      },
    },
    { name: 'graph-neighborhood-first-view', show: fileTab(ontology, 'Neighborhood') },
    {
      name: 'graph-neighborhood-hover-label',
      show: async page => {
        await fileTab(ontology, 'Neighborhood')(page);
        await hoverRelationship(page);
      },
    },
    {
      name: 'graph-neighborhood-labels',
      show: async page => {
        await fileTab(ontology, 'Neighborhood')(page);
        await revealGraphControls(page);
        const zoom = () =>
          page
            .locator('.neighborhood-graph .react-flow__viewport')
            .evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a);
        while ((await zoom()) < 1) {
          const previous = await zoom();
          await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
          await expect.poll(zoom).toBeGreaterThan(previous);
        }
        await viewOptions(page, options => setShown(options, 'Labels', true));
        const controls = page.getByRole('button', { name: 'Controls', exact: true });
        if ((await controls.count()) && (await controls.getAttribute('aria-expanded')) === 'true') {
          await controls.click();
        }
      },
    },
    {
      name: 'graph-neighborhood-more',
      show: async page => {
        await fileTab(ontology, 'Neighborhood')(page);
        const more = page.getByRole('button', { name: /^\d+ more neighbors?$/ });
        if (await more.isVisible()) await more.click();
        await page.waitForTimeout(800);
      },
    },
  ];
}

// Phone controls must be opened before their labels can be inspected.
async function expectCompactControls(page: Page, neighborhood: boolean) {
  const controls = page.getByRole('button', { name: 'Controls', exact: true });
  const folded = (await controls.count()) > 0;
  const wasClosed = folded && (await controls.getAttribute('aria-expanded')) === 'false';
  await revealGraphControls(page);
  expect(await graphControlsProblems(page)).toEqual([]);
  if (neighborhood) {
    await expect(page.locator('.neighborhood-graph .pierce-direction-label')).toHaveText('Expand:');
  }
  if (wasClosed) await controls.click();
}

/** Returns the graph problems of a screen of this tour; dialogs are covered by the text checks. */
export async function graphScreenProblems(page: Page, screen: Screen): Promise<string[]> {
  if (screen.dialog) return [];
  const which = screen.name.startsWith('graph-model') ? 'model' : 'neighborhood';
  await expectCompactControls(page, which === 'neighborhood');
  if (screen.name === 'graph-neighborhood-hover-label') await hoverRelationship(page);
  if (screen.name === 'graph-neighborhood-labels') {
    await expect(page.locator('.neighborhood-graph .relationship-label').first()).toBeVisible();
  }
  // With every area open the model zooms out, so only the first view must keep names readable.
  const allOpen = screen.name === 'graph-model-all-areas';
  const problems = (await graphCanvasProblems(page, which)).filter(
    problem => !(allOpen && /^name "[\s\S]*" is \d+\.\d px on screen$/.test(problem)),
  );
  return problems.map(problem => `${screen.name}: ${problem}`);
}
