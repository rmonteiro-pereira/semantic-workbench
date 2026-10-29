// Parses and renders the restricted SQL expressions supported by the governed query planner.
import { Parser } from 'node-sql-parser';
import { BadRequestError } from '../projects/errors';
const parser = new Parser();
/** A column reference and its syntax node, with an optional table qualifier. */
export type ColumnRef = { table: string | null; column: string; node: any };
/** Visits each object in a SQL syntax tree, including nodes inside arrays. */
export function walk(ast: any, visit: (node: any) => void) {
  const queue = [ast];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    if (!node || typeof node !== 'object') continue;
    visit(node);
    for (const value of Object.values(node)) if (value && typeof value === 'object') queue.push(...(Array.isArray(value) ? value : [value]));
  }
}
/** Parses a supported expression, optionally allowing a WHERE condition. */
export function parseExpression(expression: string, { conditional = false } = {}) {
  if (typeof expression !== 'string' || !expression.trim() || expression.length > 100_000) throw new BadRequestError('Expected an expression of 1–100,000 characters.');
  let ast: any;
  try {
    ast = parser.astify('SELECT ' + expression, { database: 'Postgresql' });
  } catch {
    try {
      ast = parser.astify('SELECT ' + expression, { database: 'SQLite' });
    } catch (e) {
      const error = e as any;
      throw new BadRequestError(
        `Unsupported expression syntax${error.location?.start ? ` at ${error.location.start.line}:${error.location.start.column}` : ''}. Preserve the expression and use a compatible planner.`,
      );
    }
  }
  if (
    Array.isArray(ast) ||
    ast.type !== 'select' ||
    ast.with ||
    ast._next ||
    ast.set_op ||
    ast.for_update ||
    ast.from ||
    ast.columns?.length !== 1 ||
    ast.columns[0].as ||
    ast.groupby ||
    ast.having ||
    ast.orderby ||
    ast.window ||
    ast.limit?.value?.length ||
    (ast.into && Object.values(ast.into).some(v => v !== null)) ||
    (!conditional && ast.where)
  )
    throw new BadRequestError('Expected a single scalar/aggregate expression, not a query or alias.');
  walk([ast.columns[0].expr, ast.where], n => {
    if (n.type === 'select' || n.type === 'star' || n.type === 'param' || n.type === 'origin' || (n.type === 'column_ref' && n.column === '*') || n.over)
      throw new BadRequestError('Subqueries, wildcards, parameters and window expressions require a richer planner.');
  });
  return { expression: ast.columns[0].expr, condition: ast.where ?? null };
}
/** Collects column references and rejects wildcards or unresolved column names. */
export function columnRefs(ast: any) {
  const refs: ColumnRef[] = [];
  walk(ast, n => {
    if (n.type === 'column_ref') {
      const column = typeof n.column === 'string' ? n.column : n.column?.expr?.value;
      if (typeof column !== 'string' || column === '*') throw new BadRequestError('Unresolved wildcard or complex column reference.');
      refs.push({
        table: typeof n.table === 'string' ? n.table : (n.table?.value ?? null),
        column,
        node: n,
      });
    }
  });
  return refs;
}
/** Returns whether an expression contains no aggregate or window functions. */
export function scalar(ast: any) {
  let yes = true;
  walk(ast, n => {
    if (n.type === 'aggr_func' || n.over) yes = false;
  });
  return yes;
}
/** Renders an expression tree as PostgreSQL SQL without the surrounding SELECT. */
export function expressionSql(ast: any) {
  const select: any = parser.astify('SELECT 1', { database: 'Postgresql' });
  select.columns[0].expr = ast;
  return parser.sqlify(select, { database: 'Postgresql' }).replace(/^SELECT\s+/i, '');
}
/** Quotes a SQL identifier, escaping quotes and rejecting empty names or NUL bytes. */
export function quoteIdentifier(name: string) {
  if (!name || name.includes('\0')) throw new BadRequestError('Invalid identifier.');
  return '"' + name.replaceAll('"', '""') + '"';
}
/** Quotes a simple dotted table or view name, rejecting SQL expressions. */
export function sourceSql(source: string) {
  if (!/^[A-Za-z_][\w$]*(\.[A-Za-z_][\w$]*)*$/.test(source))
    throw new BadRequestError(`Physical source "${source}" is not a simple qualified identifier. Supply a view/table source before generating SQL.`);
  return source.split('.').map(quoteIdentifier).join('.');
}
/** Builds a syntax node for a table-qualified column. */
export function columnNode(table: string, column: string) {
  return parseExpression(`${quoteIdentifier(table)}.${quoteIdentifier(column)}`).expression;
}
