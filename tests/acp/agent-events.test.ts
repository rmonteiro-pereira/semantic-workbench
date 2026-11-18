// Browser state remains ordered across replay, cancellation and loss of server memory.
import { expect, test } from 'bun:test';
import { emptyAgentView, reduceAgentEvent, streamEndReason } from '../../src/app/agent/agent-events';

test('streamed messages grow once across reconnect and mark late output after cancel', () => {
  let view = emptyAgentView();
  const first = { seq: 1, type: 'message', id: 'm', role: 'agent', text: 'hello', done: false } as const;
  view = reduceAgentEvent(view, first);
  expect(reduceAgentEvent(view, first)).toBe(view);
  view = reduceAgentEvent(view, { ...first, seq: 2, text: ' world', done: true });
  expect(view.entries[0].event).toMatchObject({ text: 'hello world', done: true });
  view = reduceAgentEvent(view, { seq: 3, type: 'turn', phase: 'cancelled' });
  view = reduceAgentEvent(view, { ...first, id: 'late', seq: 4 });
  expect(view.entries[1].afterCancel).toBe(true);
  view = reduceAgentEvent(view, { seq: 5, type: 'notice', text: 'Earlier messages are not kept.' });
  expect(view.entries.at(-1)?.event).toMatchObject({ text: 'Earlier messages are not kept.' });
});

test('a known session missing on the server ends without resuming it', () => {
  expect(streamEndReason(404)).toBe('server-restarted');
  expect(streamEndReason(503)).toBeUndefined();
  const view = reduceAgentEvent(emptyAgentView(), { seq: 1, type: 'ended', reason: streamEndReason(404)! });
  expect(view.state).toBe('ended');
  expect(view.reason).toBe('server-restarted');
  expect(view.questions).toEqual([]);
});
