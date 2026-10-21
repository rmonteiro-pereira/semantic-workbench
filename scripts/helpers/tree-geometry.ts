// Measures project tree rows for clipped text, overlapping controls and usable hit areas.
import type { Page } from '@playwright/test';
// Row controls need at least 28 px hit areas. Filename text must ellipsize before reaching an
// icon.
/** Returns project row clipping, overlap and hit-area problems from the page. */
export async function treeRowProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const sidebar = document.querySelector('.workspace-sidebar')!.getBoundingClientRect();
    const rows = [...document.querySelectorAll<HTMLElement>('.project-tree .tree-row')];
    if (!rows.length) problems.push('no tree rows');
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      const label = row.querySelector('button')?.getAttribute('aria-label') ?? row.textContent;
      const name = row.querySelector<HTMLElement>('.project-toggle,.document')!;
      const del = row.querySelector<HTMLElement>('.row-delete');
      const menu = row.querySelector<HTMLElement>('.item-menu-toggle');
      if (!del || !menu) {
        problems.push(`${label}: missing delete or menu button`);
        continue;
      }
      const boxes = [name, del, menu].map(e => e.getBoundingClientRect());
      const text = name.querySelector('span')!.getBoundingClientRect();
      if (r.right > sidebar.right + 0.5 || r.left < sidebar.left - 0.5)
        problems.push(`${label}: row leaves the sidebar`);
      for (const b of boxes)
        if (b.left < r.left - 0.5 || b.right > r.right + 0.5)
          problems.push(`${label}: control leaves its row`);
      for (let i = 0; i < 3; i++)
        for (let j = i + 1; j < 3; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (
            a.left < b.right - 0.5 &&
            b.left < a.right - 0.5 &&
            a.top < b.bottom - 0.5 &&
            b.top < a.bottom - 0.5
          )
            problems.push(`${label}: controls ${i} and ${j} overlap`);
        }
      for (const b of boxes.slice(1))
        if (b.width < 28 || b.height < 28)
          problems.push(`${label}: icon hit area ${b.width}×${b.height}`);
      if (text.right > boxes[1].left + 0.5)
        problems.push(`${label}: name runs under the delete icon`);
    }
    return problems;
  });
}
