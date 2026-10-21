/** Runs document and SQL validation off the main thread, loading SQL grammars only when needed. */
import { validateInput } from '../input';
import { isGitignore } from '../scm/gitignore';
import { browserSqlFindings, browserSqlTextFindings } from '../sql/browser';
// Shared validation rules off the main thread: typing never waits for a parse. SQL inside
// definitions is linted here too: warnings with exact positions, grammar builds loaded on first
// need. A request with `sql` lints one SQL text (form fields).
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    source: string;
    filename: string;
    sql?: string;
    dialect?: string | null;
  }>,
) => {
  const { id, source, filename, sql } = event.data;
  if (sql !== undefined) {
    let issues: any[] = [];
    try {
      issues = await browserSqlTextFindings(sql, event.data.dialect ?? null);
    } catch {}
    (self as any).postMessage({ id, issues });
    return;
  }
  let issues;
  try {
    issues = isGitignore(filename) ? [] : validateInput(source, filename).issues;
  } catch (e) {
    issues = [{ severity: 'error', code: 'parse', path: '/', message: (e as Error).message }];
  }
  if (!isGitignore(filename))
    try {
      issues = [...issues, ...(await browserSqlFindings(source, filename))];
    } catch {}
  (self as any).postMessage({ id, issues });
};
