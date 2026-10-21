/** Coordinates delayed saves of valid edits with validation, stale-file and Git-operation
 * safeguards. */
// Edits restart a one-second pause before validation and saving. Invalid text remains a server
// draft; stale saves, Git operations and removed files block writes. Only one save runs at a time;
// later edits use the hash returned by that save.
/** Names the current saving, validation or conflict state of an open file. */
export type AutosaveStatus =
  | 'clean'
  | 'pending'
  | 'saving'
  | 'saved'
  | 'invalid'
  | 'stale'
  | 'failed'
  | 'waiting'
  | 'cancelled';
/** Tracks editor text, saved text, base hash and pending autosave work. */
export type AutosaveState = {
  file: string | null;
  status: AutosaveStatus;
  baseHash: string | null;
  savedText: string;
  text: string;
  inFlight: string | null;
  errors: number;
  gitBusy: boolean;
  message?: string;
  lastSavedAt?: number;
};
/** Describes an edit, validation result or external event affecting autosave. */
export type AutosaveEvent =
  | { type: 'open'; file: string; hash: string | null; text: string }
  | { type: 'edit'; text: string }
  | { type: 'idle'; text: string; errors: number }
  | { type: 'saved'; text: string; hash: string; at: number }
  | { type: 'stale' }
  | { type: 'resolved'; hash: string | null; text: string }
  | { type: 'failed'; message: string }
  | { type: 'cancel' }
  | { type: 'git'; busy: boolean }
  | { type: 'external'; hash: string; text: string };
/** Requests a validation or save side effect from the autosave driver. */
export type AutosaveEffect =
  | { type: 'save'; file: string; baseHash: string | null; from: string; to: string }
  | { type: 'schedule' }
  | null;
export const AUTOSAVE_DELAY_MS = 1000;
export const initialAutosave: AutosaveState = {
  file: null,
  status: 'clean',
  baseHash: null,
  savedText: '',
  text: '',
  inFlight: null,
  errors: 0,
  gitBusy: false,
};
const paused = (s: AutosaveState) => s.status === 'stale' || s.status === 'cancelled';
const settled = (s: AutosaveState): AutosaveStatus =>
  s.lastSavedAt !== undefined ? 'saved' : 'clean';
/** Advances autosave state and returns effects without performing writes itself. */
export function autosave(
  state: AutosaveState,
  event: AutosaveEvent,
): { state: AutosaveState; effect: AutosaveEffect } {
  const keep = (next: AutosaveState, effect: AutosaveEffect = null) => ({ state: next, effect });
  switch (event.type) {
    case 'open':
      return keep({
        ...initialAutosave,
        file: event.file,
        baseHash: event.hash,
        savedText: event.text,
        text: event.text,
        gitBusy: state.gitBusy,
      });
    case 'edit': {
      const next = { ...state, text: event.text };
      if (paused(state)) return keep(next);
      if (state.inFlight !== null) return keep({ ...next, status: 'saving' });
      if (event.text === state.savedText)
        return keep({ ...next, status: settled(state), errors: 0 });
      return keep({ ...next, status: 'pending' }, { type: 'schedule' });
    }
    case 'idle': {
      // Validity is for exactly this text; a newer edit has its own pause coming.
      if (event.text !== state.text || !state.file) return keep(state);
      if (state.status === 'stale') return keep(state);
      if (state.status === 'cancelled') return keep(state);
      if (state.text === state.savedText && state.inFlight === null)
        return keep({ ...state, status: settled(state), errors: 0 });
      if (event.errors > 0) return keep({ ...state, status: 'invalid', errors: event.errors });
      if (state.gitBusy) return keep({ ...state, status: 'waiting', errors: 0 });
      if (state.inFlight !== null) return keep({ ...state, status: 'saving', errors: 0 });
      return keep(
        { ...state, status: 'saving', errors: 0, inFlight: state.text, message: undefined },
        {
          type: 'save',
          file: state.file,
          baseHash: state.baseHash,
          from: state.savedText,
          to: state.text,
        },
      );
    }
    case 'saved': {
      if (state.status === 'cancelled' || state.inFlight === null)
        return keep({ ...state, inFlight: null });
      const next = {
        ...state,
        inFlight: null,
        baseHash: event.hash,
        savedText: event.text,
        lastSavedAt: event.at,
        errors: 0,
      };
      if (next.text !== next.savedText)
        return keep({ ...next, status: 'pending' }, { type: 'schedule' });
      return keep({ ...next, status: 'saved' });
    }
    case 'stale':
      return keep({ ...state, inFlight: null, status: 'stale' });
    case 'resolved': {
      const next = { ...state, baseHash: event.hash, savedText: event.text, inFlight: null };
      if (next.text === next.savedText) return keep({ ...next, status: settled(state) });
      return keep({ ...next, status: 'pending' }, { type: 'schedule' });
    }
    case 'failed':
      return keep({ ...state, inFlight: null, status: 'failed', message: event.message });
    case 'cancel':
      return keep({ ...state, inFlight: null, status: 'cancelled' });
    case 'git': {
      const next = { ...state, gitBusy: event.busy };
      // After the Git operation, the next save re-checks the base hash on the server.
      if (!event.busy && state.status === 'waiting')
        return keep({ ...next, status: 'pending' }, { type: 'schedule' });
      return keep(next);
    }
    case 'external': {
      // The disk changed (Git, another tab, an external editor): follow it only without unsaved
      // edits.
      if (state.text !== state.savedText || state.inFlight !== null) return keep(state);
      return keep({
        ...state,
        baseHash: event.hash,
        savedText: event.text,
        text: event.text,
        status: state.status === 'cancelled' ? 'clean' : settled(state),
      });
    }
  }
}
/** Checks whether editor text differs from the last saved text. */
export const isDirty = (s: AutosaveState) => s.text !== s.savedText;
// Save-state labels distinguish validation, conflicts and uncommitted changes.
/** Returns the visible save-state label including uncommitted-change status. */
export function saveStateLabel(s: AutosaveState, uncommitted: number) {
  const changes = `${uncommitted} uncommitted change${uncommitted === 1 ? '' : 's'}`;
  switch (s.status) {
    case 'saving':
      return 'Saving…';
    case 'pending':
      return 'Editing…';
    case 'invalid':
      return `Not saved: ${s.errors} error${s.errors === 1 ? '' : 's'}`;
    case 'stale':
      return 'Not saved: file changed on disk';
    case 'failed':
      return `Not saved: ${s.message ?? 'the save failed'}`;
    case 'waiting':
      return 'Not saved yet: waiting for Git';
    case 'cancelled':
      return 'Not saved: the file was removed';
    default:
      return `Saved to file · ${changes}`;
  }
}
// Validation must match the exact editor text. Saves apply changes against the saved version’s
// hash and return the next hash. Diff computation and requests start in idle time after the pause,
// never on a keystroke.
import { useCallback, useEffect, useRef, useState } from 'react';
/** Describes a save effect against a specific base hash. */
export type SaveRequest = Extract<AutosaveEffect, { type: 'save' }>;
/** Supplies file versions, validation, persistence and callbacks to the autosave driver. */
export type AutosaveOptions = {
  file: string | null;
  hash: string | null;
  saved: string;
  text: string;
  gitBusy?: boolean;
  delay?: number;
  validate: (text: string) => Promise<number> | number;
  save: (request: SaveRequest) => Promise<{ hash: string }>;
  onSaved: (file: string, text: string, hash: string) => void;
  onStale: (file: string, error: unknown) => void;
  isStale: (error: unknown) => boolean;
  onFailed?: (file: string, message: string) => void;
};
const idle = (fn: () => void) => {
  const w = globalThis as {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 500 });
  else setTimeout(fn, 0);
};
/** Drives delayed validation and serialized saves for the open file. */
export function useAutosave(o: AutosaveOptions) {
  const ref = useRef<AutosaveState>(initialAutosave);
  const [state, setState] = useState<AutosaveState>(initialAutosave);
  const opts = useRef(o);
  opts.current = o;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const waiters = useRef<(() => void)[]>([]);
  const settle = () => {
    if (ref.current.inFlight === null && !timer.current) {
      const w = waiters.current;
      waiters.current = [];
      for (const f of w) f();
    }
  };
  const dispatch = useCallback((event: AutosaveEvent) => {
    const r = autosave(ref.current, event);
    ref.current = r.state;
    setState(r.state);
    if (r.effect?.type === 'schedule') {
      clearTimeout(timer.current);
      timer.current = setTimeout(fire, opts.current.delay ?? AUTOSAVE_DELAY_MS);
    } else if (r.effect?.type === 'save') run(r.effect);
    else settle();
  }, []);
  async function fire() {
    timer.current = undefined;
    const text = ref.current.text;
    const file = ref.current.file;
    let errors = 0;
    try {
      errors = await opts.current.validate(text);
    } catch {
      errors = 1;
    }
    if (ref.current.file !== file) return settle();
    dispatch({ type: 'idle', text, errors });
  }
  function run(request: SaveRequest) {
    idle(() => {
      opts.current.save(request).then(
        r => {
          const mine = ref.current.file === request.file;
          opts.current.onSaved(request.file, request.to, r.hash);
          if (mine) dispatch({ type: 'saved', text: request.to, hash: r.hash, at: Date.now() });
          else settle();
        },
        e => {
          const mine = ref.current.file === request.file;
          if (opts.current.isStale(e)) {
            if (mine) dispatch({ type: 'stale' });
            opts.current.onStale(request.file, e);
          } else {
            const message = (e as Error).message;
            if (mine) dispatch({ type: 'failed', message });
            opts.current.onFailed?.(request.file, message);
          }
          settle();
        },
      );
    });
  }
  // Open: a new file resets the machine; the same file following the disk is an external change.
  useEffect(() => {
    if (o.file !== ref.current.file) {
      clearTimeout(timer.current);
      timer.current = undefined;
      dispatch({ type: 'open', file: o.file ?? '', hash: o.hash, text: o.saved });
      if (o.text !== o.saved) dispatch({ type: 'edit', text: o.text });
      return;
    }
    if (o.hash !== ref.current.baseHash && ref.current.inFlight === null)
      dispatch({ type: 'external', hash: o.hash ?? '', text: o.saved });
  }, [o.file, o.hash, o.saved]);
  useEffect(() => {
    if (o.file === ref.current.file && o.text !== ref.current.text)
      dispatch({ type: 'edit', text: o.text });
  }, [o.text]);
  useEffect(() => {
    if (!!o.gitBusy !== ref.current.gitBusy) dispatch({ type: 'git', busy: !!o.gitBusy });
  }, [o.gitBusy]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    state,
    // Save now if a save is due (switching files or views); resolves when nothing is in flight.
    flush(): Promise<void> {
      if (timer.current) {
        clearTimeout(timer.current);
        void fire();
      }
      if (ref.current.inFlight === null && !timer.current && ref.current.status !== 'pending')
        return Promise.resolve();
      return new Promise(res => {
        waiters.current.push(res);
        setTimeout(res, 10_000);
      });
    },
    resolved: (hash: string | null, text: string) => dispatch({ type: 'resolved', hash, text }),
    cancel: () => {
      clearTimeout(timer.current);
      timer.current = undefined;
      dispatch({ type: 'cancel' });
    },
  };
}
