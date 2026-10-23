// Measures the ODCS graph in screen coordinates: whole cards, no overlaps, readable column text,
// clear lines and labels, the legend and the foreign-key hop row.
import type { Page } from '@playwright/test';

/** The smallest size, on screen, of a column name in the first view. */
export const MIN_COLUMN_PX = 12;

/** Returns what is wrong with the graph now shown; an empty list means it is clean. */
export async function odcsGraphProblems(
  page: Page,
  options: { withKeys?: boolean; readableColumns?: boolean } = {},
): Promise<string[]> {
  return page.evaluate(
    ({ minimum, withKeys, readable }) => {
      const out: string[] = [];
      const view = document.querySelector('.lineage-view');
      const flow = view?.querySelector('.react-flow');
      if (!view || !flow) return ['no graph on screen'];
      const pane = flow.getBoundingClientRect();
      const hit = (a: DOMRect, b: DOMRect) =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const cards = [...view.querySelectorAll('.lineage-card')].map(element => ({
        element,
        rect: element.getBoundingClientRect(),
        name: element.getAttribute('aria-label') ?? 'card',
      }));
      for (const card of cards) {
        const r = card.rect;
        const cut = r.left < pane.left - 1 || r.right > pane.right + 1;
        const cutVertically = r.top < pane.top - 1 || r.bottom > pane.bottom + 1;
        if (cut || cutVertically) out.push(`${card.name} is cut by the edge of the canvas`);
      }
      cards.forEach((a, i) =>
        cards.slice(i + 1).forEach(b => {
          if (hit(a.rect, b.rect)) out.push(`${a.name} overlaps ${b.name}`);
        }),
      );
      // Column names are at least the minimum size once the canvas zoom is counted.
      const viewport = view.querySelector('.react-flow__viewport');
      const scale = viewport ? new DOMMatrix(getComputedStyle(viewport).transform).a : 1;
      const rowName = view.querySelector('.lineage-row-name');
      if (rowName && readable) {
        const px = parseFloat(getComputedStyle(rowName).fontSize) * scale;
        if (px < minimum) out.push(`column names are ${px.toFixed(1)} px on screen`);
      }
      // Lines never run across a card they do not join.
      const owner = new Map<string, Element>();
      for (const el of view.querySelectorAll('[data-id]')) {
        const card = el.closest('.lineage-card');
        const id = el.getAttribute('data-id');
        if (card && id) owner.set(id, card);
      }
      for (const edge of view.querySelectorAll('g.lineage-edge')) {
        const path = edge.querySelector('path.react-flow__edge-path') as SVGPathElement | null;
        const ends = [edge.getAttribute('data-from'), edge.getAttribute('data-to')].map(id =>
          id ? owner.get(id) : undefined,
        );
        const matrix = path?.getScreenCTM();
        if (!path || !matrix) continue;
        const length = path.getTotalLength();
        for (const card of cards) {
          if (ends.includes(card.element)) continue;
          const inner = {
            left: card.rect.left + 3,
            right: card.rect.right - 3,
            top: card.rect.top + 3,
            bottom: card.rect.bottom - 3,
          };
          for (let at = 0; at <= length; at += 6) {
            const p = path.getPointAtLength(at);
            const s = new DOMPoint(p.x, p.y).matrixTransform(matrix);
            if (s.x > inner.left && s.x < inner.right && s.y > inner.top && s.y < inner.bottom) {
              out.push(`a line crosses ${card.name}`);
              break;
            }
          }
        }
      }
      // Labels drawn on the lines never overlap a card or each other.
      const labels = [...view.querySelectorAll('.lineage-edge-label.shown rect')].map(el => ({
        rect: el.getBoundingClientRect(),
        text: [...(el.parentElement?.querySelectorAll('text') ?? [])]
          .map(t => t.textContent)
          .join(' '),
      }));
      for (const label of labels)
        for (const card of cards)
          if (hit(label.rect, card.rect)) out.push(`label "${label.text}" covers ${card.name}`);
      labels.forEach((a, i) =>
        labels.slice(i + 1).forEach(b => {
          if (hit(a.rect, b.rect)) out.push(`labels "${a.text}" and "${b.text}" overlap`);
        }),
      );
      // The legend is on screen, with the key badges of the ODCS graph.
      const legend = view.querySelector('.lineage-foot .lineage-legend');
      if (!legend || legend.getClientRects().length === 0) out.push('the legend is missing');
      else if (withKeys && !/Primary key/.test(legend.textContent ?? ''))
        out.push('the legend does not explain the PK badge');
      // The hop row stays inside the canvas area.
      const hops = view.querySelector('.lineage-hops');
      if (hops) {
        const box = view.getBoundingClientRect();
        for (const child of hops.children) {
          const r = child.getBoundingClientRect();
          if (r.width < 1) continue;
          if (r.left < box.left - 1 || r.right > box.right + 1)
            out.push(`the hop row sticks out: ${child.textContent?.slice(0, 20)}`);
        }
      }
      return out;
    },
    {
      minimum: MIN_COLUMN_PX,
      withKeys: options.withKeys ?? true,
      readable: options.readableColumns ?? true,
    },
  );
}

/** Returns text, inside the foreign-key hop row, that is too small or collides. */
export async function hopRowProblems(page: Page): Promise<string[]> {
  return page.evaluate(minimum => {
    const row = document.querySelector('.lineage-hops');
    if (!row) return ['the foreign-key hop row is missing'];
    const out: string[] = [];
    const boxes: { text: string; rect: DOMRect }[] = [];
    for (const child of row.querySelectorAll('span, button')) {
      if (child.children.length > 0 && child.tagName !== 'BUTTON') continue;
      const style = getComputedStyle(child);
      if (parseFloat(style.fontSize) < minimum)
        out.push(`"${child.textContent}" is ${style.fontSize}`);
      if (child.closest('.lineage-hops-steps') && child.tagName === 'SPAN') continue;
      const rect = child.getBoundingClientRect();
      if (rect.width > 0 && child.textContent?.trim())
        boxes.push({ text: child.textContent.trim(), rect });
    }
    boxes.forEach((a, i) =>
      boxes.slice(i + 1).forEach(b => {
        const across = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const down = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (across > 1 && down > 1) out.push(`"${a.text}" overlaps "${b.text}" in the hop row`);
      }),
    );
    return out;
  }, 12);
}
