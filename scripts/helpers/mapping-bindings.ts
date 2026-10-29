import { expect, type Page } from '@playwright/test';

/** The number of bindings the "Where it lives" card of the Mappings tab reports for the selected concept. */
export async function expectResolvedBindings(page: Page, count: number) {
  const noun = count === 1 ? 'binding' : 'bindings';
  await expect(page.locator('.mapping-detail .mapping-card').nth(1)).toContainText(`${count} ${noun} in`);
}

/** Presses "Show N more datasets" until every dataset row of the selected concept is rendered. */
export async function showAllDatasets(page: Page) {
  const buttons = page.locator('.mapping-detail .mapping-show-more button:not(:has-text("fewer"))');
  while (await buttons.count()) {
    await buttons.first().click();
  }
}

/** Selects a concept, pressing "Show all N concepts" first when it sits past the first rows. */
export async function chooseConcept(page: Page, name: RegExp) {
  const concept = page.locator('.mapping-concepts .mapping-concept').filter({ hasText: name });
  // The list loads with the mapping, so wait for its rows before deciding whether to show them all.
  await expect(page.locator('.mapping-concepts .mapping-concept').nth(1)).toBeVisible();
  const more = page.locator('.mapping-concepts .mapping-show-more button:not(:has-text("fewer"))');
  if (!(await concept.count()) && (await more.count())) await more.first().click();
  await concept.first().click();
}
