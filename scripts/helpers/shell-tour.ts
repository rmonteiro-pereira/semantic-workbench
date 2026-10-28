// The shell screens of the responsive suite: the header, the tab strip, the sidebar tree, the
// source editor's findings and the content width on wide windows.
import { expect, type Page } from '@playwright/test';
import { fileTab, openFile, showSidebar, type Screen } from './screen-tour';

/** Lists the screens whose shell parts the suite measures at every window size. */
export function shellScreens(ontology: string, contract: string): Screen[] {
  return [
    { name: 'shell-source', show: fileTab(ontology, 'Source') },
    { name: 'shell-metrics', show: fileTab(ontology, 'Metrics') },
    { name: 'shell-mappings', show: fileTab(ontology, 'Mappings') },
    { name: 'shell-catalog', show: fileTab(ontology, 'Catalog') },
    { name: 'shell-contract', show: fileTab(contract, 'Contract') },
    { name: 'shell-sidebar', show: showSidebar },
  ];
}

/** Everything that makes a header at this width hard to use: a missing tooltip or cut text. */
export async function headerTitleProblems(page: Page, width: number): Promise<string[]> {
  return page.evaluate(viewport => {
    const found: string[] = [];
    const title = document.querySelector<HTMLElement>('.workspace-title h1');
    if (!title?.getAttribute('title')) found.push('the file title has no tooltip');
    // The phone header cuts a long title with an ellipsis and keeps the full text in the tooltip.
    const cutByEllipsis = !!title && getComputedStyle(title).textOverflow === 'ellipsis';
    if (
      title &&
      !cutByEllipsis &&
      (title.scrollWidth > title.clientWidth + 1 || title.scrollHeight > title.clientHeight + 1)
    ) {
      found.push('the file title is clipped');
    }
    for (const button of document.querySelectorAll<HTMLElement>('.header-actions button')) {
      const drawn = button.querySelector('.action-label');
      const hidden = !drawn || getComputedStyle(drawn).position === 'absolute';
      const hasTooltip = !!button.getAttribute('title');
      if (hidden && !hasTooltip) found.push(`an icon-only header button has no tooltip`);
    }
    const pill = document.querySelector<HTMLElement>('.save-state-text');
    // The phone header draws only a dot, so there is no pill text to shorten.
    if (pill && !pill.closest('.save-dot')) {
      const short = getComputedStyle(pill, '::after').content;
      const drawsShort = short !== 'none' && short !== 'normal';
      if (viewport < 1500 && !drawsShort) found.push('the save state is not shortened');
      if (viewport >= 1500 && drawsShort)
        found.push('the save state is shortened on a wide window');
    }
    return found;
  }, width);
}

/** Checks that the open file is inside the visible part of the sidebar tree. */
export async function sidebarTreeProblems(page: Page, file: string): Promise<string[]> {
  await openFile(page, file);
  await showSidebar(page);
  return page.evaluate(() => {
    const found: string[] = [];
    const scroller = document.querySelector<HTMLElement>('.workspace-sidebar .documents');
    const row = document.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"]');
    if (!scroller || !row) return ['the tree or the open file is missing'];
    const treeStyle = getComputedStyle(scroller);
    if (treeStyle.backgroundImage !== 'none') {
      found.push('the tree still fades');
    }
    const frame = scroller.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    if (box.top < frame.top - 1 || box.bottom > frame.bottom + 1) {
      const where = `${box.top}-${box.bottom} in ${frame.top}-${frame.bottom}`;
      found.push(`the open file is outside the visible part of the tree (${where})`);
    }
    return found;
  });
}

/** At 1920 px and wider, text pages share one width and are centred in the canvas. */
export async function contentWidthProblems(page: Page, width: number): Promise<string[]> {
  if (width < 1920) return [];
  return page.evaluate(() => {
    const found: string[] = [];
    const limit = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--content-max-width'),
    );
    const textPage = document.querySelector<HTMLElement>(
      '.odcs-page, .mapping-explorer, .catalog, .metrics-view .metrics-list',
    );
    if (!textPage) return found;
    const box = textPage.getBoundingClientRect();
    const canvas = textPage.parentElement!.getBoundingClientRect();
    if (box.width > limit + 1) found.push(`the page is ${box.width}px wide, over ${limit}px`);
    const left = box.left - canvas.left;
    const right = canvas.right - box.right;
    if (Math.abs(left - right) > 40) found.push(`the page is not centred (${left} and ${right})`);
    return found;
  });
}

/** Keyboard navigation reveals complete tab labels even when their neighbors begin clipped. */
export async function expectKeyboardTabReveal(page: Page): Promise<void> {
  const strip = page.locator('.tabs').first();
  if (!(await strip.isVisible())) return;
  if (await strip.evaluate(element => !!element.closest('[inert]'))) return;
  const candidate = await strip.evaluate(element => {
    const frame = element.getBoundingClientRect();
    return [...element.querySelectorAll('button')].findIndex(
      button => button.getBoundingClientRect().right > frame.right + 1,
    );
  });
  if (candidate < 1) return;
  const buttons = strip.locator(':scope > button');
  const previous = buttons.nth(candidate - 1);
  await previous.focus();
  await expect(previous).toBeFocused();
  await page.keyboard.press('Tab');
  const focused = buttons.nth(candidate);
  await expect(focused).toBeFocused();
  await expect(focused).toHaveCSS('opacity', '1');
  await expect(focused).toHaveCSS('clip-path', 'none');
  const inside = await focused.evaluate(button => {
    const frame = button.parentElement!.getBoundingClientRect();
    const bounds = button.getBoundingClientRect();
    return bounds.left >= frame.left - 1 && bounds.right <= frame.right + 1;
  });
  expect(inside, 'keyboard focus reveals the whole neighboring tab').toBe(true);
  const selected = strip.locator('.selected');
  await selected.focus();
  await expect(selected).toHaveCSS('opacity', '1');
  await expect(selected).toHaveCSS('clip-path', 'none');
}
