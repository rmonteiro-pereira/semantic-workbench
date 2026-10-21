// Runs shared SQL lint rules with the full parser so API findings match editor findings.
import { Parser } from 'node-sql-parser';
import { lintSql } from '../../src/sql/lint';
import type { Issue } from '../../src/diagnostics';
const parser = new Parser();
/** Checks SQL with the requested grammar and throws on parser errors. */
export const serverAstify = (sql: string, grammar: string) => {
  parser.astify(sql, { database: grammar });
};
/** Returns shared SQL findings, falling back to no findings if linting fails. */
export function sqlFindings(source: string, filename: string): Issue[] {
  try {
    return lintSql(source, filename, serverAstify);
  } catch {
    return [];
  }
}
