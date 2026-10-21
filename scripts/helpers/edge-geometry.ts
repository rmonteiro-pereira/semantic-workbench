import type { Page } from '@playwright/test';
// Neighborhood edge geometry in the real page (FR-040): no two edges may run along the same line for
// more than a few pixels, and no two visible edge labels may overlap. Paths are read from the SVG
// `d` attributes (straight segments; rounded corners are skipped) in screen coordinates.
export async function neighborhoodEdgeProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const edges = [...document.querySelectorAll('.neighborhood-canvas .react-flow__edge')]
      .map(g => {
        const path = g.querySelector('path.react-flow__edge-path') as SVGPathElement | null;
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
        return { id: g.getAttribute('data-id') ?? '', segments };
      })
      .filter(Boolean) as { id: string; segments: [[number, number], [number, number]][] }[];
    const near = (a: number, b: number) => Math.abs(a - b) < 0.75;
    for (let i = 0; i < edges.length; i++)
      for (let j = i + 1; j < edges.length; j++)
        for (const [p, q] of edges[i].segments)
          for (const [r, s] of edges[j].segments) {
            const horizontal = near(p[1], q[1]) && near(r[1], s[1]) && near(p[1], r[1]);
            const vertical = near(p[0], q[0]) && near(r[0], s[0]) && near(p[0], r[0]);
            const k = horizontal ? 0 : vertical ? 1 : -1;
            if (k < 0) continue;
            const overlap =
              Math.min(Math.max(p[k], q[k]), Math.max(r[k], s[k])) -
              Math.max(Math.min(p[k], q[k]), Math.min(r[k], s[k]));
            if (overlap > 4) {
              problems.push(`${edges[i].id} and ${edges[j].id} share ${Math.round(overlap)} px`);
              break;
            }
          }
    const labels = [
      ...document.querySelectorAll('.neighborhood-canvas .react-flow__edge-textwrapper'),
    ].map(l => ({ text: l.textContent, box: l.getBoundingClientRect() }));
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i].box;
        const b = labels[j].box;
        if (
          a.left < b.right - 1 &&
          b.left < a.right - 1 &&
          a.top < b.bottom - 1 &&
          b.top < a.bottom - 1
        )
          problems.push(`labels "${labels[i].text}" and "${labels[j].text}" overlap`);
      }
    return problems;
  });
}
// The neighborhood's current center id and its counts.
export async function neighborhoodState(page: Page) {
  return page.evaluate(() => {
    const counts = document.querySelector('[aria-label="Neighbor counts"]')?.textContent ?? '';
    const m = counts.match(/^(\d+) of (\d+) neighbors(?: · (\d+) hidden)?/);
    return {
      center: document.querySelector('.react-flow__node.center')?.getAttribute('data-id') ?? null,
      shown: m ? +m[1] : null,
      total: m ? +m[2] : null,
      hidden: m ? +(m[3] ?? 0) : null,
      nodes: document.querySelectorAll('.neighborhood-canvas .react-flow__node').length,
    };
  });
}
// Choose a center through the searchable picker.
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
