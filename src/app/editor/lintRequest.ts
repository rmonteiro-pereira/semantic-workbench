/** Answers one validation request of the lint worker. Every request gets a reply with its own id, even when the draft checks fail to load. */
import { validateInput } from '../../shared/validation/input';
import { isGitignore } from '../../shared/scm/gitignore';
import { browserSqlFindings, browserSqlTextFindings } from '../sql/browser';
import { prepareDraftChecks } from '../../shared/validation/draft-validators';
import type { Issue } from '../../shared/validation/diagnostics';

/** A request to the lint worker. One with `sql` lints that SQL text alone, as a form field does. */
export type LintRequest = {
  id: number;
  source: string;
  filename: string;
  sql?: string;
  dialect?: string | null;
  assumeOssieVersion?: boolean;
};

/** The reply to a request, matched by its id on the main thread. */
export type LintReply = { id: number; issues: Issue[] };

async function sqlTextReply(request: LintRequest & { sql: string }): Promise<LintReply> {
  let issues: Issue[] = [];
  try {
    issues = await browserSqlTextFindings(request.sql, request.dialect ?? null);
  } catch {}
  return { id: request.id, issues };
}

/**
 * Validates one document. A failed load of the draft checks is not fatal: the document is then
 * checked without them, which gives a 0.3 draft file the blocking loading finding, and the next
 * request tries the load again. `prepare` is passed in so a test can make the load fail.
 */
export async function lintReply(request: LintRequest, prepare: (source: string) => Promise<void> = prepareDraftChecks): Promise<LintReply> {
  const { id, source, filename, sql } = request;
  if (sql !== undefined) return sqlTextReply({ ...request, sql });
  await prepare(source).catch(() => undefined);
  let issues: Issue[];
  try {
    issues = isGitignore(filename) ? [] : validateInput(source, filename, { assumeOssieVersion: request.assumeOssieVersion }).issues;
  } catch (error) {
    issues = [{ severity: 'error', code: 'parse', path: '/', message: (error as Error).message }];
  }
  if (!isGitignore(filename))
    try {
      issues = [...issues, ...(await browserSqlFindings(source, filename))];
    } catch {}
  return { id, issues };
}
