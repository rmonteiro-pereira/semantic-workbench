// Measures the whole-model graph and the neighborhood graph in screen coordinates: names that
// read, detail lines only where they read, cards that do not overlap, a toolbar that fits, and a
// canvas that keeps most of a phone screen.
import type { Page } from '@playwright/test';

/** The smallest on-screen size of an entity name, and of a detail line where one is shown. */
export const MIN_NAME_PX = 11.5;
export const MIN_DETAIL_PX = 11;
/** The share of the window height the canvas keeps on a phone. */
export const MIN_PHONE_CANVAS_SHARE = 0.55;

type Which = 'model' | 'neighborhood';

/** Returns what is wrong with the graph now on screen; an empty list means it is clean. */
export async function graphCanvasProblems(page: Page, which: Which): Promise<string[]> {
  return page.evaluate(
    ({ which, minName, minDetail, minShare }) => {
      const out: string[] = [];
      const root = document.querySelector(
        which === 'model' ? '.full-graph' : '.neighborhood-graph',
      );
      const flow = root?.querySelector('.react-flow');
      if (!root || !flow) return ['no graph on screen'];
      const pane = flow.getBoundingClientRect();
      const viewport = flow.querySelector('.react-flow__viewport');
      const scale = viewport ? new DOMMatrix(getComputedStyle(viewport).transform).a : 1;
      const onScreen = (rect: DOMRect) =>
        rect.width > 0 &&
        rect.right > pane.left &&
        rect.left < pane.right &&
        rect.bottom > pane.top &&
        rect.top < pane.bottom;
      const cardSelector = which === 'model' ? '.full-entity' : '.neighborhood-node .node';
      const nameSelector = which === 'model' ? '.full-entity strong' : '.node strong';
      const sizeOnScreen = (element: Element) =>
        parseFloat(getComputedStyle(element).fontSize) * scale;
      for (const name of root.querySelectorAll(nameSelector)) {
        if (!onScreen(name.getBoundingClientRect())) continue;
        const px = sizeOnScreen(name);
        if (px < minName) out.push(`name "${name.textContent}" is ${px.toFixed(1)} px on screen`);
      }
      if (which === 'model') {
        const details = '.full-area-title small, .full-entity small, .full-entity .node-kpi-badge';
        for (const detail of root.querySelectorAll(details)) {
          if (!onScreen(detail.getBoundingClientRect())) continue;
          const pixels = sizeOnScreen(detail);
          if (pixels < 12) out.push(`model detail text is ${pixels.toFixed(1)} px on screen`);
        }
      }
      if (which === 'neighborhood') {
        for (const detail of root.querySelectorAll('.node small, .node > span')) {
          if (!onScreen(detail.getBoundingClientRect())) continue;
          const px = sizeOnScreen(detail);
          if (px < minDetail) out.push(`detail text is ${px.toFixed(1)} px on screen`);
        }
      }
      const cards = [...root.querySelectorAll(cardSelector)]
        .map(element => ({ element, rect: element.getBoundingClientRect() }))
        .filter(card => onScreen(card.rect));
      const overlap = (a: DOMRect, b: DOMRect) =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      cards.forEach((first, index) =>
        cards.slice(index + 1).forEach(second => {
          if (overlap(first.rect, second.rect)) out.push('two cards overlap');
        }),
      );
      const toolbar = root.querySelector('.full-graph-tools, .neighborhood-tools');
      if (toolbar && toolbar.scrollWidth > toolbar.clientWidth + 1)
        out.push('the toolbar is wider than its row');
      const phone = window.innerWidth <= 650;
      if (phone && pane.height < minShare * window.innerHeight)
        out.push(
          `the canvas is ${Math.round((100 * pane.height) / window.innerHeight)}% of the screen`,
        );
      return out;
    },
    { which, minName: MIN_NAME_PX, minDetail: MIN_DETAIL_PX, minShare: MIN_PHONE_CANVAS_SHARE },
  );
}
