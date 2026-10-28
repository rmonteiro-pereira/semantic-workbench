// Opens the sidebar's Add project menu and Settings panel the way a person does, so browser
// checks reach Import files, the examples, Theme, Clear workspace and Admin through them.
import { expect, type Page } from '@playwright/test';
import { showSidebar } from './screen-tour';

/** Opens the Add project menu when it is closed and returns the named item. */
export async function addProjectItem(page: Page, name: string | RegExp) {
  await showSidebar(page);
  const button = page.getByRole('button', { name: 'Add project', exact: true });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  return page.getByRole('menuitem', { name, exact: typeof name === 'string' });
}

/** Opens the Settings panel when it is closed and returns it. */
export async function openSettings(page: Page) {
  const button = page.getByRole('button', { name: 'Settings', exact: true });
  // A harness that renders the Settings row alone has no sidebar to show.
  if (!(await button.isVisible())) await showSidebar(page);
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  const panel = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

/** Chooses one action in the Settings panel, such as Clear workspace or Admin. */
export async function chooseSetting(page: Page, name: string) {
  const panel = await openSettings(page);
  await panel.getByRole('button', { name, exact: true }).click();
}
