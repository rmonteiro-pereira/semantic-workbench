// Tests the Traffic store: no request while the option is off, and every state it can be in.
import { describe, expect, test } from 'bun:test';
import { createTrafficStore, describeAnswer, REFRESH_MS } from '../src/app/usage/traffic-store';
import { absoluteTrafficAddress, metricAddressText } from '../src/app/usage/usage-addresses';
import { trafficOf } from '../src/app/usage/use-usage';
import { DOCUMENT, MODEL, PROJECT, answerWith, fakeDeps, itemOf, storeWith } from './helpers/traffic-store';

const scope = { project: PROJECT, path: DOCUMENT, modelName: MODEL };

describe('while the option is off', () => {
  test('attaching a graph asks for nothing and leaves the store idle', async () => {
    const { deps, requests, timers } = fakeDeps(async () => answerWith([]));
    const store = createTrafficStore(deps);
    await store.attach(scope);
    expect(requests).toEqual([]);
    expect(timers).toEqual([]);
    expect(store.getSnapshot()).toMatchObject({ on: false, status: 'idle', project: PROJECT, path: DOCUMENT, modelName: MODEL });
  });
});

describe('switching on', () => {
  test('makes the first request and refreshes once a minute until switched off', async () => {
    const { store, requests, timers } = await storeWith(async () => answerWith([itemOf('/metric:a', 3)]));
    expect(requests).toEqual([PROJECT]);
    expect(timers.map(timer => timer.milliseconds)).toEqual([REFRESH_MS]);
    timers[0].run();
    await Promise.resolve();
    expect(requests).toHaveLength(2);
    await store.setOn(false);
    expect(timers[0].stopped).toBe(true);
    expect(store.getSnapshot()).toMatchObject({ on: false, status: 'idle' });
    expect(requests).toHaveLength(2);
  });

  test('is ready with the largest count to scale against', async () => {
    const { store } = await storeWith(async () => answerWith([itemOf('/metric:a', 3), itemOf('/metric:b', 9)]));
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', largest: 9, days: 30 });
  });

  test('says empty when nothing was counted, partial when days are unavailable, and counters-off when the server says so', async () => {
    expect((await storeWith(async () => answerWith([]))).store.getSnapshot().status).toBe('empty');
    const partial = await storeWith(async () => answerWith([itemOf('/metric:a', 1)], { unavailableDays: ['2026-11-16'] }));
    expect(partial.store.getSnapshot()).toMatchObject({ status: 'partial', unavailableDays: ['2026-11-16'] });
    const off = await storeWith(async () => ({ counters: { enabled: false }, measures: [] }));
    expect(off.store.getSnapshot().status).toBe('counters-off');
  });

  test('shows loading while the request is out', async () => {
    let finish: (() => void) | undefined;
    const { deps } = fakeDeps(() => new Promise(resolve => (finish = () => resolve(answerWith([itemOf('/metric:a', 1)])))));
    const store = createTrafficStore(deps);
    await store.attach(scope);
    const pending = store.setOn(true);
    expect(store.getSnapshot().status).toBe('loading');
    finish!();
    await pending;
    expect(store.getSnapshot().status).toBe('ready');
  });

  test('shows an error, keeps the graph usable and recovers on retry', async () => {
    let fail = true;
    const { store } = await storeWith(async () => {
      if (fail) throw new Error('Request failed (500).');
      return answerWith([itemOf('/metric:a', 1)]);
    });
    expect(store.getSnapshot()).toMatchObject({ status: 'error', error: 'Request failed (500).' });
    fail = false;
    await store.retry();
    expect(store.getSnapshot().status).toBe('ready');
  });

  test('ignores an answer that arrives after the option was switched off', async () => {
    let finish: (() => void) | undefined;
    const { deps } = fakeDeps(() => new Promise(resolve => (finish = () => resolve(answerWith([itemOf('/metric:a', 1)])))));
    const store = createTrafficStore(deps);
    await store.attach(scope);
    const pending = store.setOn(true);
    await store.setOn(false);
    finish!();
    await pending;
    expect(store.getSnapshot().status).toBe('idle');
  });
});

describe('remembering the option', () => {
  test('is restored for the model it was set for and for no other', async () => {
    const { deps, requests, remembered } = fakeDeps(async () => answerWith([itemOf('/metric:a', 1)]), { [MODEL]: true });
    const store = createTrafficStore(deps);
    await store.attach(scope);
    expect(store.getSnapshot().on).toBe(true);
    expect(requests).toHaveLength(1);
    await store.attach({ project: PROJECT, path: DOCUMENT, modelName: 'Other' });
    expect(store.getSnapshot()).toMatchObject({ on: false, status: 'idle' });
    await store.setOn(true);
    expect(remembered).toEqual({ [MODEL]: true, Other: true });
  });

  test('another file of the same model keeps the state and asks for nothing more', async () => {
    const { store, requests } = await storeWith(async () => answerWith([itemOf('/metric:a', 1)]));
    await store.attach({ project: PROJECT, path: 'other.yaml', modelName: MODEL });
    expect(store.getSnapshot()).toMatchObject({ on: true, path: 'other.yaml', status: 'ready' });
    expect(requests).toHaveLength(1);
  });

  test('another project asks again', async () => {
    const { deps, requests } = fakeDeps(async () => answerWith([]), { [MODEL]: true });
    const store = createTrafficStore(deps);
    await store.attach(scope);
    await store.attach({ project: 'other', path: DOCUMENT, modelName: MODEL });
    expect(requests).toEqual([PROJECT, 'other']);
  });
});

describe('describing an answer and its addresses', () => {
  test('the answer states its retention as the period', () => {
    expect(describeAnswer(answerWith([itemOf('/metric:a', 1)], {}, 7)).days).toBe(7);
  });

  test('a relative address is made absolute with the file on screen, and an absolute one is kept', () => {
    const document = { project: PROJECT, document: [DOCUMENT] };
    expect(absoluteTrafficAddress('sw1:#model:Sales/metric:a', document)).toBe(`sw1:${PROJECT}/${DOCUMENT}#model:Sales/metric:a`);
    expect(absoluteTrafficAddress(`sw1:${PROJECT}/${DOCUMENT}#model:Sales/metric:a`, null)).toBe(`sw1:${PROJECT}/${DOCUMENT}#model:Sales/metric:a`);
    expect(absoluteTrafficAddress('sw1:#model:Sales/metric:a', null)).toBeUndefined();
    expect(absoluteTrafficAddress(undefined, document)).toBeUndefined();
    expect(absoluteTrafficAddress('not an address', document)).toBeUndefined();
  });

  test('a metric of a split file has an address and an embedded one has none', () => {
    const metric = { file: 'models/sales.yaml', modelPath: [] as (string | number)[], model: 'Sales', name: 'revenue', layout: 'split' as const };
    expect(metricAddressText(PROJECT, metric)).toBe(`sw1:${PROJECT}/models/sales.yaml#model:Sales/metric:revenue`);
    expect(metricAddressText(PROJECT, { ...metric, layout: 'embedded (deprecated)' })).toBeUndefined();
  });

  test('traffic of an item is hidden until the answer is in and is zero for an item not counted', async () => {
    const { store } = await storeWith(async () => answerWith([itemOf('/metric:a', 4)]), { on: false });
    expect(trafficOf(store.getSnapshot(), `sw1:${PROJECT}/${DOCUMENT}#model:${MODEL}/metric:a`)).toBeNull();
    await store.setOn(true);
    const snapshot = store.getSnapshot();
    expect(trafficOf(snapshot, `sw1:${PROJECT}/${DOCUMENT}#model:${MODEL}/metric:a`)).toMatchObject({ total: 4, level: 5, days: 30 });
    expect(trafficOf(snapshot, `sw1:${PROJECT}/${DOCUMENT}#model:${MODEL}/metric:other`)).toMatchObject({ total: 0, level: 0 });
  });
});
