// Panel presentation preserves text and the ordinary save contract.
import { expect, test, spyOn } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { startPanelSession } from '../../src/app/agent/agent-api';
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

test('connection instructions require a complete supported success and write intent', async () => {
  const fetch = spyOn(globalThis, 'fetch');
  const instructions = { id: 'session', code: 'code', command: 'relay command', statement: 'Disclosure', scopes: ['Read files'], notOffered: 'No terminal', expiresAt: 1000 };
  try {
    fetch.mockResolvedValue(Response.json(instructions, { status: 201 }));
    expect(await startPanelSession(true)).toEqual(instructions);
    const options = fetch.mock.calls[0][1]!;
    expect(new Headers(options.headers).get('X-SW-Request')).toBe('1');
    expect(JSON.parse(options.body as string)).toEqual({ confirmReplace: true });
    for (const body of [null, { ...instructions, id: '' }, { ...instructions, scopes: [false] }, { ...instructions, expiresAt: '1000' }, { ...instructions, code: undefined }]) {
      fetch.mockResolvedValue(Response.json(body, { status: 201 }));
      await expect(startPanelSession(false)).rejects.toThrow('incomplete connection instructions');
    }
    fetch.mockResolvedValue(Response.json(instructions, { status: 200 }));
    await expect(startPanelSession(false)).rejects.toThrow('unsupported panel response');
  } finally {
    fetch.mockRestore();
  }
});
