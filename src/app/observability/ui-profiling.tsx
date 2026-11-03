import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react';
import { REACT_AREAS, type ReactArea } from '../../shared/observability/browser-report';
import { browserReporter } from './page-reporting';
import type { Reporter } from './reporter';

const enabled = typeof __SW_PROFILE_UI__ !== 'undefined' && __SW_PROFILE_UI__;

/** The slice of the browser's User Timing API that profiling writes to, injectable for tests. */
type Timeline = Pick<Performance, 'clearMeasures' | 'measure'>;

export function createRenderCallback(reporter: Pick<Reporter, 'reportRender'>, timeline: Timeline = performance): ProfilerOnRenderCallback {
  return (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
    const area = REACT_AREAS.find(area => area === id);
    if (!area) return;
    const report = { kind: 'react-render', area, phase, actualDurationMs: actualDuration, baseDurationMs: baseDuration } as const;
    const name = `sw.react.${area}.${phase}`;
    // The span includes scheduling; React's CPU render durations are in its detail.
    timeline.clearMeasures(name);
    timeline.measure(name, { start: startTime, end: commitTime, detail: report });
    reporter.reportRender(report);
  };
}

const onRender = createRenderCallback(browserReporter);

export function UiProfiler({ area, children }: { area: ReactArea; children: ReactNode }) {
  return enabled ? (
    <Profiler id={area} onRender={onRender}>
      {children}
    </Profiler>
  ) : (
    children
  );
}

export function observeInteractions(reporter: Pick<Reporter, 'reportOperation'>, Observer = globalThis.PerformanceObserver, timeline: Timeline = performance): (() => void) | undefined {
  if (!Observer?.supportedEntryTypes.includes('event')) return;
  const observer = new Observer(list => {
    const interactions = new Map<number, PerformanceEntry>();
    for (const entry of list.getEntries()) {
      if (!('interactionId' in entry) || typeof entry.interactionId !== 'number' || entry.interactionId === 0) continue;
      if (entry.duration > (interactions.get(entry.interactionId)?.duration ?? -1)) interactions.set(entry.interactionId, entry);
    }
    for (const entry of interactions.values()) {
      const name = 'sw.ui.interaction';
      timeline.clearMeasures(name);
      timeline.measure(name, { start: entry.startTime, duration: entry.duration });
      reporter.reportOperation('interaction', entry.duration);
    }
  });
  const options = { type: 'event', buffered: true, durationThreshold: 16 };
  observer.observe(options);
  return () => observer.disconnect();
}

export function startUiProfiling(): void {
  if (enabled) observeInteractions(browserReporter);
}
