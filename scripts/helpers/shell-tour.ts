// The shell screens of the responsive suite: the header, the tab strip, the sidebar tree, the
// source editor's findings and the content width on wide windows.
import type { Page } from '@playwright/test';
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
    if (
      title &&
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
    if (pill) {
      const short = getComputedStyle(pill, '::after').content;
      const drawsShort = short !== 'none' && short !== 'normal';
      if (viewport < 1500 && !drawsShort) found.push('the save state is not shortened');
      if (viewport >= 1500 && drawsShort)
        found.push('the save state is shortened on a wide window');
    }
    return found;
  }, width);
}

/**
 * Checks the tab strip: while it scrolls, a cue sits beside each edge that has more tabs, the
 * cues never cover a tab, and the active tab is fully inside the strip.
 */
export async function tabStripProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const strip of document.querySelectorAll<HTMLElement>('.tabs, .odcs-tabs')) {
      const box = strip.getBoundingClientRect();
      const scrolls = strip.scrollWidth > strip.clientWidth + 1;
      const more = (side: 'start' | 'end') => {
        const remaining = strip.scrollWidth - strip.clientWidth - strip.scrollLeft;
        return side === 'start' ? strip.scrollLeft > 1 : remaining > 1;
      };
      for (const side of ['start', 'end'] as const) {
        const sibling = side === 'start' ? strip.previousElementSibling : strip.nextElementSibling;
        const cue = sibling instanceof HTMLElement ? sibling : null;
        const shown = !!cue && !cue.hidden;
        if (shown !== (scrolls && more(side)))
          found.push(`the ${side} cue disagrees with the strip`);
        if (!cue || !shown) continue;
        const cueBox = cue.getBoundingClientRect();
        const overlaps = cueBox.right > box.left + 1 && cueBox.left < box.right - 1;
        if (overlaps) found.push(`the ${side} cue covers the tab strip`);
      }
      const selected = strip.querySelector<HTMLElement>('.selected');
      if (selected && scrolls) {
        const tab = selected.getBoundingClientRect();
        if (tab.left < box.left - 1 || tab.right > box.right + 1) {
          found.push('the active tab is cut by the strip');
        }
      }
    }
    return found;
  });
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
