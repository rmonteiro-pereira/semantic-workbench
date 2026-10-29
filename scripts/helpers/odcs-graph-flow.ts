// Measurements for the cards of the ODCS graph: pagination controls, edge anchors on an opened
// card, and the labels drawn on lines.
import type { Page } from '@playwright/test';

/** Counts page buttons and pagers on the cards of the canvas; there must be none. */
export async function paginationControls(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('.lineage-card nav, .lineage-card [aria-label^="Page "], .lineage-pager').length);
}

/** What the handles of an opened card do: how many sit on their row, how many wait on a list edge,
 * and the problems found. */
export type AnchorReport = { onRow: number; onEdge: number; markers: number; problems: string[] };

/** Checks that each connected row's handle sits on its row, or on the list edge with a marker. */
export async function anchorReport(page: Page, cardName: string): Promise<AnchorReport> {
  return page.evaluate(name => {
    const report: AnchorReport = { onRow: 0, onEdge: 0, markers: 0, problems: [] };
    const card = [...document.querySelectorAll('.lineage-card')].find(c => c.getAttribute('aria-label') === name);
    const list = card?.querySelector('.lineage-list');
    if (!card || !list) return { ...report, problems: [`${name} has no opened list`] };
    const box = list.getBoundingClientRect();
    const rows = new Map([...list.querySelectorAll('li[data-id]')].map(li => [li.getAttribute('data-id')!, li]));
    const centre = (r: DOMRect) => (r.top + r.bottom) / 2;
    for (const handle of card.querySelectorAll('.react-flow__handle.source')) {
      const id = (handle.getAttribute('data-handleid') ?? '').replace(/:out$/, '');
      if (!id.includes('/')) continue;
      const at = centre(handle.getBoundingClientRect());
      const row = rows.get(id);
      if (row && Math.abs(at - centre(row.getBoundingClientRect())) <= 3) report.onRow++;
      else if (handle.classList.contains('clamped')) {
        const onEdge = Math.abs(at - box.top) <= 3 || Math.abs(at - box.bottom) <= 3;
        if (onEdge) report.onEdge++;
        else report.problems.push(`${id}: edge handle is ${Math.round(at - box.top)} px from the top`);
      } else report.problems.push(`${id}: handle is not on its row`);
    }
    report.markers = card.querySelectorAll('.lineage-list-marker').length;
    return report;
  }, cardName);
}

/** The labels drawn on lines now: their text and the cards the lines join. */
export type DrawnLabel = { text: string; fromCard: string; toCard: string };

/** Returns the labels that are drawn on lines (not the ones that wait for a hover). */
export async function drawnLabels(page: Page): Promise<DrawnLabel[]> {
  return page.evaluate(() => {
    const owner = new Map<string, string>();
    for (const el of document.querySelectorAll('.lineage-card [data-id]')) {
      const card = el.closest('.lineage-card');
      owner.set(el.getAttribute('data-id')!, card?.getAttribute('data-id') ?? '');
    }
    return [...document.querySelectorAll('g.lineage-edge')].flatMap(edge => {
      const shown = edge.querySelector('.lineage-edge-label.shown');
      if (!shown) return [];
      const from = edge.getAttribute('data-from') ?? '';
      const to = edge.getAttribute('data-to') ?? '';
      return [
        {
          text: [...shown.querySelectorAll('text')].map(t => t.textContent).join(' '),
          fromCard: owner.get(from) ?? from,
          toCard: owner.get(to) ?? to,
        },
      ];
    });
  });
}
