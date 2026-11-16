/** Keeps parser locations readable without exposing the parser's raw caret decoration. */
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ValidationPanel } from '../src/app/validation/ValidationPanel';

test('validation details retain the parser explanation and location without the raw caret line', () => {
  const html = renderToStaticMarkup(<ValidationPanel issues={[{ severity: 'error', code: 'syntax', path: '/', line: 1, column: 7, message: 'Missing closing bracket\nname: [\n      ^\n' }]} />);
  expect(html).toContain('Missing closing bracket');
  expect(html).toContain('Line 1, column 7');
  expect(html).not.toContain('^');
});
