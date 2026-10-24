// Measures Admin navigation and the page-owned lists before a screenshot is captured.
import type { Page } from '@playwright/test';
import { tabStripProblems } from './strip-geometry';

/** Finds clipped Admin tables or ambiguous built-in role headings at the current viewport. */
export async function adminPageProblems(page: Page): Promise<string[]> {
  // Resize observers update navigation cues before the next painted frame.
  await page.evaluate(
    () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const problems = await page.evaluate(() => {
    const content = document.querySelector('.admin-content');
    if (!content) return [];
    const found: string[] = [];
    for (const table of content.querySelectorAll('.admin-table')) {
      const rows = table.querySelector('table')?.getBoundingClientRect();
      if (
        table.scrollHeight > table.clientHeight + 1 ||
        (rows && rows.height > table.getBoundingClientRect().height + 1)
      ) {
        found.push('an Admin table clips its rows in a nested vertical scroller');
      }
    }
    if (content.scrollHeight > content.clientHeight + 1) {
      const style = getComputedStyle(content);
      if (style.scrollbarWidth !== 'thin' || style.scrollbarGutter !== 'stable') {
        found.push('the scrollable Admin page has no stable vertical scroll affordance');
      }
    }
    for (const heading of content.querySelectorAll('.admin-builtin-role h3')) {
      if (!heading.textContent?.includes('Built-in role')) {
        found.push('a built-in role heading confuses definition editability with permissions');
      }
    }
    return found;
  });
  return [...problems, ...(await adminGuidanceProblems(page)), ...(await tabStripProblems(page))];
}

async function adminGuidanceProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const content = document.querySelector('.admin-content');
    if (content?.textContent?.includes('Assign roles in Roles & access')) {
      problems.push('project role guidance names an absent navigation destination');
    }
    const person = content?.querySelector('input[list="admin-principals"]');
    if (!person) return problems;
    const guidance = document.getElementById(person.getAttribute('aria-describedby') ?? '');
    if (!guidance?.textContent?.includes('Users & groups')) {
      problems.push('the person identifier has no guidance to its source');
    }
    const instructions = document.getElementById('access-check-guidance')?.textContent;
    if (!instructions?.includes('Enter a project for Who can access.')) {
      problems.push('the access checker does not explain action prerequisites');
    }
    return problems;
  });
}
