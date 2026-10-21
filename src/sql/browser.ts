/** Loads SQL dialect grammars on demand inside the validation worker to keep typing responsive. */
import { lintSql, lintRegion, grammarsNeeded, type Astify, type SqlFinding } from './lint';
import { grammarOf, sqlRegions, type SqlRegion } from './regions';
import type { Issue } from '../diagnostics';
// The browser's SQL lint: one node-sql-parser grammar build per dialect, imported on first need
// (each 180–300 KB), inside the validation worker so typing never waits.
const builds: Record<string, () => Promise<any>> = {
  postgresql: () => import('node-sql-parser/build/postgresql.js'),
  sqlite: () => import('node-sql-parser/build/sqlite.js'),
  snowflake: () => import('node-sql-parser/build/snowflake.js'),
  bigquery: () => import('node-sql-parser/build/bigquery.js'),
  hive: () => import('node-sql-parser/build/hive.js'),
  mysql: () => import('node-sql-parser/build/mysql.js'),
  transactsql: () => import('node-sql-parser/build/transactsql.js'),
  trino: () => import('node-sql-parser/build/trino.js'),
  redshift: () => import('node-sql-parser/build/redshift.js'),
  athena: () => import('node-sql-parser/build/athena.js'),
  db2: () => import('node-sql-parser/build/db2.js'),
};
const parsers = new Map<string, Promise<any>>();
function parserFor(grammar: string) {
  let p = parsers.get(grammar);
  if (!p) {
    const load = builds[grammar];
    p = load
      ? load().then(m => {
          const P = m.Parser ?? m.default?.Parser;
          return new P();
        })
      : Promise.resolve(null);
    parsers.set(grammar, p);
  }
  return p;
}
/** Lints embedded SQL using dialect grammars loaded on demand. */
export async function browserSqlFindings(source: string, filename: string): Promise<Issue[]> {
  const regions = sqlRegions(source, filename);
  if (!regions.length) return [];
  const loaded = new Map<string, any>();
  for (const g of grammarsNeeded(regions)) loaded.set(g, await parserFor(g));
  const astify: Astify = (sql, grammar) => {
    const p = loaded.get(grammar);
    if (!p) return;
    p.astify(sql, { database: grammar });
  };
  return lintSql(source, filename, astify, regions);
}

/** Lints one SQL field with findings relative to the supplied text. */
export async function browserSqlTextFindings(
  sql: string,
  dialect: string | null,
  kind: 'expression' | 'statement' = 'expression',
  odcs = false,
): Promise<SqlFinding[]> {
  const grammar = grammarOf(dialect, odcs);
  if (!grammar || !sql.trim()) return [];
  const region: SqlRegion = {
    pointer: '',
    path: [],
    value: sql,
    offsets: Array.from({ length: sql.length + 1 }, (_, i) => i),
    start: 0,
    end: sql.length,
    dialect,
    grammar,
    kind,
    exact: true,
  };
  const loaded = new Map<string, any>();
  for (const g of grammarsNeeded([region])) loaded.set(g, await parserFor(g));
  return lintRegion(sql, region, (text, g) => {
    const p = loaded.get(g);
    if (p) p.astify(text, { database: g });
  });
}
