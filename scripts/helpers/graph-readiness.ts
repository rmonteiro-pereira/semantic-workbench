// Initial graph measurements must wait for the scheduled fit and background route publication.
import { expect, type Page } from '@playwright/test';

/** Returns whole-node bounds and centering problems in the model graph viewport. */
export async function graphBoundsProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const pane = document.querySelector('.full-graph .react-flow')?.getBoundingClientRect();
    if (!pane) return [];
    const problems: string[] = [];
    const cards = [...document.querySelectorAll('.full-graph .react-flow__node')].map(node => ({
      id: node.getAttribute('data-id'),
      bounds: node.getBoundingClientRect(),
    }));
    for (const { id, bounds } of cards) {
      const outside = bounds.left < pane.left - 1 || bounds.right > pane.right + 1 || bounds.top < pane.top - 1 || bounds.bottom > pane.bottom + 1;
      if (outside) problems.push(`graph card ${id} leaves its pane`);
    }
    if (cards.length) {
      const left = Math.min(...cards.map(card => card.bounds.left));
      const right = Math.max(...cards.map(card => card.bounds.right));
      const top = Math.min(...cards.map(card => card.bounds.top));
      const bottom = Math.max(...cards.map(card => card.bounds.bottom));
      const offCenterX = Math.abs(left + right - pane.left - pane.right) / 2;
      const offCenterY = Math.abs(top + bottom - pane.top - pane.bottom) / 2;
      if (offCenterX > 2 || offCenterY > 2) problems.push('the model graph is not centered');
    }
    return problems;
  });
}

async function graphGeometrySignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = document.querySelector('.full-graph')!;
    const viewport = root.querySelector('.react-flow__viewport');
    const nodes = [...root.querySelectorAll('.react-flow__node')].map(node => node.getBoundingClientRect().toJSON());
    const paths = [...root.querySelectorAll('.react-flow__edge-path')].map(path => path.getAttribute('d'));
    return JSON.stringify({ viewport: viewport?.getAttribute('style'), nodes, paths });
  });
}

/** Requires a fitted initial viewport and three unchanged node/path measurements. */
export async function expectInitialGraphSettled(page: Page): Promise<void> {
  let previous = '';
  let unchanged = 0;
  await expect
    .poll(async () => {
      if ((await graphBoundsProblems(page)).length) {
        previous = '';
        unchanged = 0;
        return unchanged;
      }
      const signature = await graphGeometrySignature(page);
      unchanged = signature === previous ? unchanged + 1 : 0;
      previous = signature;
      return unchanged;
    })
    .toBeGreaterThanOrEqual(2);
}
