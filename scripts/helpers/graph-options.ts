// Drives the secondary controls of a graph toolbar, which sit in the toolbar itself.
import { expect, type Locator, type Page } from '@playwright/test';

/** On a phone the secondary toolbar controls sit behind a Controls button; opens that panel. */
export async function revealGraphControls(page: Page) {
  const folded = page.getByRole('button', { name: 'Controls', exact: true });
  if ((await folded.count()) === 0) return;
  if ((await folded.getAttribute('aria-expanded')) === 'false') await folded.click();
}

/** Closes the folded Controls panel again, as a person does before going back to the graph. */
export async function hideGraphControls(page: Page) {
  const folded = page.getByRole('button', { name: 'Controls', exact: true });
  if ((await folded.count()) === 0) return;
  if ((await folded.getAttribute('aria-expanded')) === 'true') await folded.click();
}

/** The group of secondary controls in the visible graph toolbar. */
export function graphOptions(page: Page, title = 'View options'): Locator {
  return page.getByRole('group', { name: title, exact: true });
}

/** Reveals the toolbar's secondary controls (View options unless another title is given) and
 * runs the steps on them, then folds them away again. */
export async function viewOptions(
  page: Page,
  use: (options: Locator) => Promise<void>,
  title = 'View options',
) {
  await revealGraphControls(page);
  const options = graphOptions(page, title);
  await expect(options).toBeVisible();
  await use(options);
  await hideGraphControls(page);
}

/** Chooses a graph layout in the toolbar's Layered / Network switch. */
export async function chooseLayout(options: Locator, layout: 'layered' | 'network') {
  const name = layout === 'layered' ? 'Layered' : 'Network';
  const choice = options
    .getByRole('radiogroup', { name: 'Graph layout' })
    .getByRole('radio', { name, exact: true });
  await choice.click();
  await expect(choice).toBeChecked();
}

/** The show/hide switch for one kind of graph content, such as Labels or Metrics. */
export function showToggle(options: Locator, name: string | RegExp): Locator {
  return options.getByRole('button', { name, exact: typeof name === 'string' });
}

/** Turns a show/hide switch on or off and waits for its pressed state to follow. */
export async function setShown(options: Locator, name: string | RegExp, shown: boolean) {
  const toggle = showToggle(options, name);
  const pressed = String(shown);
  if ((await toggle.getAttribute('aria-pressed')) !== pressed) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', pressed);
}

/** Opens every area of the whole-model graph, which starts with one card per area when the model is very large. */
export async function showEveryEntity(page: Page) {
  await viewOptions(page, async options => {
    const expandAll = options.getByRole('button', { name: 'Expand all', exact: true });
    if (await expandAll.isEnabled()) await expandAll.click();
  });
}
