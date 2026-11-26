// Checks the editor's lint source shows a finding that only the 0.3 draft schema gives, at the line of the offending key, and not for the same text declared 0.2.
import { beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Text } from '@codemirror/state';
import { toDiagnostics } from '../src/app/editor/lint';
import { loadDraftValidators } from '../src/shared/validation/draft-validators';
import { validateInput } from '../src/shared/validation/input';

const fixture = readFileSync(join(import.meta.dir, 'fixtures/ossie-0.3/sales.semantic.yaml'), 'utf8');

beforeAll(async () => {
  await loadDraftValidators();
});

test('a 0.2 extension list in a 0.3 file is an editor error where that list starts', () => {
  const source = fixture.replace('    nonportable_extensions:\n', '    custom_extensions:\n');
  const doc = Text.of(source.split('\n'));
  const { diagnostics } = toDiagnostics(validateInput(source, 'sales.semantic.yaml').issues, doc);
  const listLine = source.split('\n').findIndex(line => line.trim() === 'custom_extensions:') + 1;
  // The schema places the finding on the list's value, which starts on the line after its key.
  const atList = diagnostics.filter(diagnostic => diagnostic.severity === 'error' && [listLine, listLine + 1].includes(doc.lineAt(diagnostic.from).number));
  expect(atList.length).toBeGreaterThan(0);
});

test('the same 0.3 forms declared as 0.2 get the 0.2 schema findings instead, and the 0.3 fixture has none', () => {
  expect(validateInput(fixture, 'sales.semantic.yaml').issues).toEqual([]);
  const asOld = fixture.replace('version: 0.3.0.dev0', 'version: 0.2.0.dev0');
  expect(validateInput(asOld, 'sales.semantic.yaml').issues.some(issue => issue.code === 'schema')).toBe(true);
});
