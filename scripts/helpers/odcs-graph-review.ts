/** Measures the table lineage pane against the visible viewport. */
import { expect, type Page } from '@playwright/test';

/** Requires room for lineage beneath a compact table header. */
export async function checkDatasetLineageRoom(page: Page) {
  const pane = page.locator('.odcs-lineage-host .react-flow');
  const box = await pane.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  if (viewport.width >= 1280) expect(box!.y).toBeLessThanOrEqual(viewport.height / 2);
  expect(Math.min(box!.height, viewport.height - box!.y)).toBeGreaterThanOrEqual(300);
}

/** Requires all hop controls to share one flex line on desktop. */
export async function checkHopsRow(page: Page) {
  if (page.viewportSize()!.width < 1280) return;
  const centres = await page.locator('.lineage-hops').evaluateAll(rows =>
    rows.map(row =>
      [...row.children].map(child => {
        const box = child.getBoundingClientRect();
        return box.y + box.height / 2;
      }),
    ),
  );
  for (const row of centres) expect(Math.max(...row) - Math.min(...row)).toBeLessThanOrEqual(1);
}
