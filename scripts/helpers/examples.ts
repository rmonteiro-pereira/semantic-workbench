// Opens the sidebar's Examples menu so browser checks can load an example.
import type { Page } from '@playwright/test';
// The "Load …" examples are menu items of the Examples button above Import.
// Opens the menu when it is closed and returns the menu item.
/** Opens the Examples menu if needed and returns the matching loader menu item. */
export async function example(page: Page, name: RegExp) {
  const item = page.getByRole('menuitem', { name });
  // Wait for the project list so the sidebar has settled before the menu opens.
  await page.locator('.project-tree, .projects-empty').first().waitFor();
  const button = page.getByRole('button', { name: 'Examples', exact: true });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  return item;
}
