import { expect, type Page } from '@playwright/test';

/** The number of resolved bindings the Mappings tab reports, however many cards it renders. */
export async function expectResolvedBindings(page: Page, count: number) {
  const noun = count === 1 ? 'binding' : 'bindings';
  await expect(page.locator('.mapping-bindings > summary')).toContainText(
    `${count} resolved ${noun}`,
  );
}

/** Presses "Show more" in every dataset group until every binding card is rendered. */
export async function showAllBindings(page: Page) {
  const buttons = page.locator('.mapping-group .mapping-show-more button:not(:has-text("fewer"))');
  while (await buttons.count()) {
    await buttons.first().click();
  }
}

/** Selects a concept, pressing "Show more" in the concept list first when it sits past the limit. */
export async function chooseConcept(page: Page, name: RegExp) {
  const concept = page.locator('.mapping-concept-list').getByRole('button', { name });
  const more = page.locator('.mapping-concepts .mapping-show-more button:not(:has-text("fewer"))');
  while (!(await concept.count()) && (await more.count())) {
    await more.first().click();
  }
  await concept.click();
}
