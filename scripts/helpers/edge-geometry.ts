// Measures neighborhood edge paths and labels in browser screen coordinates.
import type { Page } from '@playwright/test';
// SVG paths are measured as straight segments in screen coordinates, skipping rounded corners.
// Shared segments and overlapping labels make connections ambiguous.
/** Returns overlapping edge segments and labels measured in screen coordinates. */
export async function neighborhoodEdgeProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const edges = [...document.querySelectorAll('.neighborhood-canvas .react-flow__edge')]
      .map(edgeGroup => {
        const path = edgeGroup.querySelector('path.react-flow__edge-path') as SVGPathElement | null;
        if (!path) return null;
        const ctm = path.getScreenCTM()!;
        const pt = (x: number, y: number) => {
          const p = new DOMPoint(x, y).matrixTransform(ctm);
          return [p.x, p.y] as [number, number];
        };
        const tokens = (path.getAttribute('d') ?? '').match(/[MLQ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
        const segments: [[number, number], [number, number]][] = [];
        let current: [number, number] | null = null;
        for (let i = 0; i < tokens.length;) {
          const op = tokens[i++];
          if (op === 'M') {
            current = [+tokens[i++], +tokens[i++]];
          } else if (op === 'L') {
            const next: [number, number] = [+tokens[i++], +tokens[i++]];
            if (current) segments.push([pt(...current), pt(...next)]);
            current = next;
          } else if (op === 'Q') {
            i += 2;
            current = [+tokens[i++], +tokens[i++]];
          } else i++;
        }
        return { id: edgeGroup.getAttribute('data-id') ?? '', segments };
      })
      .filter(Boolean) as { id: string; segments: [[number, number], [number, number]][] }[];
    const near = (a: number, b: number) => Math.abs(a - b) < 0.75;
    for (let i = 0; i < edges.length; i++)
      for (let j = i + 1; j < edges.length; j++)
        for (const [firstStart, firstEnd] of edges[i].segments)
          for (const [secondStart, secondEnd] of edges[j].segments) {
            const horizontal = near(firstStart[1], firstEnd[1]) && near(secondStart[1], secondEnd[1]) && near(firstStart[1], secondStart[1]);
            const vertical = near(firstStart[0], firstEnd[0]) && near(secondStart[0], secondEnd[0]) && near(firstStart[0], secondStart[0]);
            let axis: number;
            if (horizontal) {
              axis = 0;
            } else if (vertical) {
              axis = 1;
            } else {
              axis = -1;
            }
            if (axis < 0) continue;
            const overlap =
              Math.min(Math.max(firstStart[axis], firstEnd[axis]), Math.max(secondStart[axis], secondEnd[axis])) -
              Math.max(Math.min(firstStart[axis], firstEnd[axis]), Math.min(secondStart[axis], secondEnd[axis]));
            if (overlap > 4) {
              problems.push(`${edges[i].id} and ${edges[j].id} share ${Math.round(overlap)} px`);
              break;
            }
          }
    const labels = [...document.querySelectorAll('.neighborhood-canvas .react-flow__edge-textwrapper, .neighborhood-canvas .relationship-label')].map(l => ({
      text: l.textContent,
      box: l.getBoundingClientRect(),
    }));
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        const firstBox = labels[i].box;
        const secondBox = labels[j].box;
        if (firstBox.left < secondBox.right - 1 && secondBox.left < firstBox.right - 1 && firstBox.top < secondBox.bottom - 1 && secondBox.top < firstBox.bottom - 1)
          problems.push(`labels "${labels[i].text}" and "${labels[j].text}" overlap`);
      }
    return problems;
  });
}
// The neighborhood's current center id and its counts.
/** Returns the neighborhood center and its visible neighbor counts. */
export async function neighborhoodState(page: Page) {
  return page.evaluate(() => {
    const counts = document.querySelector('[aria-label="Neighbor counts"]')?.textContent ?? '';
    const match = counts.match(/^(\d+) of (\d+) neighbors(?: · (\d+) hidden)?/);
    return {
      center: document.querySelector('.react-flow__node.center')?.getAttribute('data-id') ?? null,
      shown: match ? +match[1] : null,
      total: match ? +match[2] : null,
      hidden: match ? +(match[3] ?? 0) : null,
      nodes: document.querySelectorAll('.neighborhood-canvas .react-flow__node').length,
    };
  });
}
// Choose a center through the searchable picker.
/** Selects a neighborhood center through the searchable picker. */
export async function pickCenter(page: Page, query: string, name = query) {
  const input = page.getByRole('textbox', { name: 'Find a center' });
  await input.fill(query);
  await page
    .getByRole('listbox', { name: 'Center candidates' })
    .getByRole('option')
    .filter({
      has: page.locator('strong', {
        hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
      }),
    })
    .first()
    .click();
}
