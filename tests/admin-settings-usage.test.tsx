// Tests the read-only counter status of the Admin Settings page: on, off, a non-default retention and failures.
import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CountersSummary, readCounters } from '../src/app/usage/UsageCountersStatus';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function answerWith(projects: string[], counters: object) {
  const requested: string[] = [];
  globalThis.fetch = (async (input: string) => {
    requested.push(input);
    return Response.json(input === '/api/projects' ? projects.map(slug => ({ slug })) : { counters, measures: [] });
  }) as unknown as typeof fetch;
  return requested;
}

const summary = (state: Parameters<typeof CountersSummary>[0]['state']) => renderToStaticMarkup(<CountersSummary state={state} />);

describe('CountersSummary', () => {
  test('says counters are on with the default retention', () => {
    const html = summary({ kind: 'known', counters: { enabled: true, retentionDays: 30 } });
    expect(html).toContain('Usage counters are on.');
    expect(html).toContain('the last 30 days');
  });

  test('says a non-default retention', () => {
    expect(summary({ kind: 'known', counters: { enabled: true, retentionDays: 90 } })).toContain('the last 90 days');
  });

  test('says counters are off and how an operator turns them on', () => {
    expect(summary({ kind: 'known', counters: { enabled: false } })).toContain('Usage counters are off. An operator turns them on with SW_USAGE_COUNTERS.');
  });

  test('says when there is no project to ask about, while loading and on failure', () => {
    expect(summary({ kind: 'unknown' })).toContain('once a project exists');
    expect(summary({ kind: 'loading' })).toContain('role="status"');
    expect(summary({ kind: 'error', message: 'forbidden' })).toContain('role="alert"');
  });

  test('offers no control to change anything', () => {
    for (const state of [
      { kind: 'known', counters: { enabled: true, retentionDays: 30 } },
      { kind: 'known', counters: { enabled: false } },
    ] as const) {
      expect(summary(state)).not.toMatch(/<(button|input|select|textarea)/);
    }
  });
});

describe('readCounters', () => {
  test('asks the usage answer of the first project and returns its counters', async () => {
    const requested = answerWith(['shop', 'other'], { enabled: true, retentionDays: 14 });
    expect(await readCounters()).toEqual({ kind: 'known', counters: { enabled: true, retentionDays: 14 } });
    expect(requested).toEqual(['/api/projects', '/api/projects/shop/usage']);
  });

  test('is unknown when no project exists', async () => {
    answerWith([], {});
    expect(await readCounters()).toEqual({ kind: 'unknown' });
  });
});
