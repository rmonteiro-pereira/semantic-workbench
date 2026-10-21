/** Reports SQL syntax warnings at source positions without executing SQL or blocking saves. */
import type { Issue } from '../diagnostics';
import { lineColumn, sqlRegions, type SqlRegion } from './regions';
// Expressions parse as SELECT lists; quality queries and transforms parse as statements. Syntax
// errors become warnings at exact source locations and never block saving. The caller supplies the
// parser; browser workers load only the needed dialect grammars.
/** Parses SQL with a selected grammar, throwing when its syntax is invalid. */
export type Astify = (sql: string, grammar: string) => void;
/** Adds SQL region and dialect information to a validation finding. */
export type SqlFinding = Issue & {
  severity: 'warning';
  code: 'sql';
  line: number;
  column: number;
  dialect: string | null;
};
const PREFIX = 'SELECT ';
// `${name}` placeholders (ODCS quality rules) become same-length identifiers.
/** Replaces quality-rule placeholders with identifiers of equal length. */
export const fillPlaceholders = (sql: string) =>
  sql.replace(/\$\{[^}\n]*\}/g, m => 'p' + '_'.repeat(m.length - 1));
/** Parses one SQL region and maps syntax warnings back to file positions. */
export function lintRegion(source: string, region: SqlRegion, astify: Astify): SqlFinding[] {
  if (!region.grammar || !region.value.trim()) return [];
  const body = fillPlaceholders(region.value);
  const sql = region.kind === 'expression' ? PREFIX + body : body;
  const shift = region.kind === 'expression' ? PREFIX.length : 0;
  // ANSI expressions follow the planner (server/agent/sql.ts): PostgreSQL grammar, then SQLite's;
  // the finding reports the PostgreSQL error.
  const grammars = region.grammar === 'postgresql' ? ['postgresql', 'sqlite'] : [region.grammar];
  let first: unknown = null;
  for (const g of grammars) {
    try {
      astify(sql, g);
      return [];
    } catch (e) {
      first ??= e;
    }
  }
  {
    const e = first;
    const error = e as {
      location?: { start?: { offset?: number } };
      found?: unknown;
      message?: string;
    };
    const at = error.location?.start?.offset;
    // The value index the parser points at; outside the value (or none) → the first character.
    const index =
      typeof at === 'number' && at - shift >= 0 && at - shift <= region.value.length
        ? at - shift
        : 0;
    const offset = region.exact
      ? region.offsets[Math.min(index, region.offsets.length - 1)]
      : region.offsets[0];
    const { line, column } = lineColumn(source, offset);
    const token = region.value.slice(index).match(/^[A-Za-z_][\w$]*|^\S/)?.[0];
    const found = token ? `"${token}"` : 'the end';
    const what = region.kind === 'expression' ? 'SQL expression' : 'SQL statement';
    const message = `${what} (${region.dialect ?? 'ANSI SQL'}): syntax error near ${found}. Checked, not executed.`;
    return [
      {
        severity: 'warning',
        code: 'sql',
        path: region.pointer,
        message,
        line,
        column,
        dialect: region.dialect,
      },
    ];
  }
}
// Notes for dialects that are not SQL (info, never a warning): left plain and not checked.
/** Returns regions whose dialects are intentionally left unchecked. */
export function uncheckedRegions(regions: SqlRegion[]) {
  return regions.filter(r => !r.grammar && r.dialect);
}
/** Reports informational notes for unsupported or non-SQL dialects. */
export function dialectNotes(source: string, regions: SqlRegion[]): Issue[] {
  return uncheckedRegions(regions).map(r => {
    const { line, column } = lineColumn(source, r.offsets[0] ?? r.start);
    return {
      severity: 'info',
      code: 'sql-dialect',
      path: r.pointer,
      message: `${r.dialect} expression: not SQL, shown as written and not checked.`,
      line,
      column,
    };
  });
}
/** Lints embedded SQL regions without executing SQL or producing save-blocking errors. */
export function lintSql(
  source: string,
  filename: string,
  astify: Astify,
  regions = sqlRegions(source, filename),
): Issue[] {
  return [...regions.flatMap(r => lintRegion(source, r, astify)), ...dialectNotes(source, regions)];
}
/** Lists the distinct parser grammars required by SQL regions. */
export const grammarsNeeded = (regions: SqlRegion[]) => [
  ...new Set(
    regions.flatMap(r =>
      r.grammar === 'postgresql' ? ['postgresql', 'sqlite'] : r.grammar ? [r.grammar] : [],
    ),
  ),
];
