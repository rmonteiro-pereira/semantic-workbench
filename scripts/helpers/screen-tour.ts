// The screens and dialogs a person reaches from the sidebar and the view tabs. The responsive
// suite measures each of them at every viewport size, and the screenshot tool captures them.
import type { Page } from '@playwright/test';
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
  const open = page.getByRole('button', { name: 'Open workspace', exact: true });
  if (await open.isVisible()) {
    await open.click();
    return;
  }
  const show = page.getByRole('button', { name: 'Show sidebar', exact: true });
  if (await show.isVisible()) await show.click();
}

/** Opens a file from the sidebar. */
export async function openFile(page: Page, path: string) {
  await showSidebar(page);
  await page.getByRole('button', { name: path, exact: true }).first().click();
  await page.waitForTimeout(600);
}

async function openTab(page: Page, name: string) {
  const tabs = page.locator('.tabs');
  if (await tabs.isVisible()) {
    // A tab may carry a count, as in "Metrics 3".
    await tabs.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await page.waitForTimeout(800);
  }
}

async function pressSidebarButton(page: Page, name: string | RegExp) {
  await showSidebar(page);
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(500);
}

/** Opens a file and then one of its view tabs. */
export function fileTab(file: string, tab: string): Screen['show'] {
  return async page => {
    await openFile(page, file);
    await openTab(page, tab);
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
    { name: 'import', show: page => pressSidebarButton(page, /Import/), dialog: 'dialog[open]' },
  );
  return screens;
}

/** Shows one screen after closing whatever the previous screen left open. */
export async function showScreen(page: Page, screen: Screen) {
  await page.keyboard.press('Escape');
  await screen.show(page);
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
  const problems = await geometryProblems(page, screen.dialog ?? 'body');
  return problems.map(problem => `${screen.name}: ${problem}`);
}
