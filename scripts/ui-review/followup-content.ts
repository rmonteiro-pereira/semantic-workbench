// Defines mapping disclosures, refused form values, hover, focus, and status captures. Imported by followup-local.
import { expect, type Page } from '@playwright/test';
import { fileTab, showScreen, showSidebar } from '../helpers/screen-tour';
import { editScreens } from '../helpers/edit-tour';
import { focusedElement, focusByTab, type State, type View } from './followup-capture';

async function selectedMapping(page: Page) {
  await fileTab('commerce.mapped-ontology.yaml', 'Mappings')(page);
  await page.locator('.mapping-concept-list button small').first().waitFor();
  const buttons = page.locator('.mapping-concept-list button');
  const index = await buttons.evaluateAll(elements => elements.findIndex(element => /^[1-9]\d* bindings?$/.test(element.querySelector('small')?.textContent ?? '')));
  if (index < 0) throw new Error('Mapped-commerce contains no displayed concept with bindings');
  await buttons.nth(index).click();
  await page.locator('.mapping-binding').first().waitFor();
}

/** Lists mapping states with one disclosure independently selected. */
export function mappingStates(): State[] {
  return ['concept-with-bindings', 'resolved-bindings-open', 'ai-context-open'].map(state => ({
    screen: 'mapped-commerce-mappings',
    state,
    full: true,
    action: async page => {
      await selectedMapping(page);
      const resolved = page.locator('details.mapping-bindings');
      if (state === 'ai-context-open') {
        if ((await resolved.getAttribute('open')) !== null) await resolved.locator(':scope > summary').click();
        await page.getByText('AI context · the metadata an agent receives', { exact: true }).click();
        await page
          .locator('.mapping-detail details')
          .filter({ has: page.getByText('AI context · the metadata an agent receives', { exact: true }) })
          .locator('pre')
          .waitFor();
      } else if ((await resolved.getAttribute('open')) === null) {
        await resolved.locator(':scope > summary').click();
      }
    },
    check: async page => {
      const selected = page.locator('.mapping-concept-list button[aria-pressed="true"]');
      await expect(selected).not.toHaveText('All concepts');
      const ai = page
        .locator('details')
        .filter({ has: page.locator('summary').filter({ hasText: /^AI context/ }) })
        .last();
      const aiOpen = (await ai.getAttribute('open')) !== null;
      expect(aiOpen).toBe(state === 'ai-context-open');
      const bindings = await page.locator('.mapping-binding').count();
      expect(bindings).toBeGreaterThan(0);
      return { selected: await selected.innerText(), bindings, ai_open: aiOpen, resolved_open: (await page.locator('.mapping-bindings').getAttribute('open')) !== null };
    },
  }));
}

/** Lists duplicate-name form submissions using the real validation surface. */
export function formStates(): State[] {
  const inventory = editScreens({ ontology: 'commerce-business.ossie.yaml', metricsModel: 'mall.semantic.yaml', mappedFile: 'commerce.mapped-ontology.yaml' });
  return ['add-concept', 'item-editor'].map(screen => ({
    screen,
    state: 'duplicate-name-refusal',
    action: async (page, record) => {
      await showScreen(
        page,
        inventory.find(item => item.name === screen)!,
      );
      const dialog = page.locator('dialog[open]').last();
      const name = dialog.getByLabel(/^Name\b/);
      await name.fill('Order');
      const type = dialog.getByLabel(/^Type\b/);
      if (await type.count()) await type.selectOption('EntityType');
      await page.waitForTimeout(900);
      const primary = dialog.locator('button.primary');
      const enabled = await primary.isEnabled();
      record('before-primary', { enabled, errors: await dialog.locator('.error,.item-note,[role=alert]').allTextContents() });
      try {
        await primary.click({ timeout: 1200 });
      } catch (error) {
        record('primary-click-refused', String(error));
      }
      await page.waitForTimeout(700);
    },
    check: async page => {
      const dialog = page.locator('dialog[open]').last();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel(/^Name\b/)).toHaveValue('Order');
      const errors = await dialog.locator('.error,.item-note,[role=alert]').allTextContents();
      const disabled = await dialog.locator('button.primary').isDisabled();
      expect(errors.length > 0 || disabled).toBe(true);
      return { refused_value: 'Order', errors, primary_disabled: disabled, field_error: await dialog.locator('input[aria-invalid=true]').count() };
    },
  }));
}

/** Lists pointer and actual Tab focus states at desktop widths. */
export function interactionStates(view: View): State[] {
  if (view.width !== 1440) return [];
  const states: State[] = [];
  for (const target of ['catalog-card', 'primary-button', 'sidebar-file']) {
    states.push({
      screen: 'interaction',
      state: 'hover-' + target,
      action: async page => {
        await fileTab('commerce-business.ossie.yaml', 'Catalog')(page);
        let locator = page.locator('.catalog-card').first();
        if (target === 'primary-button') locator = page.getByRole('button', { name: 'Add project', exact: true });
        if (target === 'sidebar-file') {
          await showSidebar(page);
          locator = page.locator('.workspace-sidebar button.document').first();
        }
        await locator.hover();
      },
      check: async page => {
        const selector = { 'catalog-card': '.catalog-card:hover', 'primary-button': 'button.add-project:hover', 'sidebar-file': 'button.document:hover' }[target]!;
        await expect(page.locator(selector).first()).toBeVisible();
        return { hovered: selector, text: (await page.locator(selector).first().innerText()).slice(0, 150) };
      },
    });
  }
  for (const target of ['catalog-card', 'text-input', 'native-select', 'checkbox']) {
    const selector = { 'catalog-card': '.catalog-card > button:first-child', 'text-input': 'input[placeholder="Find an entity…"]', 'native-select': 'select', checkbox: 'input[type=checkbox]' }[
      target
    ]!;
    states.push({
      screen: 'interaction',
      state: 'focus-' + target,
      action: async page => {
        await fileTab(
          target === 'native-select' || target === 'checkbox' ? 'mall.semantic.yaml' : 'commerce-business.ossie.yaml',
          target === 'native-select' || target === 'checkbox' ? 'Metrics' : 'Catalog',
        )(page);
        await focusByTab(page, selector);
      },
      check: page => focusedElement(page, selector),
    });
  }
  return states;
}

/** Lists fresh-file count captures and one navigation-order comparison. */
export function statusStates(): State[] {
  return ['mall.semantic.yaml', 'ubl.ontology.yaml', 'mall.ontology.yaml', 'mall.semantic.yaml-after-ubl'].map(file => ({
    screen: 'status-bar',
    state: file.replaceAll('.', '-'),
    action: async (page, record) => {
      if (file.endsWith('-after-ubl')) {
        await fileTab('ubl.ontology.yaml', 'Overview')(page);
        record(
          'ubl-before',
          await page
            .locator('footer')
            .filter({ hasText: /entities.*relationships/ })
            .first()
            .innerText(),
        );
      }
      await fileTab(file.replace('-after-ubl', ''), 'Overview')(page);
    },
    check: async page => {
      const text = await page
        .locator('footer')
        .filter({ hasText: /entities.*relationships/ })
        .first()
        .innerText();
      const counts = text.match(/[\d,]+ entities? · [\d,]+ relationships?/);
      expect(counts).not.toBeNull();
      return { counts: counts![0], status_text: text };
    },
  }));
}
