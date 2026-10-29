// Tests SQL warning locations without changing source text.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { sqlFindings } from '../src/server/projects/scanner';
import { fillPlaceholders, type SqlFinding } from '../src/sql/lint';
import { validateInput } from '../src/validation/input';
// SQL lint: findings at exact, hand-computed positions, warnings only, nothing changed.
const fixture = (name: string) => readFileSync(`tests/fixtures/sql/${name}`, 'utf8');
const warnings = (src: string, name: string) =>
  sqlFindings(src, name).filter(f => f.severity === 'warning') as SqlFinding[];
const at = (f: { line: number; column: number }) => [f.line, f.column];
test('the CASE WHEN fixture is clean', () => {
  expect(warnings(fixture('case-when.ossie.yaml'), 'case-when.ossie.yaml')).toEqual([]);
});
test('the broken CASE WHEN: one warning at the ) closing SUM(CASE …, line 23 column 77 (counted by hand)', () => {
  const src = fixture('case-when-broken.ossie.yaml');
  const f = warnings(src, 'case-when-broken.ossie.yaml');
  expect(f).toHaveLength(1);
  expect(at(f[0])).toEqual([23, 77]);
  expect(f[0]).toMatchObject({
    severity: 'warning',
    code: 'sql',
    path: '/metrics/0/expression/dialects/0/expression',
    dialect: 'ANSI_SQL',
  });
  expect(f[0].message).toBe(
    'SQL expression (ANSI_SQL): syntax error near ")". Checked, not executed.',
  );
  expect(src.split('\n')[22][76]).toBe(')');
});
test('JSON escapes: the clean twin has no finding; the broken one points at the backslash of \\"x\\" (line 15 column 143)', () => {
  const f = warnings(fixture('escaped.semantic.json'), 'escaped.semantic.json');
  expect(f.map(x => x.path)).toEqual(['/metrics/1/expression/dialects/0/expression']);
  expect(at(f[0])).toEqual([15, 143]);
});
test('folded scalar: the error on its third line is reported there (line 20 column 26, the second END), with the Snowflake grammar', () => {
  const f = warnings(fixture('folded.ossie.yaml'), 'folded.ossie.yaml');
  expect(f).toHaveLength(1);
  expect(at(f[0])).toEqual([20, 26]);
  expect(f[0].dialect).toBe('SNOWFLAKE');
  expect(f[0].message).toContain('near "END"');
});
test('placeholders become same-length identifiers; ODCS quality queries and transformLogic are checked as statements', () => {
  expect(fillPlaceholders('SELECT ${table} x')).toBe('SELECT p_______ x');
  expect(warnings(fixture('quality.odcs.yaml'), 'quality.odcs.yaml')).toEqual([]);
  const broken = fixture('quality.odcs.yaml').replace('GROUP BY customer_id', 'GROUP customer_id');
  const f = warnings(broken, 'quality.odcs.yaml');
  expect(f.map(x => x.path)).toEqual(['/schema/0/properties/1/transformLogic']);
  const line = broken.split('\n').findIndex(l => l.includes('transformLogic')) + 1;
  expect(f[0].line).toBe(line);
  expect(broken.split('\n')[line - 1].slice(f[0].column! - 1)).toStartWith('customer_id');
});
test('a non-SQL dialect is skipped (no warning for DAX, an info note instead); the ANSI expression beside it is checked', () => {
  expect(warnings(fixture('dax.ossie.yaml'), 'dax.ossie.yaml')).toEqual([]);
  expect(sqlFindings(fixture('dax.ossie.yaml'), 'dax.ossie.yaml')).toEqual([
    {
      severity: 'info',
      code: 'sql-dialect',
      path: '/metrics/0/expression/dialects/0/expression',
      message: 'DAX expression: not SQL, shown as written and not checked.',
      line: 17,
      column: 23,
    },
  ]);
  const broken = fixture('dax.ossie.yaml').replace(
    'expression: SUM(sales.amount)',
    'expression: SUM(sales.amount',
  );
  expect(warnings(broken, 'dax.ossie.yaml').map(f => f.path)).toEqual([
    '/metrics/0/expression/dialects/1/expression',
  ]);
});
test('findings are warnings only: the files stay valid, and the text is unchanged', () => {
  for (const name of [
    'case-when-broken.ossie.yaml',
    'escaped.semantic.json',
    'folded.ossie.yaml',
  ]) {
    const src = fixture(name);
    const copy = src.slice();
    const f = warnings(src, name);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every(x => x.severity === 'warning')).toBe(true);
    expect(validateInput(src, name).valid).toBe(true);
    expect(src).toBe(copy);
  }
});
test('every shipped example is free of SQL findings', () => {
  const { readdirSync } = require('node:fs');
  for (const f of readdirSync('public/examples', { recursive: true })
    .map(String)
    .filter((f: string) => /\.(ya?ml|json)$/.test(f)))
    expect([f, warnings(readFileSync('public/examples/' + f, 'utf8'), f)]).toEqual([f, []]);
}, 60_000);
