// Ways into the definition details that several feature captures share.
import type { Page } from '@playwright/test';
import { fileTab, openProjectFileTab } from '../../helpers/screen-tour';

/** Opens a concept's details from the Catalog of a file in the selected project. */
export async function openConcept(page: Page, file: string, name: string) {
  await fileTab(file, 'Catalog')(page);
  await page
    .locator('.catalog-card')
    .filter({ has: page.locator(`strong[title="${name}"]`) })
    .getByRole('button', { name: /View details/ })
    .click();
  await page.locator('aside[aria-label="Definition details"]').waitFor();
}

/** Opens the details of the first card that mentions the text, in a file of another project. */
export async function openProjectConcept(page: Page, project: string, file: string, text: string) {
  await openProjectFileTab(page, project, file, 'Catalog');
  await page
    .locator('.catalog-card', { hasText: text })
    .first()
    .getByRole('button', { name: /View details/ })
    .click();
}
