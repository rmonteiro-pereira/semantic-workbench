import { describe, expect, test } from 'bun:test';
import { waitForApi, type ReadinessProbe } from '../scripts/api-readiness';

/** A probe on a fake clock whose fetch answers from a scripted list of outcomes. */
function scriptedProbe(outcomes: Array<'refused' | number>, overrides: Partial<ReadinessProbe> = {}) {
  let clock = 0;
  const requested: string[] = [];
  const probe: ReadinessProbe = {
    url: 'http://127.0.0.1:4310/readyz',
    timeoutMs: 1_000,
    intervalMs: 100,
    isApiRunning: () => true,
    fetch: async url => {
      requested.push(url);
      const outcome = outcomes.shift() ?? 'refused';
      if (outcome === 'refused') throw new Error('connect ECONNREFUSED 127.0.0.1:4310');
      return new Response(null, { status: outcome });
    },
    sleep: async milliseconds => {
      clock += milliseconds;
    },
    now: () => clock,
    ...overrides,
  };
  return { probe, requested };
}

describe('waiting for the development API', () => {
  test('keeps polling through refused connections and 503 until the API answers 200', async () => {
    const { probe, requested } = scriptedProbe(['refused', 'refused', 503, 200]);

    expect(await waitForApi(probe)).toBe('ready');
    expect(requested).toHaveLength(4);
    expect(requested.every(url => url === 'http://127.0.0.1:4310/readyz')).toBe(true);
  });

  test('stops as soon as the API process has exited', async () => {
    const { probe, requested } = scriptedProbe([200], { isApiRunning: () => false });

    expect(await waitForApi(probe)).toBe('api-exited');
    expect(requested).toHaveLength(0);
  });

  test('gives up once the timeout has passed', async () => {
    const { probe, requested } = scriptedProbe([]);

    expect(await waitForApi(probe)).toBe('timed-out');
    expect(requested.length).toBe(11);
  });

  test('a server that accepts but never answers does not stall the wait', async () => {
    const hanging = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Promise(() => {}),
    });
    try {
      const started = Date.now();
      const result = await waitForApi({
        url: `http://127.0.0.1:${hanging.port}/readyz`,
        timeoutMs: 300,
        intervalMs: 20,
        isApiRunning: () => true,
      });

      expect(result).toBe('timed-out');
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally {
      hanging.stop(true);
    }
  });
});
