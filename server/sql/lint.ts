import { Parser } from 'node-sql-parser';
import { lintSql } from '../../src/sql/lint';
import type { Issue } from '../../src/diagnostics';
// The server's SQL lint (FR-052): the shared rules with the full parser, so the API's file
// findings equal the editor's.
const parser = new Parser();
export const serverAstify = (sql: string, grammar: string) => {
  parser.astify(sql, { database: grammar });
};
export function sqlFindings(source: string, filename: string): Issue[] {
  try {
    return lintSql(source, filename, serverAstify);
  } catch {
    return [];
  }
}
