// Measures neighborhood cards and how edges meet them, in browser screen coordinates.
import type { Page } from '@playwright/test';
import { cutTextProblems } from './clipped-text';

const CARD_TEXT = '.neighborhood-canvas .node > small, .neighborhood-canvas .node > strong, .neighborhood-canvas .node > span';

/** Returns overlapping cards, text cut off or ending in an ellipsis, and edges drawn across a card body. */
export async function neighborhoodCardProblems(page: Page) {
  const geometryProblems = await page.evaluate(() => {
    type Card = { id: string; rect: DOMRect; element: HTMLElement };
    const cards: Card[] = [...document.querySelectorAll<HTMLElement>('.neighborhood-canvas .react-flow__node')].map(element => ({
      id: element.getAttribute('data-id') ?? '',
      rect: element.getBoundingClientRect(),
      element,
    }));
    const overlapping = () => {
      const found: string[] = [];
      for (let first = 0; first < cards.length; first++) {
        for (let second = first + 1; second < cards.length; second++) {
          const firstRect = cards[first].rect;
          const secondRect = cards[second].rect;
          const overlap = firstRect.left < secondRect.right - 1 && secondRect.left < firstRect.right - 1 && firstRect.top < secondRect.bottom - 1 && secondRect.top < firstRect.bottom - 1;
          if (overlap) found.push(`cards ${cards[first].id} and ${cards[second].id} overlap`);
        }
      }
      return found;
    };
    const unfinishedText = () => {
      const found: string[] = [];
      for (const { id, element } of cards) {
        for (const text of element.querySelectorAll<HTMLElement>('.node > small, .node > strong, .node > span')) {
          if ((text.textContent ?? '').endsWith('…')) found.push(`card ${id} text "${text.textContent}" ends in an ellipsis`);
        }
        const body = element.querySelector<HTMLElement>('.node');
        if (body && body.scrollHeight > body.clientHeight + 1) found.push(`card ${id} content overflows its card`);
      }
      return found;
    };
    // A rounded corner keeps only its end point; its control point is skipped.
    const edgePoints = (path: SVGPathElement) => {
      const matrix = path.getScreenCTM()!;
      const tokens = (path.getAttribute('d') ?? '').match(/[MLQ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
      const points: [number, number][] = [];
      for (let index = 0; index < tokens.length;) {
        const operation = tokens[index++];
        if (operation === 'Q') index += 2;
        if (operation === 'M' || operation === 'L' || operation === 'Q') {
          const point = new DOMPoint(+tokens[index++], +tokens[index++]).matrixTransform(matrix);
          points.push([point.x, point.y]);
        }
      }
      return points;
    };
    // A card shrunk by 3 px is its body: an edge may touch the border but not enter.
    const enters = (start: [number, number], end: [number, number], rect: DOMRect) => {
      const insideX = Math.max(start[0], end[0]) > rect.left + 3 && Math.min(start[0], end[0]) < rect.right - 3;
      const insideY = Math.max(start[1], end[1]) > rect.top + 3 && Math.min(start[1], end[1]) < rect.bottom - 3;
      return insideX && insideY;
    };
    const crossings = () => {
      const found: string[] = [];
      for (const edgeGroup of document.querySelectorAll('.neighborhood-canvas .react-flow__edge')) {
        const path = edgeGroup.querySelector('path.react-flow__edge-path') as SVGPathElement | null;
        if (!path) continue;
        const points = edgePoints(path);
        for (let index = 1; index < points.length; index++) {
          for (const card of cards) {
            if (enters(points[index - 1], points[index], card.rect)) found.push(`edge ${edgeGroup.getAttribute('data-id')} crosses card ${card.id}`);
          }
        }
      }
      return found;
    };
    const borderSide = (x: number, rect: DOMRect) => {
      if (Math.abs(x - rect.left) < 2) return 'left';
      if (Math.abs(x - rect.right) < 2) return 'right';
      return '';
    };
    // Edges that arrive at one card side must land at least 10 canvas pixels apart, or their arrowheads pile up.
    const stackedArrowheads = () => {
      const found: string[] = [];
      const landings = new Map<string, number[]>();
      for (const edgeGroup of document.querySelectorAll('.neighborhood-canvas .react-flow__edge')) {
        const path = edgeGroup.querySelector('path.react-flow__edge-path') as SVGPathElement | null;
        const end = path ? edgePoints(path).at(-1) : undefined;
        if (!end) continue;
        for (const { id, rect } of cards) {
          const side = borderSide(end[0], rect);
          if (!side || end[1] < rect.top || end[1] > rect.bottom) continue;
          const key = `${id}:${side}`;
          landings.set(key, [...(landings.get(key) ?? []), end[1]]);
        }
      }
      const zoom = cards.length ? cards[0].rect.width / cards[0].element.offsetWidth : 1;
      for (const [side, heights] of landings) {
        heights.sort((first, second) => first - second);
        const piled = heights.some((height, index) => index > 0 && (height - heights[index - 1]) / zoom < 10);
        if (piled) found.push(`edges pile up on ${side}`);
      }
      return found;
    };
    return [...new Set([...overlapping(), ...unfinishedText(), ...crossings(), ...stackedArrowheads()])];
  });
  return [...new Set([...geometryProblems, ...(await cutTextProblems(page, CARD_TEXT))])];
}
