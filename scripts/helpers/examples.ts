// Opens the examples list under Add project so browser checks can load an example.
import type { Page } from '@playwright/test';
import { addProjectItem } from './sidebar-menus';

/** Opens Add project, then Load an example, if needed and returns the matching example item. */
export async function example(page: Page, name: RegExp) {
  const item = page.getByRole('menuitem', { name });
  // Wait for the project list so the sidebar has settled before the menu opens.
  await page.locator('.project-tree, .projects-empty').first().waitFor();
  const examples = page.getByRole('menu', { name: 'Load an example', exact: true });
  if (await examples.isVisible()) return item;
  await (await addProjectItem(page, 'Load an example')).click();
  return item;
}
