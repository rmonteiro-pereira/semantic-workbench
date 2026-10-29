// Layout promises of the overview, catalog, mappings and Source control pages, measured in the
// browser for the responsive suite.
import type { Page } from '@playwright/test';

/** Says what a page must hold beyond readable text: equal card rows, a heading, a scroll cue. */
export async function pageLayoutProblems(page: Page, screenName: string) {
  return page.evaluate(name => {
    const problems: string[] = [];
    // Cards pack into columns, so a card may be as short as its content; what must hold is that the
    // space between a card and the one below it is never larger than the gap between columns.
    const masonryGapProblems = () => {
      const grid = document.querySelector('.area-grid');
      if (!grid) return [];
      const columnGap = Number.parseFloat(getComputedStyle(grid).columnGap) || 0;
      const cards = [...grid.children].map(card => card.getBoundingClientRect());
      const found: string[] = [];
      for (const card of cards) {
        const below = cards.filter(other => Math.abs(other.left - card.left) < 2 && other.top > card.top + 1);
        const next = below.sort((first, second) => first.top - second.top)[0];
        if (next && next.top - card.bottom > columnGap + 1) found.push('a card leaves a gap below it larger than the column gap');
      }
      for (const card of grid.children) {
        const buttons = card.querySelectorAll('.area-entities button, .area-show-all');
        const footer = card.querySelector('footer');
        if (!buttons.length || !footer) continue;
        const roomBelowEntities = footer.getBoundingClientRect().top - buttons[buttons.length - 1].getBoundingClientRect().bottom;
        if (roomBelowEntities > 24) found.push('a card has empty room between its entities and its footer');
      }
      return found;
    };
    const rows = (selector: string) => {
      const boxes = [...document.querySelectorAll(selector)].map(el => el.getBoundingClientRect());
      return boxes.filter(box => box.width > 0 && Math.abs(box.top - boxes[0].top) < 2);
    };
    if (name === 'ontology-overview') {
      for (const count of document.querySelectorAll('.area-count')) {
        if (!count.textContent?.includes('entities')) problems.push('an area count has no unit');
      }
      if (!document.querySelector('.overview-top p')?.textContent?.includes('declared relationships')) {
        problems.push('the overview does not explain entity counts');
      }
      problems.push(...masonryGapProblems());
    }
    if (name === 'ontology-catalog') {
      const titles = rows('.catalog-card strong');
      if (titles.some(box => Math.abs(box.top - titles[0].top) > 1)) {
        problems.push('card titles of one row are not on one line');
      }
    }
    if (name === 'ontology-mappings') {
      // A project without a mapping document shows one empty state for the whole tab instead.
      const detail = document.querySelector('.mapping-detail');
      const projectEmpty = document.querySelector('.mapping-explorer > .empty-state');
      if (!detail?.querySelector('.mapping-binding, .empty-state') && !projectEmpty) {
        problems.push('the detail shows neither a binding nor an empty state');
      }
      const chain = rows('.mapping-layer-chain > span');
      if (chain.some(box => Math.abs(box.height - chain[0].height) > 1)) {
        problems.push('the layer summary items differ in height');
      }
      const list = document.querySelector('.mapping-concept-list');
      if (list) {
        const style = getComputedStyle(list);
        // The list scrolls by itself inside the tab, so it must stay within one screen and must
        // not fade its last cards out with a mask.
        if (style.maskImage !== 'none') {
          problems.push('the concept list fades its cards with a mask');
        }
        if (list.getBoundingClientRect().height > window.innerHeight) {
          problems.push('the concept list grows past one screen instead of scrolling');
        }
        const empty = document.querySelector('.mapping-detail .empty-state');
        const buttons = list.querySelectorAll('button');
        const search = document.querySelector<HTMLInputElement>('[aria-label="Find concept"]');
        if (empty && !search?.value && buttons.length > 1) {
          problems.push('an unbound mapping repeats a card for every unmapped concept');
        }
      }
    }
    if (['source-editor', 'ontology-source'].includes(name) && innerWidth <= 480) {
      const cursor = document.querySelector('.code-editor-position');
      if (cursor && getComputedStyle(cursor).display !== 'none') {
        problems.push('the optional cursor readout crowds phone editor navigation');
      }
    }
    if (name === 'source-control') {
      const sourceControl = document.querySelector('.scm');
      const header = document.querySelector('.workspace-header');
      if (sourceControl && header && sourceControl.getBoundingClientRect().top - header.getBoundingClientRect().bottom < 10) {
        problems.push('Source control has no gap below the header');
      }
      const counts = document.querySelector('.scm-sync');
      // A branch that was never pushed shows "Not published" in place of the counts.
      const labelled = /to push.*to pull|^\s*Not published\s*$/s;
      if (counts && !labelled.test(counts.textContent ?? '')) {
        problems.push('the source-control counts have no visible labels');
      }
      const title = document.querySelector('.scm-title');
      if (!title) problems.push('the Source control page has no heading');
      const select = document.querySelector('.scm-head > select');
      if (select && getComputedStyle(select).borderTopWidth === '0px') {
        problems.push('the project select has no border of its own');
      }
    }
    return problems.map(problem => `${name}: ${problem}`);
  }, screenName);
}
