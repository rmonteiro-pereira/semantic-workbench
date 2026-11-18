// Panel presentation preserves text and the ordinary save contract.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageBlock } from '../../src/app/agent/MessageBlock';
import { TaskList } from '../../src/app/agent/TaskList';

test('messages and task entries retain long text and escape markup', () => {
  const text = '<script>alert(1)</script>' + 'x'.repeat(1_000_000);
  const html = renderToStaticMarkup(<MessageBlock role="agent" text={text} done={true} />);
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('x'.repeat(1_000_000));
  const tasks = renderToStaticMarkup(<TaskList entries={[{ content: 'p'.repeat(5000), status: 'in_progress', priority: 'medium' }]} />);
  expect(tasks).toContain('The agent&#x27;s task list');
  expect(tasks).toContain('p'.repeat(5000));
});
