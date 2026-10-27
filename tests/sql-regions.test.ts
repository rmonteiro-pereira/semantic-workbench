// Tests SQL extraction and offsets back to the original YAML or JSON.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { grammarOf, lineColumn, sqlRegions, type SqlRegion } from '../src/shared/sql/regions';
// SQL regions and offset maps: every location of the contract, every scalar style, escapes, flow
// and multi-document YAML.
const fixture = (name: string) => readFileSync(`tests/fixtures/sql/${name}`, 'utf8');
const shape = (r: SqlRegion) => r.pointer.replace(/\/\d+(?=\/|$)/g, '/*');
// Every value character maps to the file character it came from: itself, the line break a folded
// break replaced, the backslash of an escape, or the first quote of `''`.
function mapsBack(src: string, r: SqlRegion) {
  expect(r.exact).toBe(true);
  expect(r.offsets).toHaveLength(r.value.length + 1);
  for (let i = 0; i < r.value.length; i++) {
    const v = r.value[i];
    const f = src[r.offsets[i]];
    const ok =
      v === f || (/[ \n]/.test(v) && /[\r\n]/.test(f)) || f === '\\' || (v === "'" && f === "'");
    if (!ok)
      throw Error(
        `${r.pointer}[${i}]: value ${JSON.stringify(v)} maps to ${JSON.stringify(f)} at ${r.offsets[i]}`,
      );
  }
  for (let i = 1; i < r.value.length; i++)
    expect(r.offsets[i]).toBeGreaterThanOrEqual(r.offsets[i - 1]);
}
const one = (src: string, name = 'm.yaml') => {
  const rs = sqlRegions(src, name);
  for (const r of rs) mapsBack(src, r);
  return rs;
};
const metric = (scalar: string, dialect = 'ANSI_SQL') =>
  `name: m\ndatasets: []\nmetrics:\n  - name: x\n    expression:\n      dialects:\n        - dialect: ${dialect}\n          expression: ${scalar}\n`;
test('Ossie locations: dataset fields and metrics, flat, legacy semantic_model list and embedded in ontology_mappings', () => {
  expect(one(fixture('case-when.ossie.yaml')).map(shape)).toEqual([
    '/datasets/*/fields/*/expression/dialects/*/expression',
    '/datasets/*/fields/*/expression/dialects/*/expression',
    '/metrics/*/expression/dialects/*/expression',
  ]);
  const legacy =
    'semantic_model:\n  - name: s\n    datasets:\n      - name: d\n        fields:\n          - name: f\n            expression: {dialects: [{dialect: ANSI_SQL, expression: d.f}]}\n    metrics:\n      - name: m\n        expression: {dialects: [{dialect: ANSI_SQL, expression: SUM(d.f)}]}\n';
  expect(one(legacy).map(r => r.pointer)).toEqual([
    '/semantic_model/0/datasets/0/fields/0/expression/dialects/0/expression',
    '/semantic_model/0/metrics/0/expression/dialects/0/expression',
  ]);
  const flights = readFileSync('public/examples/ossie/flights.yaml', 'utf8');
  const rs = one(flights, 'flights.yaml');
  expect(
    rs.some(
      r =>
        shape(r) ===
        '/ontology_mappings/*/semantic_model/datasets/*/fields/*/expression/dialects/*/expression',
    ),
  ).toBe(true);
  expect(rs.some(r => shape(r).startsWith('/ontology_mappings/*/concept_mappings/'))).toBe(true);
});
test('Ossie mapping locations: object, referent and link mapping expressions at any depth under concept_mappings', () => {
  const rs = one(
    readFileSync('public/examples/ossie/flights.mapping.yaml', 'utf8'),
    'flights.mapping.yaml',
  ).map(shape);
  for (const p of [
    '/concept_mappings/*/object_mappings/*/referent_mappings/*/expression',
    '/concept_mappings/*/link_mappings/*/object_mapping/referent_mappings/*/expression',
    '/concept_mappings/*/link_mappings/*/children/*/object_mapping/referent_mappings/*/expression',
  ])
    expect(rs).toContain(p);
  const mall = one(
    readFileSync('public/examples/mall/mall.mapping.yaml', 'utf8'),
    'mall.mapping.yaml',
  ).map(shape);
  expect(mall).toContain('/concept_mappings/*/object_mappings/*/expression');
  // Other keys named expression are not SQL regions.
  expect(one('concepts:\n  - name: a\n    expression: not sql\n')).toEqual([]);
});
test('ODCS locations: quality query only when type is sql (schema, property and nested properties), transformLogic; dialect from servers[].type', () => {
  const rs = one(fixture('quality.odcs.yaml'), 'quality.odcs.yaml');
  expect(rs.map(r => r.pointer)).toEqual([
    '/schema/0/properties/0/quality/0/query',
    '/schema/0/properties/1/transformLogic',
    '/schema/0/quality/0/query',
  ]);
  expect(
    rs.every(r => r.kind === 'statement' && r.dialect === 'postgres' && r.grammar === 'postgresql'),
  ).toBe(true);
  const nested = `apiVersion: v3.1.0\nkind: DataContract\nid: x\nversion: 1.0.0\nstatus: active\nservers:\n  - server: s\n    type: snowflake\nquality:\n  - type: sql\n    query: SELECT 1\n  - type: library\n    query: not sql\nschema:\n  - name: t\n    properties:\n      - name: a\n        logicalType: object\n        properties:\n          - name: b\n            quality:\n              - type: SQL\n                query: SELECT COUNT(*) FROM t\n      - name: c\n        logicalType: array\n        items:\n          properties:\n            - name: d\n              transformLogic: SELECT d FROM t\n`;
  const n = one(nested, 'c.odcs.yaml');
  expect(n.map(r => r.pointer)).toEqual([
    '/quality/0/query',
    '/schema/0/properties/0/properties/0/quality/0/query',
    '/schema/0/properties/1/items/properties/0/transformLogic',
  ]);
  expect(n.every(r => r.grammar === 'snowflake')).toBe(true);
  expect(
    one(nested.replace('    type: snowflake\n', ''), 'c.odcs.yaml').every(
      r => r.grammar === 'postgresql',
    ),
  ).toBe(true);
});
test('dialects: sibling dialect; ANSI and none → PostgreSQL grammar; Snowflake, BigQuery, Databricks; non-SQL dialects not checked', () => {
  expect(grammarOf('ANSI_SQL')).toBe('postgresql');
  expect(grammarOf('OSSIE_SQL_2026')).toBe('postgresql');
  expect(grammarOf(null)).toBe('postgresql');
  expect(grammarOf('SNOWFLAKE')).toBe('snowflake');
  expect(grammarOf('BIGQUERY')).toBe('bigquery');
  expect(grammarOf('DATABRICKS')).toBe('hive');
  for (const d of ['MDX', 'DAX', 'MAQL', 'TABLEAU', 'SIGMA', 'THOUGHTSPOT', 'HOLISTICS_AQL'])
    expect(grammarOf(d)).toBeNull();
  for (const [t, g] of [
    ['postgres', 'postgresql'],
    ['mysql', 'mysql'],
    ['sqlserver', 'transactsql'],
    ['trino', 'trino'],
    ['redshift', 'redshift'],
    ['athena', 'athena'],
    ['db2', 'db2'],
    ['databricks', 'hive'],
    ['unknown', 'postgresql'],
  ])
    expect(grammarOf(t, true)).toBe(g);
  const dax = one(fixture('dax.ossie.yaml'));
  expect(dax.map(r => [r.dialect, r.grammar])).toEqual([
    ['ANSI_SQL', 'postgresql'],
    ['DAX', null],
    ['ANSI_SQL', 'postgresql'],
  ]);
});
test('block literal: indentation removed per line, breaks map to line breaks; chomping and indentation indicators', () => {
  for (const header of ['|', '|-', '|+', '|2', '|-1', '|1+']) {
    const src = metric(`${header}\n            SUM(a)\n\n              / NULLIF(SUM(b), 0)\n\n`);
    const [r] = one(src);
    expect(r.value.startsWith(header.includes('1') ? ' SUM(a)' : 'SUM(a)')).toBe(true);
  }
  const [r] = one(metric('|\n            SUM(CASE\n              WHEN x THEN 1 END)\n'));
  const at = r.value.indexOf('WHEN');
  expect(
    lineColumn(
      metric('|\n            SUM(CASE\n              WHEN x THEN 1 END)\n'),
      r.offsets[at],
    ),
  ).toEqual({ line: 10, column: 15 });
});
test('block folded: single breaks fold to spaces mapped to the break; empty and more-indented lines keep breaks', () => {
  const src = fixture('folded.ossie.yaml');
  const [, r] = one(src);
  expect(r.value).toBe(
    'SUM(CASE WHEN orders.amount > 100\n  THEN orders.amount\n  ELSE 0 END END)\n',
  );
  const plain = metric('>-\n            SUM(a)\n            + SUM(b)\n\n            + SUM(c)\n');
  const [f] = one(plain);
  expect(f.value).toBe('SUM(a) + SUM(b)\n+ SUM(c)');
  expect(plain[f.offsets[f.value.indexOf(' + SUM(b)')]]).toBe('\n');
});
test('plain, single- and double-quoted scalars, single and multi-line', () => {
  const [p] = one(metric('SUM(a)\n            + SUM(b)'));
  expect(p.value).toBe('SUM(a) + SUM(b)');
  const [s] = one(metric("'CASE WHEN x = ''a'' THEN 1 END'"));
  expect(s.value).toBe("CASE WHEN x = 'a' THEN 1 END");
  const [s2] = one(metric("'SUM(a)\n            + SUM(b)'"));
  expect(s2.value).toBe('SUM(a) + SUM(b)');
  const [d] = one(
    metric('"CASE WHEN x = \\"a\\" AND y = \'\\\\\' THEN \\u00e9 \\x41 \\U0001F600 END\\t"'),
  );
  expect(d.value).toBe('CASE WHEN x = "a" AND y = \'\\\' THEN é A 😀 END\t');
  const [d2] = one(metric('"SUM(a) \\\n            + SUM(b)\n\n            + 1"'));
  expect(d2.value).toBe('SUM(a) + SUM(b)\n+ 1');
});
test('JSON strings with escapes, flow YAML and multi-document YAML', () => {
  const src = fixture('escaped.semantic.json');
  const rs = one(src, 'escaped.semantic.json');
  expect(rs).toHaveLength(3);
  expect(rs[2].value).toBe('SUM(CASE WHEN status = "open" THEN 1 "x" END)');
  const at = rs[2].value.indexOf('"x"');
  expect(src[rs[2].offsets[at]]).toBe('\\');
  expect(lineColumn(src, rs[2].offsets[at])).toEqual({ line: 15, column: 143 });
  const json = JSON.stringify({
    name: 'j',
    datasets: [],
    metrics: [
      { name: 'a', expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'SUM(é) /\n2' }] } },
    ],
  }).replace('é', '\\u00e9');
  expect(one(json, 'j.json')[0].value).toBe('SUM(é) /\n2');
  const flow =
    'name: f\ndatasets: []\nmetrics: [{name: a, expression: {dialects: [{dialect: BIGQUERY, expression: "SUM(x)"}]}}]\n';
  const [fr] = one(flow);
  expect([fr.value, fr.grammar]).toEqual(['SUM(x)', 'bigquery']);
  const multi = metric('SUM(a)') + '---\n' + metric('SUM(b)', 'SNOWFLAKE');
  expect(one(multi).map(r => [r.value, r.grammar])).toEqual([
    ['SUM(a)', 'postgresql'],
    ['SUM(b)', 'snowflake'],
  ]);
});
test('every shipped example maps every SQL region exactly', () => {
  const { readdirSync } = require('node:fs');
  let n = 0;
  for (const f of readdirSync('public/examples', { recursive: true })
    .map(String)
    .filter((f: string) => /\.(ya?ml|json)$/.test(f))) {
    const src = readFileSync('public/examples/' + f, 'utf8');
    n += one(src, f).length;
  }
  expect(n).toBeGreaterThan(1000);
});
