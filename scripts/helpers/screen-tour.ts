// The screens and dialogs a person reaches from the sidebar and the view tabs. The responsive
// suite measures each of them at every viewport size, and the screenshot tool captures them.
import { expect, type Page } from '@playwright/test';
import { NARROW_SCREEN_PX } from '../../src/app/useNarrowScreen';
import { adminPageProblems } from './admin-page-geometry';
import { graphCanvasProblems } from './graph-canvas-geometry';
import { layoutProblems } from './layout-geometry';
import { smallTextProblems, textCollisionProblems } from './text-geometry';

/** One screen of the workbench and the steps that bring it into view. */
export type Screen = {
  name: string;
  show: (page: Page) => Promise<void>;
  /** The selector of the dialog that fills the screen, when the screen is a dialog. */
  dialog?: string;
};

/** Files the tour opens: an ontology with all view tabs and an ODCS contract. */
export type TourFiles = { ontology: string; contract: string };

/** Opens the sidebar drawer on a phone and shows the sidebar on a desktop. */
export async function showSidebar(page: Page) {
  const compact = (page.viewportSize()?.width ?? 0) < NARROW_SCREEN_PX;
  const toggleLabel = compact ? /^(Open|Close) workspace$/ : /^(Show|Hide) sidebar$/;
  await expect(page.locator('.workspace-toggle')).toHaveAttribute('aria-label', toggleLabel);
  const open = page.getByRole('button', { name: 'Open workspace', exact: true });
  if (await open.isVisible()) {
    await open.click();
  }
  const show = page.getByRole('button', { name: 'Show sidebar', exact: true });
  if (await show.isVisible()) await show.click();
  await expect(page.locator('.workspace-sidebar')).toBeVisible();
}

/** Opens a file from the sidebar. */
export async function openFile(page: Page, path: string) {
  await showSidebar(page);
  await page.getByRole('button', { name: path, exact: true }).first().click();
  await page.waitForTimeout(600);
  await expect(page.locator('.workspace-sidebar .document.chosen')).toHaveAttribute(
    'aria-label',
    path,
  );
}

async function openTab(page: Page, name: string) {
  const tabs = page.locator('.tabs');
  await expect(tabs).toBeVisible();
  const button = tabs.getByRole('button', { name: new RegExp(`^${name}`) });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
  await page.waitForTimeout(800);
  await expect(button).toHaveAttribute('aria-current', 'page');
}

async function pressSidebarButton(page: Page, name: string | RegExp) {
  await showSidebar(page);
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(500);
}

/** Opens a file and then one of its view tabs. */
export function fileTab(file: string, tab: string): Screen['show'] {
  return async page => {
    await showSidebar(page);
    await page.getByRole('button', { name: 'Model explorer', exact: true }).click();
    await openFile(page, file);
    await openTab(page, tab);
    await expect(page.locator('.workspace-sidebar .document.chosen')).toHaveAttribute(
      'aria-label',
      file,
    );
  };
}

/** Lists every screen of the tour for the two files it opens. */
export function tourScreens({ ontology, contract }: TourFiles): Screen[] {
  const modelTabs = [
    'Overview',
    'Graph',
    'Neighborhood',
    'Catalog',
    'Source',
    'Mappings',
    'Metrics',
  ];
  const screens: Screen[] = [{ name: 'sidebar-projects', show: showSidebar }];
  for (const tab of modelTabs) {
    screens.push({ name: `ontology-${tab.toLowerCase()}`, show: fileTab(ontology, tab) });
  }
  for (const tab of ['Contract', 'Graph']) {
    screens.push({ name: `contract-${tab.toLowerCase()}`, show: fileTab(contract, tab) });
  }
  screens.push(
    { name: 'source-control', show: page => pressSidebarButton(page, /Source control/) },
    { name: 'source-editor', show: page => pressSidebarButton(page, /Source editor/) },
    { name: 'trash', show: page => pressSidebarButton(page, 'Trash'), dialog: 'dialog[open]' },
    {
      name: 'import',
      show: async page => {
        await pressSidebarButton(page, /Import/);
        await expect(page.getByText('Uses the name of the definition you import.')).toBeVisible();
      },
      dialog: 'dialog[open]',
    },
  );
  return screens;
}

/** Shows one screen after closing whatever the previous screen left open. */
export async function showScreen(page: Page, screen: Screen) {
  await page.keyboard.press('Escape');
  await screen.show(page);
  await expect(page.locator('.full-graph-loading')).toHaveCount(0);
  await page.waitForTimeout(300);
}

/** Returns control, text size and text collision problems inside the `within` element. */
export async function geometryProblems(page: Page, within = 'body'): Promise<string[]> {
  return [
    ...(await layoutProblems(page)),
    ...(await smallTextProblems(page, within)),
    ...(await textCollisionProblems(page, within)),
  ];
}

/** Returns control, text size and text collision problems of the screen now shown. */
export async function screenProblems(page: Page, screen: Screen): Promise<string[]> {
  let within = screen.dialog ?? 'body';
  if (await page.locator('.canvas-row.is-fullscreen').isVisible()) {
    within = '.canvas-row.is-fullscreen';
  }
  const problems = await geometryProblems(page, within);
  if (
    screen.name.startsWith('ontology-neighborhood') &&
    !(await page.locator('.neighborhood-graph').isVisible())
  ) {
    problems.push('the intended Neighborhood canvas is not visible');
  }
  if (screen.name.endsWith('hover-label')) {
    await expect(page.locator('.neighborhood-graph .relationship-label').first()).toBeVisible();
  }
  if (screen.name.startsWith('admin-')) problems.push(...(await adminPageProblems(page)));
  const mapping = page.locator('[aria-label="Mapping graph"] .lineage-reading');
  if (await mapping.isVisible()) {
    await expect(mapping).toHaveText(/^Saved mapping · \d+ reachable assets · \d+ total assets$/);
  }
  const graphTour = screen.name.startsWith('graph-');
  if (!screen.dialog && !graphTour && (await page.locator('.full-graph').isVisible())) {
    problems.push(...(await graphCanvasProblems(page, 'model')));
  }
  if (!screen.dialog && !graphTour && (await page.locator('.neighborhood-graph').isVisible())) {
    problems.push(...(await graphCanvasProblems(page, 'neighborhood')));
  }
  if (screen.name === 'source-control') {
    const branch = page.getByRole('combobox', { name: 'Branch', exact: true });
    await expect(branch).toBeVisible();
    const selected = await branch.locator('option:checked').textContent();
    if (selected?.includes('(in use by')) {
      problems.push('the selected branch hides its holder inside the native selector');
    }
    const holder = page.locator('.branch-holder');
    if (await holder.count()) await expect(holder).toBeVisible();
  }
  return problems.map(problem => `${screen.name}: ${problem}`);
}
