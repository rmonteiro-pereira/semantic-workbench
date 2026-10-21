import type { Page } from '@playwright/test';
// v0.3.0 (FR-061): the "Load …" example buttons sit in a collapsible Examples group, collapsed once
// projects exist. Opens the group when needed and returns the button.
export async function example(page: Page, name: RegExp) {
  const button = page.getByRole('button', { name });
  // The group's default depends on whether projects exist: wait until the project list has loaded.
  await page.locator('.project-tree, .projects-empty').first().waitFor();
  await page.waitForTimeout(100);
  if (await button.isVisible()) return button;
  const group = page.getByRole('group', { name: 'Examples' });
  if ((await group.count()) && !(await group.evaluate(d => (d as HTMLDetailsElement).open)))
    await group.locator('summary').click();
  return button;
}
