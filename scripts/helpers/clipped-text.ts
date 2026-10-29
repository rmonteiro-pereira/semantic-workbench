// Checks that no button, label or chosen select value is cut, and that a panel has no sideways scroll.
import type { Page } from '@playwright/test';

const TEXT_CONTROLS = 'button, [role=button], [role=tab], [role=menuitem], label, select, summary';

/**
 * Lists the visible buttons, labels and selects inside `within` whose text is cut: wider than the
 * box that holds it, shown with an ellipsis by CSS, or a select whose chosen option does not fit
 * beside its arrow. A control that grows or wraps is fine; one that hides text is a problem.
 */
export async function clippedTextProblems(page: Page, within = 'body'): Promise<string[]> {
  return page.evaluate(
    ({ root, selector }) => {
      const scope = document.querySelector(root) ?? document.body;
      const problems = new Set<string>();
      const measure = document.createElement('canvas').getContext('2d')!;
      const describe = (element: Element) => `<${element.tagName.toLowerCase()}> "${(element.textContent ?? '').trim().slice(0, 40)}"`;
      for (const element of scope.querySelectorAll<HTMLElement>(selector)) {
        const box = element.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;
        const style = getComputedStyle(element);
        if (element instanceof HTMLSelectElement) {
          measure.font = style.font;
          const chosen = element.selectedOptions[0]?.textContent ?? '';
          const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
          const arrowRoom = 20;
          if (measure.measureText(chosen).width + padding + arrowRoom > element.clientWidth + 1) {
            problems.add(`${describe(element)} select cuts its chosen value "${chosen}"`);
          }
          continue;
        }
        if (element.scrollWidth > element.clientWidth + 1) problems.add(`${describe(element)} is wider than its box`);
        if (style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth) problems.add(`${describe(element)} ends in an ellipsis`);
      }
      return [...problems];
    },
    { root: within, selector: TEXT_CONTROLS },
  );
}

/**
 * Lists the elements inside `within`, the panel itself included, that scroll sideways or have
 * content wider than their box. Nothing in a panel should need a horizontal scrollbar.
 */
export async function sidewaysOverflowProblems(page: Page, within: string): Promise<string[]> {
  return page.evaluate(root => {
    const scope = document.querySelector(root);
    if (!scope) return [`${root} is not on the page`];
    const problems: string[] = [];
    for (const element of [scope, ...scope.querySelectorAll('*')]) {
      if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1) {
        problems.push(`<${element.tagName.toLowerCase()} class="${element.className}"> is ${element.scrollWidth}px of text in ${element.clientWidth}px`);
      }
    }
    return problems;
  }, within);
}

/** Lists the descendants of `within` that are scroll containers of their own, such as a nested list box. */
export async function nestedScrollBoxes(page: Page, within: string): Promise<string[]> {
  return page.evaluate(root => {
    const scope = document.querySelector(root);
    if (!scope) return [`${root} is not on the page`];
    const found: string[] = [];
    // Code and text fields scroll their own text; a list box or column inside the panel is the problem.
    for (const element of scope.querySelectorAll(':not(textarea, pre, code, input, select, .cm-editor, .cm-editor *)')) {
      const { overflowX, overflowY } = getComputedStyle(element);
      const scrolls = [overflowX, overflowY].some(value => value === 'auto' || value === 'scroll');
      if (scrolls) found.push(`<${element.tagName.toLowerCase()} class="${element.className}"> scrolls on its own`);
    }
    return found;
  }, within);
}

/**
 * Lists the descendants of `within` that hide part of their content at the bottom, such as a card
 * that is shorter than the text inside it. The panel's own scroll is not a descendant, so it is not listed.
 */
export async function verticallyCutBoxes(page: Page, within: string): Promise<string[]> {
  return page.evaluate(root => {
    const scope = document.querySelector(root);
    if (!scope) return [`${root} is not on the page`];
    const found: string[] = [];
    for (const element of scope.querySelectorAll('*')) {
      if (element.clientHeight === 0 || element.scrollHeight <= element.clientHeight + 1) continue;
      if (getComputedStyle(element).overflowY === 'visible') continue;
      found.push(`<${element.tagName.toLowerCase()} class="${element.className}"> hides ${element.scrollHeight - element.clientHeight}px of its content`);
    }
    return found;
  }, within);
}
