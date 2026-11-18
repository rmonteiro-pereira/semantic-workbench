// Panel presentation preserves text and the ordinary save contract.
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConnectStep } from '../../src/app/agent/ConnectStep';
import { WaitingStep } from '../../src/app/agent/WaitingStep';
import { SessionNotice } from '../../src/app/agent/SessionNotice';

test('connection, waiting, error and ended states explain the next action', () => {
  const connect = renderToStaticMarkup(<ConnectStep busy={true} replace={false} error="Try again" start={() => {}} close={() => {}} />);
  expect(connect).toContain('does not call a language model');
  expect(connect).toContain('Preparing the connection');
  expect(connect).toContain('role="alert"');
  expect(renderToStaticMarkup(<WaitingStep />)).toContain('Waiting for your agent');
  expect(renderToStaticMarkup(<SessionNotice reason="server-restarted" />)).toContain('Start a new session');
});
