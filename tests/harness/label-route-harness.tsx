import { createElement, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useFullGraphEdges } from '../../src/app/graph/useFullGraphEdges';

const frames = new Map<number, FrameRequestCallback>();
let scheduled = 0;
let measurements = 0;
let renders = 0;
let report: (id: string, element: SVGPathElement) => void;
const path = {
  getAttribute: () => 'M 0 0 L 100 100',
  getBBox: () => {
    measurements++;
    return { x: 0, y: 0, width: 100, height: 100 };
  },
  getTotalLength: () => 100,
  getPointAtLength: (offset: number) => ({ x: offset, y: offset }),
} as unknown as SVGPathElement;
window.requestAnimationFrame = callback => {
  frames.set(++scheduled, callback);
  return scheduled;
};
window.cancelAnimationFrame = frame => {
  frames.delete(frame);
};

function GraphProbe() {
  renders++;
  const edges = useFullGraphEdges({
    connections: [{ id: 'bundle', source: 'collapsed:a', target: 'collapsed:b', label: 'owns', data: { relationships: [], path: [], definition: {}, kind: 'object' } }],
    positions: new Map(),
    labelObstacles: () => [],
    labelViewportSize: { width: 800, height: 500 },
    selectedEdge: '',
    focus: '',
    labels: true,
    hoverEdge: '',
    algorithm: 'network',
    layoutRoutes: {},
    viewport: { x: 0, y: 0, zoom: 1 },
    size: { width: 800, height: 500 },
    dragging: false,
  });
  report = edges[0].data.reportLabelRoute!;
  useLayoutEffect(() => {
    report('bundle', path);
  }, []);
  return null;
}

/** Exercises a retained route callback after its graph root has unmounted. */
export function lateReport() {
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  flushSync(() => root.render(createElement(GraphProbe)));
  flushSync(() => root.unmount());
  const before = { scheduled, measurements, renders };
  report('bundle', path);
  for (const callback of frames.values()) flushSync(() => callback(0));
  return { before, after: { scheduled, measurements, renders }, pending: frames.size };
}

Object.assign(window, { lateReport });
