// Measures the whole-model graph and the neighborhood graph in screen coordinates: names that
// are as large as their cards allow, detail lines that keep their size, cards that do not overlap,
// a toolbar that fits, and a canvas that keeps most of a phone screen.
import type { Page } from '@playwright/test';
import { LARGEST_ENTITY_NAME_PX } from '../../src/app/graph/overview-capacity';
import {
  graphRelationshipContrastProblems,
  graphRelationshipLabelProblems,
  graphHeadingProblems,
  graphEdgeContrastProblems,
  graphNameContainmentProblems,
  graphControlsProblems,
  graphEdgeClearanceProblems,
} from './graph-paint-geometry';

/** The smallest on-screen size of an entity name, and of a detail line where one is shown. */
export const MIN_NAME_PX = 12;
export const MIN_DETAIL_PX = 12;
/** A neighborhood card draws its name at this size whatever the zoom. */
const NEIGHBORHOOD_NAME_PX = 16;
/** The share of the window height the canvas keeps on a phone. */
export const MIN_PHONE_CANVAS_SHARE = 0.55;

type Which = 'model' | 'neighborhood';

/** Returns what is wrong with the graph now on screen; an empty list means it is clean. */
export async function graphCanvasProblems(page: Page, which: Which): Promise<string[]> {
  const problems = await page.evaluate(
    ({ which, minName, minDetail, minShare, largestModelNamePx, neighborhoodNamePx }) => {
      const out: string[] = [];
      const root = document.querySelector(which === 'model' ? '.full-graph' : '.neighborhood-graph');
      const flow = root?.querySelector('.react-flow');
      if (!root || !flow) return ['no graph on screen'];
      const pane = flow.getBoundingClientRect();
      const viewport = flow.querySelector('.react-flow__viewport');
      const scale = viewport ? new DOMMatrix(getComputedStyle(viewport).transform).a : 1;
      const onScreen = (rect: DOMRect) => rect.width > 0 && rect.right > pane.left && rect.left < pane.right && rect.bottom > pane.top && rect.top < pane.bottom;
      const cardSelector = which === 'model' ? '.full-entity' : '.neighborhood-node .node';
      const nameSelector = which === 'model' ? '.full-entity strong' : '.node strong';
      const sizeOnScreen = (element: Element) => parseFloat(getComputedStyle(element).fontSize) * scale;
      for (const name of root.querySelectorAll(nameSelector)) {
        if (!onScreen(name.getBoundingClientRect())) continue;
        const px = sizeOnScreen(name);
        // A graph that opens on every entity can be zoomed out past the point where a card could
        // hold a 12 px name. Its names must then be the largest the card holds, and a card
        // never shrinks its own name below that.
        const largestName = which === 'model' ? largestModelNamePx : neighborhoodNamePx;
        // A card also never draws a name larger than its whole name fits, so that no name is cut.
        const fittingName = parseFloat(getComputedStyle(name).getPropertyValue('--entity-name-cap')) || largestName;
        const largestCardName = Math.min(largestName, fittingName, Math.ceil(minName / scale));
        const minimum = Math.min(minName, largestCardName * scale);
        if (px < minimum - 0.01) {
          out.push(`name "${name.textContent}" is ${px.toFixed(1)} px on screen`);
        }
      }
      if (which === 'model') {
        const caption = root.querySelector('.full-graph-status');
        if (!caption?.textContent?.includes('Color = area · Line = relationship')) {
          out.push('the whole-model graph has no area and relationship legend');
        }
        const details = '.full-area-title small, .full-entity small, .full-entity .node-kpi-badge';
        for (const detail of root.querySelectorAll(details)) {
          if (!onScreen(detail.getBoundingClientRect())) continue;
          const pixels = sizeOnScreen(detail);
          if (pixels < 12) out.push(`model detail text is ${pixels.toFixed(1)} px on screen`);
        }
      }
      if (which === 'neighborhood') {
        for (const button of root.querySelectorAll('.node-actions button')) {
          const bounds = button.getBoundingClientRect();
          if (!onScreen(bounds)) continue;
          // Cards zoom with the canvas, so a control is measured at the card's own scale.
          if (bounds.width / scale < 23.5 || bounds.height / scale < 23.5) {
            out.push('a neighborhood card control is smaller than twenty-four pixels');
          }
          const icon = button.querySelector('svg')?.getBoundingClientRect();
          if (icon && (icon.width / scale < 11.5 || icon.height / scale < 11.5)) {
            out.push('a neighborhood card control icon is smaller than twelve pixels');
          }
        }
        for (const name of root.querySelectorAll<HTMLElement>('.node strong')) {
          const clipped = name.scrollWidth > name.clientWidth || name.scrollHeight > name.clientHeight;
          if (clipped && name.title !== name.textContent) {
            out.push('a truncated neighbor name has no full-name tooltip');
          }
        }
        for (const detail of root.querySelectorAll('.node small, .node > span')) {
          if (!onScreen(detail.getBoundingClientRect())) continue;
          // Cards always keep their detail lines, so they are measured at the card's own scale.
          const px = parseFloat(getComputedStyle(detail).fontSize);
          if (px < minDetail) out.push(`detail text is ${px.toFixed(1)} px`);
        }
      }
      const cards = [...root.querySelectorAll(cardSelector)].map(element => ({ element, rect: element.getBoundingClientRect() })).filter(card => onScreen(card.rect));
      const overlap = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const frames = [...root.querySelectorAll('.react-flow__node-businessArea')].map(frame => frame.getBoundingClientRect());
      frames.forEach((first, index) => {
        if (frames.slice(index + 1).some(second => overlap(first, second))) {
          out.push('two business-area frames overlap');
        }
      });
      cards.forEach((first, index) =>
        cards.slice(index + 1).forEach(second => {
          if (overlap(first.rect, second.rect)) out.push('two cards overlap');
          if (which === 'neighborhood') {
            const horizontal = Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left);
            const gap = Math.max(first.rect.top - second.rect.bottom, second.rect.top - first.rect.bottom);
            if (horizontal > 1 && gap >= -1 && gap < 8 * scale) {
              out.push('neighbor cards have less than eight canvas pixels between them');
            }
          }
        }),
      );
      const toolbar = root.querySelector('.full-graph-tools, .neighborhood-tools');
      if (toolbar && toolbar.scrollWidth > toolbar.clientWidth + 1) out.push('the toolbar is wider than its row');
      const phone = window.innerWidth <= 650;
      if (phone && pane.height < minShare * window.innerHeight) out.push(`the canvas is ${Math.round((100 * pane.height) / window.innerHeight)}% of the screen`);
      return out;
    },
    {
      which,
      minName: MIN_NAME_PX,
      minDetail: MIN_DETAIL_PX,
      minShare: MIN_PHONE_CANVAS_SHARE,
      largestModelNamePx: LARGEST_ENTITY_NAME_PX,
      neighborhoodNamePx: NEIGHBORHOOD_NAME_PX,
    },
  );
  problems.push(...(await graphControlsProblems(page)));
  if (which === 'neighborhood') {
    problems.push(...(await graphRelationshipLabelProblems(page)), ...(await graphRelationshipContrastProblems(page)));
  }
  if (which === 'model') {
    problems.push(...(await graphHeadingProblems(page)), ...(await graphEdgeContrastProblems(page)), ...(await graphNameContainmentProblems(page)), ...(await graphEdgeClearanceProblems(page)));
  }
  return problems;
}
