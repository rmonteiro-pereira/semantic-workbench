// Every Admin area says the same thing while loading and when loading failed, with a retry.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionStatus } from '../src/app/admin/SectionStatus';
import { problemText } from '../src/app/admin/api';

test('loading names what is loading, without an ellipsis', () => {
  const html = renderToStaticMarkup(<SectionStatus subject="access grants" loading error="" />);
  expect(html).toContain('role="status"');
  expect(html).toContain('Loading access grants');
  expect(html).not.toContain('…');
});

test('a failure names what could not load, gives the reason and offers Try again', () => {
  const html = renderToStaticMarkup(<SectionStatus subject="project remotes" loading={false} error="The server did not answer." onRetry={() => {}} />);
  expect(html).toContain('role="alert"');
  expect(html).toContain('Could not load project remotes. The server did not answer.');
  expect(html).toContain('>Try again</button>');
});

test('nothing is shown once the data has arrived', () => {
  expect(renderToStaticMarkup(<SectionStatus subject="roles" loading={false} error="" />)).toBe('');
});

test('a request that never reached the server reads as plain words, not the browser message', () => {
  expect(problemText(new TypeError('Failed to fetch'))).toBe('The server did not answer. Check that it is running and that this computer is online.');
  expect(problemText(new TypeError('Load failed'))).toStartWith('The server did not answer.');
  // Other programming errors keep their own message, so a bug is not disguised as a network problem.
  expect(problemText(new TypeError('x is not a function'))).toBe('x is not a function');
});
