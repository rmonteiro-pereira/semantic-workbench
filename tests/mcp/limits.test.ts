// The call limits stop a burst, a pile of concurrent calls and a slow call, using an injected clock.
import { expect, test } from 'bun:test';
import { createCallLimits, withDeadline } from '../../src/server/mcp/call-limits';

test('a burst is spent, then calls are admitted again as time passes', () => {
  let now = 0;
  const limits = createCallLimits({ callsPerSecond: 2, burst: 3, concurrent: 10, deadlineMs: 1000 }, () => now);
  for (let call = 0; call < 3; call++) {
    const admission = limits.admit();
    expect(admission.ok).toBe(true);
    if (admission.ok) admission.permit.release();
  }
  const refused = limits.admit();
  expect(refused).toMatchObject({ ok: false, reason: 'rate' });
  now += 1000;
  expect(limits.admit().ok).toBe(true);
});

test('concurrent calls are capped and a released permit frees a slot once', () => {
  const limits = createCallLimits({ callsPerSecond: 100, burst: 100, concurrent: 2, deadlineMs: 1000 }, () => 0);
  const first = limits.admit();
  const second = limits.admit();
  expect(limits.admit()).toMatchObject({ ok: false, reason: 'concurrency' });
  if (first.ok) {
    first.permit.release();
    first.permit.release();
  }
  expect(limits.admit().ok).toBe(true);
  expect(limits.admit().ok).toBe(false);
  expect(second.ok).toBe(true);
});

test('a call that outlives its deadline is reported and told to stop', async () => {
  let stopped = false;
  const outcome = await withDeadline(20, signal => new Promise<string>(resolve => signal.addEventListener('abort', () => ((stopped = true), resolve('late')))));
  expect(outcome.finished).toBe(false);
  expect(stopped).toBe(true);
  expect((await withDeadline(500, async () => 'fast')).finished).toBe(true);
});
