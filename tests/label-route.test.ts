import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { measureLabelRoute, visibleLabelRoute, labelRouteAnchor } from '../src/app/graph/label-route';
import { nearestRoutePoint } from '../src/app/graph/routes';
import { useFullGraphEdges } from '../src/app/graph/useFullGraphEdges';

function paintedPath(length: number, at: (offset: number) => { x: number; y: number }, bounds = { x: 0, y: 0, width: 100, height: 100 }) {
  let queries = 0;
  const element = {
    getAttribute: () => 'painted path',
    getBBox: () => bounds,
    getTotalLength: () => length,
    getPointAtLength: (offset: number) => {
      queries++;
      return at(offset);
    },
  } as unknown as SVGPathElement;
  return { element, queries: () => queries };
}

const viewport = { x: -10, y: -10, width: 10000, height: 10000 };

test('a curved leader ends on the painted arc even where its nearest sample chord misses', () => {
  const path = paintedPath(Math.PI * 50, offset => ({ x: 100 * Math.cos(offset / 100), y: 100 * Math.sin(offset / 100) }));
  const route = measureLabelRoute(path.element);
  const geometry = visibleLabelRoute(route, viewport)!;
  const angle = Math.PI / 64;
  const center: [number, number] = [140 * Math.cos(angle), 140 * Math.sin(angle)];
  const chord = nearestRoutePoint(geometry.points, center);
  const anchor = labelRouteAnchor(route, center);
  expect(Math.abs(Math.hypot(...chord) - 100)).toBeGreaterThan(0.01);
  expect(Math.hypot(...anchor)).toBeCloseTo(100, 8);
  expect(Math.hypot(anchor[0] - 100 * Math.cos(angle), anchor[1] - 100 * Math.sin(angle))).toBeLessThan(0.01);
});

test('offscreen bounds skip path queries and sampling is cached when a route enters the viewport', () => {
  const path = paintedPath(4000, offset => ({ x: offset, y: 50 }));
  const route = measureLabelRoute(path.element);
  expect(visibleLabelRoute(route, { x: -1000, y: -1000, width: 100, height: 100 })).toBeUndefined();
  expect(path.queries()).toBe(0);
  const first = visibleLabelRoute(route, viewport)!;
  const queries = path.queries();
  expect(queries).toBeLessThan(50);
  expect(visibleLabelRoute(route, viewport)!.points).toBe(first.points);
  expect(path.queries()).toBe(queries);
});

test('curvature sampling stays bounded on a long winding route', () => {
  const path = paintedPath(10000000, offset => ({ x: offset, y: 100 * Math.sin(offset / 1000) }));
  const geometry = visibleLabelRoute(measureLabelRoute(path.element), viewport)!;
  expect(geometry.points.length).toBeGreaterThan(17);
  expect(geometry.points.length).toBeLessThanOrEqual(257);
  expect(path.queries()).toBeLessThan(550);
});

test('unpublished collapsed labels reserve obstacles with ordinary labels off', () => {
  for (const change of [undefined, 'modified'] as const) {
    let obstacleCalls = 0;
    let eligible = false;
    const connection = { id: 'bundle', source: 'collapsed:a', target: 'collapsed:b', label: 'owns', data: { relationships: [], path: [], definition: {}, kind: 'object', change } };
    function GraphProbe() {
      const edges = useFullGraphEdges({
        connections: [connection],
        positions: new Map(),
        labelObstacles: () => {
          obstacleCalls++;
          return [{ x: 0, y: 0, width: 100, height: 100 }];
        },
        labelViewportSize: { width: 800, height: 500 },
        selectedEdge: '',
        focus: '',
        labels: false,
        hoverEdge: '',
        algorithm: 'network',
        layoutRoutes: {},
        viewport: { x: 0, y: 0, zoom: 1 },
        size: { width: 800, height: 500 },
        dragging: false,
      });
      eligible = Boolean(edges[0].data.reportLabelRoute);
      if (change) expect(edges[0].label).toBe('owns · Not published: modified');
      return null;
    }
    renderToString(createElement(GraphProbe));
    expect(eligible).toBe(Boolean(change));
    expect(obstacleCalls).toBe(change ? 1 : 0);
  }
});

async function routeLifecycleResult(operation: string) {
  const { chromium } = await import('@playwright/test');
  const bundle = await Bun.build({ entrypoints: ['tests/harness/label-route-harness.tsx'], target: 'browser', format: 'esm', define: { 'process.env.NODE_ENV': '"development"' } });
  expect(bundle.success).toBe(true);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => console.error(error));
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ type: 'module', content: await bundle.outputs[0].text() });
    await page.waitForFunction(name => typeof (window as any)[name] === 'function', operation);
    return await page.evaluate(name => (window as any)[name](), operation);
  } finally {
    await browser.close();
  }
}

test('a route report after unmount changes no state and schedules no frame', async () => {
  const result = await routeLifecycleResult('lateReport');
  expect(result.after).toEqual(result.before);
  expect(result.pending).toBe(0);
}, 30000);

test('StrictMode effect remount measures a reported route exactly once', async () => {
  const result = await routeLifecycleResult('strictRemount');
  expect(result.cancellations).toBe(1);
  expect(result.pending).toBe(1);
  expect(result.measurements).toBe(1);
  expect(result.renders).toBeGreaterThanOrEqual(2);
}, 30000);
