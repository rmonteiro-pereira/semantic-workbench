import { expect, test } from 'bun:test';
import { createRenderCallback, observeInteractions } from '../../src/app/observability/ui-profiling';
import type { ReactRenderReport } from '../../src/shared/observability/browser-report';

test('React callback measures render-to-commit elapsed time separately from React CPU time', () => {
  const reports: ReactRenderReport[] = [];
  const measures: { name: string; options?: PerformanceMeasureOptions }[] = [];
  const cleared: string[] = [];
  const callback = createRenderCallback(
    { reportRender: report => reports.push(report) },
    {
      clearMeasures: name => {
        if (name) cleared.push(name);
      },
      measure: (name, options) => {
        if (typeof options === 'string') throw Error('Expected measure options');
        measures.push({ name, options });
        return performance.measure('test.react', { start: 0, duration: 0 });
      },
    },
  );
  callback('canvas', 'update', 12.5, 65, 100, 150);
  expect(reports).toEqual([{ kind: 'react-render', area: 'canvas', phase: 'update', actualDurationMs: 12.5, baseDurationMs: 65 }]);
  expect(measures[0]).toMatchObject({ name: 'sw.react.canvas.update', options: { start: 100, end: 150, detail: reports[0] } });
  expect(cleared).toEqual(['sw.react.canvas.update']);
  callback('private-document-name', 'update', 10, 10, 100, 110);
  expect(reports).toHaveLength(1);
  performance.clearMeasures('test.react');
});

test('unsupported browsers do not create an interaction observer', () => {
  class UnsupportedObserver {
    static supportedEntryTypes: string[] = [];
    constructor() {
      throw Error('Must not construct an unsupported observer');
    }
    observe() {}
    disconnect() {}
    takeRecords(): PerformanceEntryList {
      return [];
    }
  }
  expect(
    observeInteractions(
      {
        reportOperation: () => {
          throw Error('Must not report');
        },
      },
      UnsupportedObserver,
    ),
  ).toBeUndefined();
});

test('interaction observer ignores non-interactions, groups events and can disconnect', () => {
  const reports: number[] = [];
  let callback: PerformanceObserverCallback | undefined;
  let options: PerformanceObserverInit | undefined;
  let disconnected = false;
  class Observer {
    static supportedEntryTypes = ['event'];
    constructor(receive: PerformanceObserverCallback) {
      callback = receive;
    }
    observe(init?: PerformanceObserverInit) {
      options = init;
    }
    disconnect() {
      disconnected = true;
    }
    takeRecords(): PerformanceEntryList {
      return [];
    }
  }
  const stop = observeInteractions(
    {
      reportOperation: (operation, duration) => {
        expect(operation).toBe('interaction');
        reports.push(duration);
      },
    },
    Observer,
  );
  const entry = (interactionId: number, duration: number) => ({
    name: 'click',
    entryType: 'event',
    startTime: 10,
    duration,
    interactionId,
    toJSON: () => ({}),
  });
  callback!({ getEntries: () => [entry(0, 900), entry(1, 200), entry(1, 320), entry(2, 48)], getEntriesByName: () => [], getEntriesByType: () => [] }, new Observer(() => {}));
  expect(reports).toEqual([320, 48]);
  expect(options).toMatchObject({ type: 'event', buffered: true, durationThreshold: 16 });
  stop!();
  expect(disconnected).toBe(true);
  performance.clearMeasures('sw.ui.interaction');
});
