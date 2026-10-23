// The whole-model graph and neighborhood screens, for the responsive suite and the capture tools.
import type { Page } from '@playwright/test';
import { revealGraphControls } from './graph-options';
import { fileTab, type Screen } from './screen-tour';
import { graphCanvasProblems } from './graph-canvas-geometry';

async function openOptions(page: Page) {
  await revealGraphControls(page);
  await page.getByRole('button', { name: /^View options/ }).click();
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

/** Returns the graph problems of a screen of this tour; dialogs are covered by the text checks. */
export async function graphScreenProblems(page: Page, screen: Screen): Promise<string[]> {
  if (screen.dialog) return [];
  const which = screen.name.startsWith('graph-model') ? 'model' : 'neighborhood';
  // With every area open the model zooms out, so only the first view must keep names readable.
  const allOpen = screen.name === 'graph-model-all-areas';
  const problems = (await graphCanvasProblems(page, which)).filter(
    problem => !(allOpen && problem.startsWith('name ')),
  );
  return problems.map(problem => `${screen.name}: ${problem}`);
}
