// The whole-model graph and neighborhood screens, for the responsive suite and the capture tools.
import { expect, type Page } from '@playwright/test';
import { viewOptions, revealGraphControls } from './graph-options';
import { fileTab, type Screen } from './screen-tour';
import { graphCanvasProblems } from './graph-canvas-geometry';
import { graphControlsProblems } from './graph-paint-geometry';

async function openOptions(page: Page) {
  await revealGraphControls(page);
  await page.getByRole('button', { name: /^View options/ }).click();
}

async function hoverRelationship(page: Page) {
  const point = await page.evaluate(() => {
    for (const path of document.querySelectorAll<SVGPathElement>(
      '.neighborhood-graph .react-flow__edge-path',
    )) {
      const matrix = path.getScreenCTM();
      if (!matrix) continue;
      for (const fraction of [0.5, 0.25, 0.75, 0.1, 0.9]) {
        const local = path.getPointAtLength(path.getTotalLength() * fraction);
        const screen = new DOMPoint(local.x, local.y).matrixTransform(matrix);
        const hit = document.elementFromPoint(screen.x, screen.y)?.closest('.react-flow__edge');
        if (hit === path.closest('.react-flow__edge')) return { x: screen.x, y: screen.y };
      }
    }
    return null;
  });
  expect(point, 'a neighborhood relationship has a reachable hover target').not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  await expect(page.locator('.neighborhood-graph .relationship-label').first()).toBeVisible();
}

/** Lists the model graph and the neighborhood in their first view and after opening more. */
export function graphScreens(ontology: string): Screen[] {
  return [
    { name: 'graph-model-first-view', show: fileTab(ontology, 'Graph') },
    {
      name: 'graph-model-all-areas',
      show: async page => {
        await fileTab(ontology, 'Graph')(page);
        await openOptions(page);
        const expandAll = page.getByRole('button', { name: 'Expand all', exact: true });
        if (await expandAll.isEnabled()) await expandAll.click();
        await page.getByRole('button', { name: 'Done', exact: true }).click();
        await page.waitForTimeout(1500);
      },
    },
    {
      name: 'graph-model-options',
      dialog: 'dialog[open]',
      show: async page => {
        await fileTab(ontology, 'Graph')(page);
        await openOptions(page);
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
        await viewOptions(page, async options => {
          const labelsOff = options.getByRole('button', { name: 'Labels off', exact: true });
          if (await labelsOff.count()) await labelsOff.click();
        });
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
    problem => !(allOpen && problem.startsWith('name ')),
  );
  return problems.map(problem => `${screen.name}: ${problem}`);
}
