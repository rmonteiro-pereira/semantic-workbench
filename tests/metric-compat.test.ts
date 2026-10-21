// Tests compatibility of stored metric attributes and byte-preserving edits.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { validateInput } from '../src/input';
import { valuePatches, edit } from '../src/edit/yaml-patch';
import { extensionOf } from '../src/edit/item-model';
import { readKpiBindings } from '../src/metrics/extension';
// Stored metric attributes remain valid and byte-exact. UI vocabulary changes must not rename
// stored keys such as `kpi_bindings` or schema identifiers.
const files = ['mall/mall.semantic.yaml', 'mall/mall.mapping.yaml'].map(p => ({
  path: p,
  source: readFileSync(`public/examples/${p}`, 'utf8'),
}));
const errors = (source: string, name: string) =>
  validateInput(source, name).issues.filter(i => i.severity === 'error');
test('every legacy example with metric attributes validates as shipped', () => {
  for (const f of files) expect(errors(f.source, f.path.split('/')[1])).toEqual([]);
  const mapping = parse(files[1].source);
  expect(readKpiBindings(mapping).value.length).toBe(25);
  expect(files[1].source).toContain('"kpi_bindings"');
});
test('editing one metric attribute changes only that metric extension block; everything else keeps its bytes', () => {
  const f = files[0];
  const data = parse(f.source);
  const i = data.metrics.findIndex((m: any) => extensionOf(m));
  const ext = extensionOf(data.metrics[i])!;
  const next = JSON.stringify({ ...ext.value, owner: 'Centre management' }, null, 2) + '\n';
  const after = edit(f.source, t =>
    valuePatches(
      t,
      ['metrics', i, 'custom_extensions', ext.index, 'data'],
      next,
      'mall.semantic.yaml',
    ),
  );
  expect(errors(after, 'mall.semantic.yaml')).toEqual([]);
  expect(extensionOf(parse(after).metrics[i])!.value.owner).toBe('Centre management');
  const a = f.source.split('\n');
  const b = after.split('\n');
  let p = 0;
  while (a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  // The change is inside that one block scalar.
  const changed = b.slice(p, b.length - s).join('\n');
  expect(changed).toContain('Centre management');
  expect(a.length - p - s).toBeLessThanOrEqual(3);
  // The mapping, with its kpi_bindings key, is untouched by a metric edit and still reads the same
  // bindings.
  expect(readKpiBindings(parse(files[1].source)).value.map(b => b.metric)).toContain(
    data.metrics[i].name,
  );
});
test('a binding edit keeps the stored key kpi_bindings', () => {
  const f = files[1];
  const data = parse(f.source);
  const ext = extensionOf(data)!;
  const value = {
    ...ext.value,
    kpi_bindings: ext.value.kpi_bindings.map((b: any, j: number) =>
      j === 0 ? { ...b, of: 'Unit' } : b,
    ),
  };
  const after = edit(f.source, t =>
    valuePatches(
      t,
      ['custom_extensions', ext.index, 'data'],
      JSON.stringify(value, null, 2) + '\n',
      'mall.mapping.yaml',
    ),
  );
  expect(after).toContain('"kpi_bindings"');
  expect(after).not.toContain('"metric_bindings"');
  expect(readKpiBindings(parse(after)).value[0].of).toBe('Unit');
});
