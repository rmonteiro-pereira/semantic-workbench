// Drives the Group menu in the Graph toolbar for the browser suites.
import { expect, type Locator, type Page } from '@playwright/test';

/** The toolbar button that opens the Group menu. */
export function groupTrigger(page: Page): Locator {
  return page.getByRole('button', { name: /^Group:/ });
}

/** Opens the Group menu if it is closed and returns it. */
export async function openGroupMenu(page: Page): Promise<Locator> {
  const menu = page.getByRole('menu', { name: 'Group by' });
  // On a phone the Group button sits behind the Controls button of the graph toolbar.
  const controls = page.getByRole('button', { name: 'Controls', exact: true });
  if (!(await groupTrigger(page).isVisible()) && (await controls.isVisible())) await controls.click();
  if (!(await menu.isVisible())) await groupTrigger(page).click();
  await expect(menu).toBeVisible();
  return menu;
}

/** Picks one entry of the Group menu by its label, for example "Suggested communities" or "Automatic". */
export async function chooseGrouping(page: Page, label: string | RegExp): Promise<void> {
  const menu = await openGroupMenu(page);
  // A label such as "Suggested communities" must not also match the Automatic entry that names it.
  const name = typeof label === 'string' ? new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : label;
  await menu.getByRole('menuitemradio', { name }).click();
  await expect(menu).toHaveCount(0);
}

/** The labels of every entry in the Group menu, which opens and closes it. */
export async function groupingMenuLabels(page: Page): Promise<string[]> {
  const menu = await openGroupMenu(page);
  const labels = await menu.getByRole('menuitemradio').evaluateAll(items => items.map(item => item.querySelector('small')!.previousSibling!.textContent ?? ''));
  await page.keyboard.press('Escape');
  return labels;
}
