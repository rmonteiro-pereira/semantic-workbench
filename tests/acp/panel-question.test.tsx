// Panel presentation preserves text and the ordinary save contract.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuestionCard } from '../../src/app/agent/QuestionCard';

test('questions preserve all eight long choices as plain text', () => {
  const options = Array.from({ length: 8 }, (_, index) => ({ id: String(index), label: '<img src=x>' + 'x'.repeat(5000) }));
  const html = renderToStaticMarkup(<QuestionCard question={{ id: 'q', text: 'Permission?', options }} busy={false} answer={() => {}} />);
  expect(html.match(/&lt;img src=x&gt;/g)?.length).toBe(8);
  expect(html).toContain('role="alert"');
  expect(html).toContain('Cancel question');
  expect(html).not.toContain('<img');
});
