// Drives the View options dialog that holds a graph toolbar's secondary controls.
import { expect, type Locator, type Page } from '@playwright/test';

/** On a phone the secondary toolbar controls sit behind a Controls button; opens that panel. */
export async function revealGraphControls(page: Page) {
  const folded = page.getByRole('button', { name: 'Controls', exact: true });
  if ((await folded.count()) === 0) return;
  if ((await folded.getAttribute('aria-expanded')) === 'false') await folded.click();
}

/** Opens the options dialog (View options unless another title is given), runs the steps inside
 * it and closes it with Done. */
export async function viewOptions(
  page: Page,
  use: (options: Locator) => Promise<void>,
  title = 'View options',
) {
  await revealGraphControls(page);
  await page.getByRole('button', { name: new RegExp(`^${title}`) }).click();
  const options = page.getByRole('dialog', { name: title });
  await expect(options).toBeVisible();
  await use(options);
  await options.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(options).toHaveCount(0);
}

/** Opens every area of the whole-model graph, which starts with one card per area in a small pane. */
export async function showEveryEntity(page: Page) {
  await viewOptions(page, async options => {
    const expandAll = options.getByRole('button', { name: 'Expand all', exact: true });
    if (await expandAll.isEnabled()) await expandAll.click();
  });
}
