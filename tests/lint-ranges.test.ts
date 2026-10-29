// Tests mapping findings to source ranges and document-level fallbacks.
import { test, expect } from 'bun:test';
import { Text } from '@codemirror/state';
import { issueRange, summarizeDiagnostics, toDiagnostics } from '../src/app/editor/lint';
import { validateInput } from '../src/shared/validation/input';

const doc = (s: string) => Text.of(s.split('\n'));
test('a finding with line and column covers the token there', () => {
  const d = doc('name: x\nontology:\n  - concept: Customer\n    extends: [Missing]');
  expect(issueRange({ severity: 'error', code: 'reference', path: '/', message: '', line: 4, column: 14 }, d)).toEqual({ from: d.line(4).from + 13, to: d.line(4).from + 22 });
  expect(issueRange({ severity: 'error', code: 'x', path: '/', message: '', line: 2 }, d)).toEqual({
    from: d.line(2).from,
    to: d.line(2).from + 9,
  });
});
test('blank lines, columns past the end and lines past the document are clamped or fall back', () => {
  const d = doc('a: 1\n\nb: 2');
  expect(issueRange({ severity: 'error', code: 'x', path: '/', message: '', line: 2, column: 5 }, d)).toEqual({ from: d.line(2).from, to: d.line(2).from });
  expect(issueRange({ severity: 'error', code: 'x', path: '/', message: '', line: 1, column: 99 }, d)).toEqual({ from: 4, to: 4 });
  expect(issueRange({ severity: 'error', code: 'x', path: '/', message: '', line: 9 }, d)).toBe(null);
  expect(issueRange({ severity: 'error', code: 'x', path: '/', message: '' }, d)).toBe(null);
});
test('real findings: located ones become diagnostics, unlocated ones stay document-level', () => {
  const source = 'name: Shop\nontology:\n  - concept: Customer\n    type: EntityType\n    extends: [Missing]\n';
  const { issues } = validateInput(source, 'shop.yaml');
  expect(issues.length).toBeGreaterThan(0);
  const { diagnostics, documentLevel } = toDiagnostics([...issues, { severity: 'warning', code: 'doc', path: '/', message: 'whole file' }], doc(source));
  expect(diagnostics.length).toBe(issues.filter(i => i.line).length);
  expect(documentLevel.map(i => i.code)).toContain('doc');
  const d = diagnostics.find(x => x.severity === 'error')!;
  expect(d.message.length).toBeGreaterThan(0);
  expect(source.slice(d.from, d.to).length).toBeGreaterThan(0);
});
test('the status bar names the first error, else the first finding, with a count', () => {
  const d = doc('a: 1\nb: 2\nc: 3');
  const warning = { from: d.line(1).from, to: 1, severity: 'warning' as const, message: 'soft' };
  const error = {
    from: d.line(3).from,
    to: d.line(3).to,
    severity: 'error' as const,
    message: 'hard',
  };
  expect(summarizeDiagnostics([], d)).toBe(null);
  expect(summarizeDiagnostics([warning], d)).toEqual({
    count: 1,
    line: 1,
    severity: 'warning',
    message: 'soft',
  });
  expect(summarizeDiagnostics([error, warning], d)).toEqual({
    count: 2,
    line: 3,
    severity: 'error',
    message: 'hard',
  });
});
