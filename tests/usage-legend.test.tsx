// Tests what the legend says in each state: the measure, the operations, the period and the failures.
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrafficLegend } from '../src/app/usage/TrafficLegend';
import { TrafficStoreProvider } from '../src/app/usage/use-usage';
import { answerWith, fakeDeps, itemOf, storeWith } from './helpers/traffic-store';
import { createTrafficStore } from '../src/app/usage/traffic-store';

async function legend(respond: () => Promise<ReturnType<typeof answerWith>>, on = true) {
  const { store } = await storeWith(respond, { on });
  return renderToStaticMarkup(
    <TrafficStoreProvider store={store}>
      <TrafficLegend admin={false} />
    </TrafficStoreProvider>,
  );
}

describe('TrafficLegend', () => {
  test('names the measure, the operations, the period and that browser views are not counted', async () => {
    const html = await legend(async () => answerWith([itemOf('/metric:a', 3)]));
    expect(html).toContain('requests through this workbench in the last 30 days');
    expect(html).toContain('context requests, query plan requests, metric explanation requests');
    expect(html).toContain('Browser views are not counted');
    expect(html).not.toMatch(/queries|usage in production|popularity/i);
  });

  test('says nothing while Traffic is off', async () => {
    expect(await legend(async () => answerWith([]), false)).toBe('');
  });

  test('says when nothing has been counted yet', async () => {
    expect(await legend(async () => answerWith([]))).toContain('No requests through this workbench counted yet in the last 30 days.');
  });

  test('names the days that are unavailable and still explains the shading', async () => {
    const html = await legend(async () => answerWith([itemOf('/metric:a', 3)], { unavailableDays: ['2026-11-15', '2026-11-16'] }));
    expect(html).toContain('2 days (2026-11-15, 2026-11-16)');
    expect(html).toContain('Shading shows');
  });

  test('shows a failure with a Retry button', async () => {
    const html = await legend(async () => {
      throw new Error('Request failed (500).');
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Request failed (500).');
    expect(html).toContain('Retry');
  });

  test('shows a loading line of its own while the request is out', async () => {
    const { deps } = fakeDeps(() => new Promise(() => {}));
    const store = createTrafficStore(deps);
    await store.attach({ project: 'shop', path: 'sales.yaml', modelName: 'Sales' });
    void store.setOn(true);
    const html = renderToStaticMarkup(
      <TrafficStoreProvider store={store}>
        <TrafficLegend admin={false} />
      </TrafficStoreProvider>,
    );
    expect(html).toContain('traffic-loading');
    expect(html).toContain('Loading requests through this workbench');
  });
});
