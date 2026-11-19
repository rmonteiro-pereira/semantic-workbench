// Tests the Traffic option: off by default, remembered per model, and the words of the off state.
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrafficLegend } from '../src/app/usage/TrafficLegend';
import { ShowMenu } from '../src/app/graph/ShowMenu';
import { useTrafficShowItem } from '../src/app/usage/traffic-show-item';
import { browserTrafficDeps, createTrafficStore } from '../src/app/usage/traffic-store';
import { TrafficStoreProvider } from '../src/app/usage/use-usage';
import { MODEL, PROJECT, DOCUMENT, answerWith, fakeDeps, itemOf, storeWith } from './helpers/traffic-store';

/** The Show menu with only the Traffic entry, as a graph toolbar renders it. */
function TrafficOnly() {
  return <ShowMenu items={[useTrafficShowItem()]} />;
}

const toggleMarkup = (store: ReturnType<typeof createTrafficStore>) =>
  renderToStaticMarkup(
    <TrafficStoreProvider store={store}>
      <TrafficOnly />
    </TrafficStoreProvider>,
  );

const legendMarkup = (store: ReturnType<typeof createTrafficStore>, admin: boolean) =>
  renderToStaticMarkup(
    <TrafficStoreProvider store={store}>
      <TrafficLegend admin={admin} />
    </TrafficStoreProvider>,
  );

describe('the option', () => {
  test('is absent until a graph has said which model it shows', () => {
    expect(toggleMarkup(createTrafficStore(fakeDeps(async () => answerWith([])).deps))).toBe('');
  });

  test('is off by default: the Show menu names no switch that is on', async () => {
    const { store } = await storeWith(async () => answerWith([]), { on: false });
    const html = toggleMarkup(store);
    expect(html).toContain('aria-label="Show"');
    expect(html).not.toContain('Traffic');
  });

  test('is on when it was left on for the model, and then asks for counts', async () => {
    const { deps, requests } = fakeDeps(async () => answerWith([itemOf('/metric:a', 1)]), { [MODEL]: true });
    const store = createTrafficStore(deps);
    await store.attach({ project: PROJECT, path: DOCUMENT, modelName: MODEL });
    expect(toggleMarkup(store)).toContain('aria-label="Show: Traffic"');
    expect(requests).toEqual([PROJECT]);
  });

  test('works with blocked browser storage: it stays off and nothing throws', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      const store = createTrafficStore(browserTrafficDeps(async () => answerWith([])));
      await store.attach({ project: PROJECT, path: DOCUMENT, modelName: MODEL });
      expect(store.getSnapshot().on).toBe(false);
      await store.setOn(true);
      expect(store.getSnapshot().on).toBe(true);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  test('remembers the choice under a key of its own for each model', async () => {
    const { deps, remembered } = fakeDeps(async () => answerWith([]));
    const store = createTrafficStore(deps);
    await store.attach({ project: PROJECT, path: DOCUMENT, modelName: MODEL });
    await store.setOn(true);
    expect(remembered).toEqual({ [MODEL]: true });
    await store.setOn(false);
    expect(remembered).toEqual({ [MODEL]: false });
  });
});

describe('when the server has counters off', () => {
  const off = async () => (await storeWith(async () => ({ counters: { enabled: false }, measures: [] }))).store;

  test('an Admin is told how to turn them on', async () => {
    expect(legendMarkup(await off(), true)).toContain('Counters are off. An operator turns them on with SW_USAGE_COUNTERS.');
  });

  test('everyone else reads that nothing is collected', async () => {
    const html = legendMarkup(await off(), false);
    expect(html).toContain('Not collected');
    expect(html).not.toContain('SW_USAGE_COUNTERS');
  });
});
