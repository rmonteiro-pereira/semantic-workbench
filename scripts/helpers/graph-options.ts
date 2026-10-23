// Drives the View options dialog that holds a graph toolbar's secondary controls.
import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the options dialog (View options unless another title is given), runs the steps inside
 * it and closes it with Done. */
export async function viewOptions(
  page: Page,
  use: (options: Locator) => Promise<void>,
  title = 'View options',
) {
  await page.getByRole('button', { name: new RegExp(`^${title}`) }).click();
  const options = page.getByRole('dialog', { name: title });
  await expect(options).toBeVisible();
  await use(options);
  await options.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(options).toHaveCount(0);
}
