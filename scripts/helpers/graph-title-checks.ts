/** Verifies title plates against the actual SVG edge layer independently of random crossings. */
import { expect, type Page } from '@playwright/test';

/** Checks that an opaque heading remains above a temporary stroke in the existing edge plane. */
export async function checkGraphTitleLayer(page: Page) {
  const result = await page.locator('.full-graph').evaluate(graph => {
    const heading = [...graph.querySelectorAll<HTMLElement>('.full-area-title')].find(element => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
    })!;
    const edge = graph.querySelector<SVGPathElement>('.react-flow__edge-path')!;
    const box = heading.getBoundingClientRect();
    const point = new DOMPoint(box.left + box.width / 2, box.top + box.height / 2);
    const local = point.matrixTransform(edge.getScreenCTM()!.inverse());
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    probe.setAttribute('d', `M ${local.x - 30} ${local.y} L ${local.x + 30} ${local.y}`);
    Object.assign(probe.style, { stroke: 'var(--color-edge-active)', strokeWidth: '20px', fill: 'none', pointerEvents: 'stroke' });
    edge.parentElement!.append(probe);
    try {
      return { above: heading.contains(document.elementFromPoint(point.x, point.y)), background: getComputedStyle(heading).backgroundColor };
    } finally {
      probe.remove();
    }
  });
  expect(result.above).toBe(true);
  expect(result.background).not.toBe('rgba(0, 0, 0, 0)');
  console.log('PASS opaque area titles stay above the SVG edge and outline layer');
}
