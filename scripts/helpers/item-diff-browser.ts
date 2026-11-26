import { expect, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { hideGraphControls, revealGraphControls, expectShown, setShown, viewOptions } from './graph-options';

/** Shows a model tab using its ordinary workspace controls. */
export function itemDiffTab(page: Page, name: string) {
  return page.locator('.tabs').getByRole('button', { name, exact: true }).click();
}

const OVERLAY = 'Unpublished work';

/** Switches the Unpublished work overlay on or off from the graph toolbar's Show menu. */
export function setItemDiffOverlay(page: Page, on: boolean) {
  return viewOptions(page, options => setShown(options, OVERLAY, on));
}

/** Checks whether the Unpublished work overlay is on, as the Show menu reports it. */
export function expectItemDiffOverlay(page: Page, on: boolean) {
  return viewOptions(page, options => expectShown(options, OVERLAY, on));
}

/** Normalizes the rendered contents measured by the recorded base, excluding the new controls. */
export async function itemDiffStructure(locator: Locator) {
  return locator.evaluate(element => {
    function visit(node: Element): unknown {
      const attributes = [...node.attributes]
        .filter(attribute => ['class', 'role', 'aria-label', 'type'].includes(attribute.name))
        .map(attribute => [
          attribute.name,
          attribute.value
            .replace(/\b(selected|selectable|draggable|dragging|measured)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim(),
        ]);
      const text = [...node.childNodes]
        .filter(child => child.nodeType === Node.TEXT_NODE)
        .map(child => child.textContent?.trim())
        .filter(Boolean);
      const children = [...node.children].filter(child => !child.matches('.item-overlay-control,.item-branch-control'));
      return { tag: node.tagName.toLowerCase(), attributes, text, children: children.map(visit) };
    }
    return visit(element);
  });
}

/** Records the expanded toolbar independently of the graph's folded first view. */
export async function itemDiffToolbarSignature(page: Page, selector: string) {
  await revealGraphControls(page);
  const structure = await itemDiffStructure(page.locator(selector));
  await hideGraphControls(page);
  return createHash('sha256').update(JSON.stringify(structure)).digest('hex');
}

/** Reads unscaled card dimensions and first-view layout positions from the rendered graph. */
export async function itemDiffCardGeometry(page: Page) {
  return page.locator('.full-graph .react-flow__node-entity').evaluateAll(nodes =>
    nodes
      .map(node => {
        const element = node as HTMLElement;
        return [element.querySelector('.full-entity')?.getAttribute('data-address'), element.style.width, element.style.height, element.style.transform];
      })
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  );
}

/** Checks that marks have text, an outline and enough room for their rendered text. */
export async function checkItemMarks(page: Page) {
  const marks = page.locator('.full-graph .item-change-mark');
  await expect(marks).toHaveCount(3);
  for (const state of ['added', 'removed', 'changed']) {
    await expect(marks.filter({ hasText: 'Not published: ' + state })).toBeVisible();
  }
  const problems = await marks.evaluateAll(nodes =>
    nodes.flatMap(node => {
      const computed = getComputedStyle(node);
      const parent = getComputedStyle(node.parentElement!);
      const label = node.textContent;
      const overflows = node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1;
      if (computed.borderTopStyle !== 'dashed' || parent.outlineStyle !== 'dashed' || overflows) {
        return [{ label, border: computed.borderTopStyle, outline: parent.outlineStyle, overflows }];
      }
      const mark = node.getBoundingClientRect();
      const title = node.parentElement?.querySelector('strong')?.getBoundingClientRect();
      return title && title.bottom > mark.top + 1 && title.right > mark.left && mark.right > title.left ? [{ label, overlapsTitle: true }] : [];
    }),
  );
  expect(problems).toEqual([]);
}
