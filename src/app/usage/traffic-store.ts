/** Holds the state of the Traffic option: whether it is on, what the server answered and how fresh it is. */
import type { UsageAnswer, UsageItem } from '../../server/usage/usage-read';
import { readFlag, writeFlag } from '../graph/hidden-kinds';

/** What the Traffic display can be in. `idle` means the option is off and nothing was asked. */
export type TrafficStatus = 'idle' | 'loading' | 'error' | 'counters-off' | 'empty' | 'partial' | 'ready';

/** An immutable picture of the store, replaced whenever anything changes. */
export type TrafficSnapshot = {
  on: boolean;
  project: string | null;
  /** The file whose items are on screen, so relative addresses can be made absolute. */
  path: string | null;
  modelName: string | null;
  status: TrafficStatus;
  /** Days the counts cover, from the server's retention. */
  days: number;
  items: ReadonlyMap<string, UsageItem>;
  /** The largest item total, which the intensity levels are relative to. */
  largest: number;
  unavailableDays: readonly string[];
  error: string;
};

/** Where counts come from and how often they are refreshed; replaced by tests. */
export type TrafficDeps = {
  fetchUsage: (project: string) => Promise<UsageAnswer>;
  /** Calls `run` every `milliseconds` until the returned function is called. */
  every: (milliseconds: number, run: () => void) => () => void;
  readOn: (modelName: string) => boolean;
  writeOn: (modelName: string, on: boolean) => void;
};

/** Counts are asked for again at most this often while Traffic stays on. */
export const REFRESH_MS = 60_000;

const idle: TrafficSnapshot = { on: false, project: null, path: null, modelName: null, status: 'idle', days: 30, items: new Map(), largest: 0, unavailableDays: [], error: '' };
const keyFor = (modelName: string) => 'workbench:traffic:' + modelName;

/** The browser's own dependencies: the usage API, timers and the remembered option. */
export function browserTrafficDeps(fetchUsage: TrafficDeps['fetchUsage']): TrafficDeps {
  return {
    fetchUsage,
    every: (milliseconds, run) => {
      const timer = setInterval(run, milliseconds);
      return () => clearInterval(timer);
    },
    readOn: modelName => readFlag(keyFor(modelName)),
    writeOn: (modelName, on) => writeFlag(keyFor(modelName), on),
  };
}

/** Turns an answer into the display state. */
export function describeAnswer(answer: UsageAnswer): Pick<TrafficSnapshot, 'status' | 'days' | 'items' | 'largest' | 'unavailableDays'> {
  if (!answer.counters.enabled) return { status: 'counters-off', days: 30, items: new Map(), largest: 0, unavailableDays: [] };
  const series = answer.measures[0];
  const items = new Map(series.items.map(item => [item.address, item]));
  const largest = series.items.reduce((most, item) => Math.max(most, item.total), 0);
  const days = answer.counters.retentionDays ?? 30;
  let status: TrafficStatus = 'ready';
  if (series.unavailableDays.length) status = 'partial';
  else if (!series.items.length) status = 'empty';
  return { status, days, items, largest, unavailableDays: series.unavailableDays };
}

/** Creates the store. Nothing is requested until the option is switched on. */
export function createTrafficStore(deps: TrafficDeps) {
  let snapshot: TrafficSnapshot = idle;
  const listeners = new Set<() => void>();
  let stopRefresh: (() => void) | undefined;
  let requestNumber = 0;

  function update(change: Partial<TrafficSnapshot>) {
    snapshot = { ...snapshot, ...change };
    for (const listener of listeners) listener();
  }

  async function load(): Promise<void> {
    const { project } = snapshot;
    if (!snapshot.on || !project) return;
    const mine = ++requestNumber;
    if (snapshot.status === 'idle' || snapshot.status === 'error') update({ status: 'loading', error: '' });
    try {
      const answer = await deps.fetchUsage(project);
      if (mine === requestNumber && snapshot.on) update({ ...describeAnswer(answer), error: '' });
    } catch (error) {
      if (mine === requestNumber && snapshot.on) update({ status: 'error', error: error instanceof Error ? error.message : 'Traffic could not be loaded.' });
    }
  }

  function startRefreshing() {
    stopRefresh?.();
    stopRefresh = deps.every(REFRESH_MS, () => void load());
  }

  function stop() {
    stopRefresh?.();
    stopRefresh = undefined;
    requestNumber++;
  }

  async function turn(on: boolean): Promise<void> {
    if (!on) {
      stop();
      update({ ...idle, project: snapshot.project, path: snapshot.path, modelName: snapshot.modelName });
      return;
    }
    update({ on: true });
    startRefreshing();
    await load();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * Names the project, file and model on screen, and restores the option remembered for that model.
     * A change of file inside the same model only updates the file; the counts are the project's.
     */
    async attach(scope: { project: string; path: string; modelName: string }): Promise<void> {
      if (snapshot.project === scope.project && snapshot.modelName === scope.modelName) {
        if (snapshot.path !== scope.path) update({ path: scope.path });
        return;
      }
      stop();
      snapshot = { ...idle, project: scope.project, path: scope.path, modelName: scope.modelName };
      for (const listener of listeners) listener();
      if (deps.readOn(scope.modelName)) await turn(true);
    },
    /** Switches the option, remembers the choice for the model and, when turned on, asks the server. */
    async setOn(on: boolean): Promise<void> {
      if (snapshot.modelName) deps.writeOn(snapshot.modelName, on);
      await turn(on);
    },
    /** Asks again after an error, or sooner than the next refresh. */
    retry: () => load(),
  };
}

/** The store of the running application. */
export type TrafficStore = ReturnType<typeof createTrafficStore>;
