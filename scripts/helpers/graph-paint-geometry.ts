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

/**
 * Finds relationship paths that cross the interior of a card they do not connect. Only the layered
 * layout routes its paths around cards; the network layout draws direct curves between them.
 */
export async function graphEdgeClearanceProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.full-graph[data-layout="layered"]');
    if (!root) return [];
    const cards = [...root.querySelectorAll('.full-entity')].map(card => card.getBoundingClientRect());
    for (const path of root.querySelectorAll<SVGPathElement>('.react-flow__edge-path')) {
      const matrix = path.getScreenCTM();
      if (!matrix) continue;
      const length = path.getTotalLength();
      const pointAt = (distance: number) => {
        const point = path.getPointAtLength(distance);
        return new DOMPoint(point.x, point.y).matrixTransform(matrix);
      };
      const inside = (point: DOMPoint, card: DOMRect, margin: number) => point.x > card.left + margin && point.x < card.right - margin && point.y > card.top + margin && point.y < card.bottom - margin;
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
    const cards = [...root.querySelectorAll('.full-entity')].map(card => card.getBoundingClientRect());
    const problems: string[] = [];
    for (const heading of root.querySelectorAll('.full-area-title')) {
      const title = heading.getBoundingClientRect();
      const overlaps = cards.some(card => Math.min(title.right, card.right) - Math.max(title.left, card.left) > 1 && Math.min(title.bottom, card.bottom) - Math.max(title.top, card.top) > 1);
      if (overlaps) problems.push(`area heading "${heading.textContent}" overlaps a card`);
    }
    return problems;
  });
}

async function graphPaint(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('.full-graph');
    if (!root || root.querySelector('.full-entity.focused')) return [];
    const background = getComputedStyle(document.documentElement).getPropertyValue('--color-surface-page').trim();
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

// Idle lines are faint context that the person's focus and selection make strong, so they only
// have to stay visible; a 277-relationship model drawn at full strength is unreadable.
const MIN_IDLE_EDGE_CONTRAST = 1.15;

/** Checks the composited contrast of unselected graph edges against the canvas. */
export async function graphEdgeContrastProblems(page: Page): Promise<string[]> {
  const problems = new Set<string>();
  for (const edge of await graphPaint(page)) {
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
    if (contrastRatio(painted, background) < MIN_IDLE_EDGE_CONTRAST) {
      problems.add('unselected graph edges are invisible against the canvas');
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

/** Measures relationship labels after canvas and local label transforms. */
export async function graphRelationshipLabelProblems(page: Page): Promise<string[]> {
  const geometry = await page.evaluate(() => {
    const root = document.querySelector('.neighborhood-graph');
    if (!root) return [];
    const pane = root.querySelector('.react-flow')!.getBoundingClientRect();
    const viewport = root.querySelector('.react-flow__viewport')!;
    const zoom = new DOMMatrix(getComputedStyle(viewport).transform).a;
    const cards = [...root.querySelectorAll('.neighborhood-node .node')].map(card => card.getBoundingClientRect());
    const labels: DOMRect[] = [];
    const problems: string[] = [];
    const overlaps = (first: DOMRect, second: DOMRect) =>
      Math.min(first.right, second.right) - Math.max(first.left, second.left) > 1 && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 1;
    for (const text of root.querySelectorAll<HTMLElement>('.relationship-label')) {
      const bounds = text.getBoundingClientRect();
      if (!overlaps(bounds, pane)) continue;
      const style = getComputedStyle(text);
      const localScale = new DOMMatrix(style.transform).a;
      const pixels = Number.parseFloat(style.fontSize) * zoom * localScale;
      if (pixels < 12) problems.push(`relationship label is ${pixels.toFixed(1)} screen pixels`);
      const painted = bounds;
      if (bounds.left < pane.left || bounds.right > pane.right || bounds.top < pane.top || bounds.bottom > pane.bottom) {
        problems.push('a relationship label is clipped at the canvas boundary');
      }
      if (cards.some(card => overlaps(painted, card))) {
        problems.push('a relationship label overlaps a neighborhood card');
      }
      if (labels.some(label => overlaps(painted, label))) {
        problems.push('two neighborhood relationship labels overlap');
      }
      labels.push(painted);
    }
    return problems;
  });
  return [...geometry, ...(await graphRelationshipLeaderProblems(page))];
}

/** Checks relationship text against its opaque label background. */
export async function graphRelationshipContrastProblems(page: Page): Promise<string[]> {
  const paints = await page.locator('.neighborhood-graph .relationship-label').evaluateAll(labels =>
    labels.map(label => ({
      foreground: getComputedStyle(label).color,
      background: getComputedStyle(label).backgroundColor,
    })),
  );
  for (const paint of paints) {
    const foreground = parseColor(paint.foreground);
    const background = parseColor(paint.background);
    if (!foreground || !background || background.alpha !== 1 || contrastRatio(foreground, background) < 4.5) {
      return ['a neighborhood relationship label has less than 4.5:1 contrast'];
    }
  }
  return [];
}

async function graphRelationshipLeaderProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('.neighborhood-graph');
    if (!root) return [];
    const problems: string[] = [];
    for (const text of root.querySelectorAll<HTMLElement>('.relationship-label')) {
      const bounds = text.getBoundingClientRect();
      const edge = root.querySelector(`[data-id="${CSS.escape(text.dataset.edgeId!)}"]`);
      const path = edge?.querySelector<SVGPathElement>('.react-flow__edge-path');
      const leader = edge?.querySelector<SVGLineElement>('.relationship-label-leader');
      if (path) {
        const matrix = path.getScreenCTM()!;
        let distance = Infinity;
        for (let length = 0; length <= path.getTotalLength(); length += 4) {
          const point = path.getPointAtLength(length);
          const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
          distance = Math.min(distance, Math.hypot(screen.x - (bounds.left + bounds.right) / 2, screen.y - (bounds.top + bounds.bottom) / 2));
        }
        if (distance > 8 && !leader) problems.push('a displaced label has no route leader');
      }
      if (leader) {
        const paint = getComputedStyle(leader);
        const scale = Math.hypot(leader.getScreenCTM()!.a, leader.getScreenCTM()!.b);
        const width = Number.parseFloat(paint.strokeWidth) * (paint.vectorEffect === 'non-scaling-stroke' ? 1 : scale);
        if (width < 1.2) problems.push('a label leader is thinner than 1.2 screen pixels');
        if (paint.strokeDasharray !== 'none' && paint.strokeDasharray.split(/[ ,]+/).some(segment => Number.parseFloat(segment) * scale < 2)) {
          problems.push('a label leader has dashes smaller than two screen pixels');
        }
        const endpoint = new DOMPoint(leader.x2.baseVal.value, leader.y2.baseVal.value).matrixTransform(leader.getScreenCTM()!);
        if (endpoint.x < bounds.left || endpoint.x > bounds.right || endpoint.y < bounds.top || endpoint.y > bounds.bottom) {
          problems.push('a label leader does not reach its label');
        }
      }
      const layer = text.closest('.react-flow__edgelabel-renderer')!;
      const edges = root.querySelector('.react-flow__edges')!;
      if (Number(getComputedStyle(layer).zIndex) <= Number(getComputedStyle(edges).zIndex)) {
        problems.push('relationship paths can paint over the label layer');
      }
    }
    return problems;
  });
}
