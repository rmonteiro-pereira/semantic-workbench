// Keeps checked-in validators reproducible and equivalent to the pinned schema compiler.
import { expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { compileSchemas } from '../scripts/compile-schemas';
import semanticSchema from '../schemas/ossie-0.2.0.dev0.json';
import metricSchema from '../schemas/semantic-workbench-metric-v1.json';
import mappingSchema from '../schemas/semantic-workbench-mapping-v1.json';
import { mapping, metric, semantic } from '../src/generated/validators.js';

test('regeneration is byte-identical to the checked-in validators', () => {
  const root = mkdtempSync(join(tmpdir(), 'workbench-schemas-'));
  try {
    compileSchemas(root);
    const existing = 'src/generated';
    expect(readdirSync(root).sort()).toEqual(readdirSync(existing).sort());
    for (const name of readdirSync(root)) {
      expect(readFileSync(`${root}/${name}`, 'utf8')).toBe(readFileSync(`${existing}/${name}`, 'utf8'));
    }
    const generated = readFileSync(join(root, 'validators.js'), 'utf8');
    expect(generated).toContain('const odcsContractSchema =');
    expect(generated).not.toMatch(/\bschema\d+\b/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const [name, schema, precompiled, valid] of [
  [
    'semantic',
    semanticSchema,
    semantic,
    {
      name: 'Sales',
      version: '0.2.0.dev0',
      datasets: [
        {
          name: 'orders',
          source: 'db.orders',
          fields: [
            {
              name: 'id',
              expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'id' }] },
            },
          ],
        },
      ],
    },
  ],
  ['metric', metricSchema, metric, { schema: 'semantic-workbench/metric/v1', type: 'simple' }],
  ['mapping', mappingSchema, mapping, { schema: 'semantic-workbench/mapping/v1', kpi_bindings: [] }],
] as const) {
  test(`${name} standalone validation preserves acceptance and error details`, () => {
    const compiler = new Ajv2020({ strict: false, allErrors: true });
    addFormats(compiler);
    const original = compiler.compile(schema);
    expect(precompiled(valid)).toBe(true);
    expect(precompiled({})).toBe(false);
    for (const document of [valid, {}, { ...valid, schema: 'invalid', extra: true }]) {
      expect(precompiled(document)).toBe(original(document));
      expect(precompiled.errors).toEqual(original.errors);
    }
  });
}
