// Tests which requests are counted and that counting never changes a request.
import { afterEach, describe, expect, test } from 'bun:test';
import { measureTotal } from '../../src/server/usage/usage-counts';
import { MAX_COUNTED_RESPONSE_BYTES, NO_USAGE_RECORDER, createUsageRecorder, rulesForRequest } from '../../src/server/usage/usage-recorder';
import { contextRequest, openUsage, planRequest, publishedJson } from './usage-fixture';

const disposers: (() => void)[] = [];
afterEach(() => {
  while (disposers.length) disposers.pop()!();
});

async function usage() {
  const opened = await openUsage();
  disposers.push(opened.dispose);
  return opened;
}

const metric = 'sw1:shop/commerce.mapped-semantic.yaml#model:Mapped%20commerce%20semantic%20model/metric:gross_revenue';
function countOf(fixture: Awaited<ReturnType<typeof usage>>, address: string) {
  const days = fixture.recorder.pending('shop');
  return days.reduce((sum, day) => sum + (day.counts[address] ? measureTotal(day.counts[address], 'workbench-requests') : 0), 0);
}

describe('what is counted', () => {
  test('a successful context request counts each item it names once', async () => {
    const fixture = await usage();
    fixture.recorder.record(contextRequest(fixture.documents));
    await fixture.recorder.settled();
    expect(countOf(fixture, metric)).toBe(1);
    const day = fixture.recorder.pending('shop')[0];
    expect(day.day).toBe('2026-11-17');
    expect(day.counts[metric]['workbench-requests']['agent.context.read']).toEqual({ http: 1 });
  });

  test('a plan request counts under its own operation and origin', async () => {
    const fixture = await usage();
    fixture.recorder.record(planRequest(fixture.documents, { origin: 'mcp' }));
    await fixture.recorder.settled();
    expect(fixture.recorder.pending('shop')[0].counts[metric]['workbench-requests']['agent.plan']).toEqual({ mcp: 1 });
  });

  test('refused, missing and failed requests count nothing', async () => {
    const fixture = await usage();
    for (const status of [400, 403, 404, 500]) {
      fixture.recorder.record(contextRequest(fixture.documents, { response: publishedJson({ error: 'no' }, { status }) }));
    }
    await fixture.recorder.settled();
    expect(fixture.recorder.pending('shop')).toEqual([]);
  });

  test('a browser request counts nothing', async () => {
    const fixture = await usage();
    fixture.recorder.record(contextRequest(fixture.documents, { surface: 'browser' }));
    await fixture.recorder.settled();
    expect(fixture.recorder.pending('shop')).toEqual([]);
  });

  test('an answer that is not from a published snapshot counts nothing', async () => {
    const fixture = await usage();
    const answer = await contextRequest(fixture.documents).response.json();
    fixture.recorder.record(contextRequest(fixture.documents, { response: Response.json(answer) }));
    await fixture.recorder.settled();
    expect(fixture.recorder.pending('shop')).toEqual([]);
  });

  test('an outcome that is not ok or degraded, an unknown operation or an unknown origin counts nothing', async () => {
    const fixture = await usage();
    fixture.recorder.record(contextRequest(fixture.documents, { outcome: 'failed' }));
    fixture.recorder.record(contextRequest(fixture.documents, { outcome: 'refused' }));
    fixture.recorder.record(contextRequest(fixture.documents, { operationId: 'agent.catalog.read' }));
    fixture.recorder.record(contextRequest(fixture.documents, { origin: 'carrier-pigeon' }));
    await fixture.recorder.settled();
    expect(fixture.recorder.pending('shop')).toEqual([]);
  });

  test('a degraded outcome counts', async () => {
    const fixture = await usage();
    fixture.recorder.record(contextRequest(fixture.documents, { outcome: 'degraded' }));
    await fixture.recorder.settled();
    expect(countOf(fixture, metric)).toBe(1);
  });

  test('an item the answer names twice is counted once', async () => {
    const fixture = await usage();
    const body = await contextRequest(fixture.documents).response.json();
    body.metrics.push(body.metrics[0], body.metrics[0]);
    fixture.recorder.record(contextRequest(fixture.documents, { response: publishedJson(body) }));
    await fixture.recorder.settled();
    expect(countOf(fixture, metric)).toBe(1);
  });

  test('an answer larger than the bound is not parsed', async () => {
    const fixture = await usage();
    const large = new Response('x'.repeat(MAX_COUNTED_RESPONSE_BYTES + 1), { headers: { 'X-Workbench-Snapshot': 'a'.repeat(40) } });
    fixture.recorder.record(contextRequest(fixture.documents, { response: large }));
    await fixture.recorder.settled();
    expect(fixture.recorder.pending('shop')).toEqual([]);
    expect(fixture.warnings).toEqual([]);
  });

  test('1,000 parallel requests add exactly 1,000 counts', async () => {
    const fixture = await usage();
    const body = await contextRequest(fixture.documents).response.json();
    await Promise.all(Array.from({ length: 1000 }, async () => fixture.recorder.record(contextRequest(fixture.documents, { response: publishedJson(body) }))));
    await fixture.recorder.settled();
    expect(countOf(fixture, metric)).toBe(1000);
  });

  test('the day of a count is the UTC day at the moment it is counted', async () => {
    const fixture = await usage();
    fixture.clock.set('2026-11-17T23:59:59.000Z');
    fixture.recorder.record(contextRequest(fixture.documents));
    await fixture.recorder.settled();
    fixture.clock.set('2026-11-18T00:00:01.000Z');
    fixture.recorder.record(contextRequest(fixture.documents));
    await fixture.recorder.settled();
    expect(fixture.recorder.pending('shop').map(day => day.day)).toEqual(['2026-11-17', '2026-11-18']);
    fixture.clock.set('2026-11-16T12:00:00.000Z');
    fixture.recorder.record(contextRequest(fixture.documents));
    await fixture.recorder.settled();
    expect(
      fixture.recorder
        .pending('shop')
        .map(day => day.day)
        .sort(),
    ).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
  });
});

describe('what counting never does', () => {
  test('leaves the caller free to read the answer it was given', async () => {
    const fixture = await usage();
    const input = contextRequest(fixture.documents);
    const expected = await input.response.clone().text();
    fixture.recorder.record(input);
    expect(await input.response.text()).toBe(expected);
    await fixture.recorder.settled();
  });

  test('does not throw for a response whose body was already read', async () => {
    const fixture = await usage();
    const input = contextRequest(fixture.documents);
    await input.response.text();
    expect(() => fixture.recorder.record(input)).not.toThrow();
    await fixture.recorder.settled();
    expect(fixture.recorder.pending('shop')).toEqual([]);
  });

  test('a failing disk keeps the counts, warns once and does not stop counting', async () => {
    const fixture = await usage();
    fixture.store.writeDay = () => {
      throw new Error('disk full');
    };
    fixture.recorder.record(contextRequest(fixture.documents));
    await fixture.recorder.settled();
    fixture.recorder.flush();
    fixture.recorder.flush();
    expect(fixture.warnings.filter(entry => entry.event === 'usage.flush-failed')).toHaveLength(1);
    fixture.recorder.record(contextRequest(fixture.documents));
    await fixture.recorder.settled();
    expect(countOf(fixture, metric)).toBe(2);
  });

  test('a snapshot that cannot be read counts nothing and says nothing about its content', async () => {
    const opened = await openUsage({ models: async () => null });
    disposers.push(opened.dispose);
    opened.recorder.record(contextRequest(opened.documents));
    await opened.recorder.settled();
    expect(opened.recorder.pending('shop')).toEqual([]);
  });
});

describe('the rule for a request', () => {
  test('accepts only a 2xx, non-browser, ok or degraded request of a counted operation', () => {
    const base = { operationId: 'agent.plan', origin: 'http', surface: 'agent' as const, outcome: 'ok' as const, status: 200 };
    expect(rulesForRequest(base)?.items).toBe('plan-items');
    expect(rulesForRequest({ ...base, status: 302 })).toBeUndefined();
    expect(rulesForRequest({ ...base, status: 199 })).toBeUndefined();
    expect(rulesForRequest({ ...base, surface: 'browser' })).toBeUndefined();
    expect(rulesForRequest({ ...base, surface: undefined })?.operation).toBe('agent.plan');
  });
});

describe('counters off', () => {
  test('the recorder is the shared no-op and keeps nothing', async () => {
    const opened = await openUsage();
    disposers.push(opened.dispose);
    const off = createUsageRecorder({ settings: { enabled: false, retentionDays: 30 }, store: opened.store, models: async () => opened.models, migrationRecords: () => [] });
    expect(off).toBe(NO_USAGE_RECORDER);
    off.record(contextRequest(opened.documents));
    await off.settled();
    expect(off.pending('shop')).toEqual([]);
  });
});
