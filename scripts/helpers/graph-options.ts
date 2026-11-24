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
export async function viewOptions(page: Page, use: (options: Locator) => Promise<void>, title = 'View options') {
  await revealGraphControls(page);
  const options = graphOptions(page, title);
  await expect(options).toBeVisible();
  await use(options);
  await hideGraphControls(page);
}

/** Chooses a graph layout in the toolbar's Layered / Network switch. */
export async function chooseLayout(options: Locator, layout: 'layered' | 'network') {
  const name = layout === 'layered' ? 'Layered' : 'Network';
  const choice = options.getByRole('radiogroup', { name: 'Graph layout' }).getByRole('radio', { name, exact: true });
  await choice.click();
  await expect(choice).toBeChecked();
}

/** The Show menu's button in the toolbar; its name lists the switches that are on. */
function showMenuTrigger(options: Locator): Locator {
  return options.getByRole('button', { name: /^Show(:|$)/ });
}

/**
 * The switch for one kind of graph content, such as Labels or Metrics. Most of them sit in the
 * toolbar's Show menu, which this opens; the others are toolbar buttons with a pressed state.
 */
export async function showToggle(options: Locator, name: string | RegExp): Promise<{ toggle: Locator; state: 'aria-checked' | 'aria-pressed' }> {
  const trigger = showMenuTrigger(options);
  if ((await trigger.count()) > 0) {
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
    const item = options.getByRole('menuitemcheckbox', { name, exact: typeof name === 'string' });
    if ((await item.count()) > 0) return { toggle: item, state: 'aria-checked' };
    await trigger.click();
  }
  return { toggle: options.getByRole('button', { name, exact: typeof name === 'string' }), state: 'aria-pressed' };
}

/** Closes the Show menu if a step left it open. */
async function closeShowMenu(options: Locator) {
  const trigger = showMenuTrigger(options);
  if ((await trigger.count()) > 0 && (await trigger.getAttribute('aria-expanded')) === 'true') await trigger.click();
}

/** Checks whether one kind of graph content is shown. */
export async function expectShown(options: Locator, name: string | RegExp, shown: boolean) {
  const { toggle, state } = await showToggle(options, name);
  await expect(toggle).toHaveAttribute(state, String(shown));
  await closeShowMenu(options);
}

/** Turns a show/hide switch on or off and waits for its state to follow. */
export async function setShown(options: Locator, name: string | RegExp, shown: boolean) {
  const { toggle, state } = await showToggle(options, name);
  const wanted = String(shown);
  if ((await toggle.getAttribute(state)) !== wanted) await toggle.click();
  await expect(toggle).toHaveAttribute(state, wanted);
  await closeShowMenu(options);
}

/** Flips a show/hide switch, whatever its state. */
export async function toggleShown(options: Locator, name: string | RegExp) {
  const { toggle, state } = await showToggle(options, name);
  const before = await toggle.getAttribute(state);
  await toggle.click();
  await expect(toggle).not.toHaveAttribute(state, before ?? '');
  await closeShowMenu(options);
}

/** Opens every area of the whole-model graph, which starts with one card per area when the model is very large. */
export async function showEveryEntity(page: Page) {
  await viewOptions(page, async options => {
    await expect(page.locator('.full-graph-loading')).toHaveCount(0);
    const expandAll = options.getByRole('button', { name: 'Expand all', exact: true });
    if (await expandAll.isEnabled()) await expandAll.click();
    await expect(page.locator('.full-graph-loading')).toHaveCount(0);
  });
}
