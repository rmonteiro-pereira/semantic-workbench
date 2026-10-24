// Measures graph headings and painted edges, which ordinary text checks deliberately exclude.
import type { Page } from '@playwright/test';
import { contrastRatio, parseColor } from './color-literals';

/** Checks the phone controls against their trigger and their visible panel boundaries. */
export async function graphControlsProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const panel = document.querySelector('.compact-controls-panel');
    const trigger = document.querySelector('.compact-controls > button');
    if (!panel || !trigger) return [];
    const problems: string[] = [];
    const bounds = panel.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    if (Math.abs(bounds.top - anchor.bottom - 4) > 1) {
      problems.push('the graph controls panel is detached from its trigger');
    }
    if (panel.scrollWidth > panel.clientWidth + 1) {
      problems.push('the graph controls panel scrolls horizontally');
    }
    for (const button of panel.querySelectorAll('button')) {
      const control = button.getBoundingClientRect();
      if (control.left < bounds.left || control.right > bounds.right) {
        problems.push(`graph control "${button.textContent}" leaves its panel`);
      }
    }
    return problems;
  });
}

/** Finds relationship paths that cross the interior of a card they do not connect. */
export async function graphEdgeClearanceProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.full-graph');
    if (!root) return [];
    const cards = [...root.querySelectorAll('.full-entity')].map(card =>
      card.getBoundingClientRect(),
    );
    for (const path of root.querySelectorAll<SVGPathElement>('.react-flow__edge-path')) {
      const matrix = path.getScreenCTM();
      if (!matrix) continue;
      const length = path.getTotalLength();
      const pointAt = (distance: number) => {
        const point = path.getPointAtLength(distance);
        return new DOMPoint(point.x, point.y).matrixTransform(matrix);
      };
      const inside = (point: DOMPoint, card: DOMRect, margin: number) =>
        point.x > card.left + margin &&
        point.x < card.right - margin &&
        point.y > card.top + margin &&
        point.y < card.bottom - margin;
      const start = pointAt(0);
      const end = pointAt(length);
      const unrelated = cards.filter(card => !inside(start, card, -3) && !inside(end, card, -3));
      for (let distance = 0; distance < length; distance += 8) {
        const point = pointAt(distance);
        if (unrelated.some(card => inside(point, card, 2))) {
          return ['a model relationship crosses an unrelated entity card'];
        }
      }
    }
    return [];
  });
}

/** Finds area headings that run over an entity card in screen coordinates. */
export async function graphHeadingProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.full-graph');
    if (!root) return [];
    const cards = [...root.querySelectorAll('.full-entity')].map(card =>
      card.getBoundingClientRect(),
    );
    const problems: string[] = [];
    for (const heading of root.querySelectorAll('.full-area-title')) {
      const title = heading.getBoundingClientRect();
      const overlaps = cards.some(
        card =>
          Math.min(title.right, card.right) - Math.max(title.left, card.left) > 1 &&
          Math.min(title.bottom, card.bottom) - Math.max(title.top, card.top) > 1,
      );
      if (overlaps) problems.push(`area heading "${heading.textContent}" overlaps a card`);
    }
    return problems;
  });
}

async function graphPaint(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('.full-graph');
    if (!root || root.querySelector('.full-entity.focused')) return [];
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-surface-page')
      .trim();
    const viewport = root.querySelector('.react-flow__viewport');
    const scale = viewport ? new DOMMatrix(getComputedStyle(viewport).transform).a : 1;
    return [...root.querySelectorAll('.react-flow__edge-path')].map(edge => {
      const style = getComputedStyle(edge);
      const strokeScale = style.vectorEffect === 'non-scaling-stroke' ? 1 : scale;
      return {
        stroke: style.stroke,
        opacity: Number(style.strokeOpacity),
        width: Number.parseFloat(style.strokeWidth) * strokeScale,
        background,
      };
    });
  });
}

/** Checks the composited contrast of unselected graph edges against the canvas. */
export async function graphEdgeContrastProblems(page: Page): Promise<string[]> {
  const problems = new Set<string>();
  for (const edge of await graphPaint(page)) {
    if (edge.width < 1) problems.add('unselected graph edges are thinner than one screen pixel');
    const stroke = parseColor(edge.stroke);
    const background = parseColor(edge.background);
    if (!stroke || !background) {
      problems.add('the graph edge or canvas color cannot be measured');
      continue;
    }
    const opacity = edge.opacity * stroke.alpha;
    const painted = {
      red: stroke.red * opacity + background.red * (1 - opacity),
      green: stroke.green * opacity + background.green * (1 - opacity),
      blue: stroke.blue * opacity + background.blue * (1 - opacity),
      alpha: 1,
    };
    if (contrastRatio(painted, background) < 3) {
      problems.add('unselected graph edges have less than 3:1 contrast against the canvas');
    }
  }
  return [...problems];
}

/** Checks that compensated names remain inside their cards and vertical padding. */
export async function graphNameContainmentProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.full-graph');
    if (!root) return [];
    const viewport = root.querySelector('.react-flow__viewport');
    const scale = viewport ? new DOMMatrix(getComputedStyle(viewport).transform).a : 1;
    const problems: string[] = [];
    for (const card of root.querySelectorAll('.full-entity')) {
      const name = card.querySelector('strong');
      if (!name) continue;
      const text = name.getBoundingClientRect();
      if (card.classList.contains('collapsed') && name.scrollHeight > name.clientHeight + 1) {
        problems.push('a collapsed area entity count is vertically clipped');
      }
      const bounds = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      const top = bounds.top + Number.parseFloat(style.paddingTop) * scale;
      const bottom = bounds.bottom - Number.parseFloat(style.paddingBottom) * scale;
      if (text.top < top - 0.5 || text.bottom > bottom + 0.5) {
        problems.push(`name "${name.textContent}" leaves its card's vertical padding`);
      }
    }
    return problems;
  });
}
