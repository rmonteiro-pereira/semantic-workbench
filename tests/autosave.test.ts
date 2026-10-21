import { test, expect } from 'bun:test';
import {
  autosave,
  initialAutosave,
  isDirty,
  saveStateLabel,
  type AutosaveEvent,
  type AutosaveState,
} from '../src/projects/autosave';
// The autosave state machine (T013, research R7): pending → saving → saved/stale/failed/invalid, one
// save in flight, queued text saved on the returned hash, cancel on delete/move, wait for Git.
const run = (events: AutosaveEvent[], state: AutosaveState = initialAutosave) => {
  const effects: any[] = [];
  for (const e of events) {
    const r = autosave(state, e);
    state = r.state;
    effects.push(r.effect);
  }
  return { state, effects };
};
const open: AutosaveEvent = { type: 'open', file: 'p/a.yaml', hash: 'h0', text: 'a: 1\n' };
test('a valid edit is saved after the pause, from the saved text to the new text on the base hash', () => {
  const { state, effects } = run([
    open,
    { type: 'edit', text: 'a: 2\n' },
    { type: 'idle', text: 'a: 2\n', errors: 0 },
  ]);
  expect(effects[1]).toEqual({ type: 'schedule' });
  expect(effects[2]).toEqual({
    type: 'save',
    file: 'p/a.yaml',
    baseHash: 'h0',
    from: 'a: 1\n',
    to: 'a: 2\n',
  });
  expect(state.status).toBe('saving');
  expect(state.inFlight).toBe('a: 2\n');
  const done = autosave(state, { type: 'saved', text: 'a: 2\n', hash: 'h1', at: 5 });
  expect(done.state).toMatchObject({
    status: 'saved',
    baseHash: 'h1',
    savedText: 'a: 2\n',
    inFlight: null,
    lastSavedAt: 5,
  });
  expect(done.effect).toBeNull();
  expect(isDirty(done.state)).toBe(false);
});
test('invalid text is never written and is reported with its error count', () => {
  const { state, effects } = run([
    open,
    { type: 'edit', text: 'a: [' },
    { type: 'idle', text: 'a: [', errors: 2 },
  ]);
  expect(effects[2]).toBeNull();
  expect(state.status).toBe('invalid');
  expect(state.errors).toBe(2);
  expect(saveStateLabel(state, 0)).toBe('Not saved: 2 errors');
  // repaired: saved on the next pause
  const r = run(
    [
      { type: 'edit', text: 'a: 3\n' },
      { type: 'idle', text: 'a: 3\n', errors: 0 },
    ],
    state,
  );
  expect(r.effects[1]).toMatchObject({ type: 'save', from: 'a: 1\n', to: 'a: 3\n' });
});
test('validity of an older text is ignored; reverting to the saved text needs no save', () => {
  let { state } = run([open, { type: 'edit', text: 'x' }, { type: 'edit', text: 'xy' }]);
  const stale = autosave(state, { type: 'idle', text: 'x', errors: 0 });
  expect(stale.effect).toBeNull();
  expect(stale.state).toBe(state);
  const back = run(
    [
      { type: 'edit', text: 'a: 1\n' },
      { type: 'idle', text: 'a: 1\n', errors: 0 },
    ],
    state,
  );
  expect(back.effects.every(e => e === null)).toBe(true);
  expect(back.state.status).toBe('clean');
});
test('one save in flight; edits meanwhile are saved next on the returned hash', () => {
  let { state } = run([
    open,
    { type: 'edit', text: 'b1' },
    { type: 'idle', text: 'b1', errors: 0 },
    { type: 'edit', text: 'b2' },
    { type: 'idle', text: 'b2', errors: 0 },
  ]);
  expect(state.inFlight).toBe('b1');
  expect(state.status).toBe('saving');
  const r = autosave(state, { type: 'saved', text: 'b1', hash: 'h1', at: 1 });
  expect(r.effect).toEqual({ type: 'schedule' });
  expect(r.state.status).toBe('pending');
  const next = autosave(r.state, { type: 'idle', text: 'b2', errors: 0 });
  expect(next.effect).toEqual({
    type: 'save',
    file: 'p/a.yaml',
    baseHash: 'h1',
    from: 'b1',
    to: 'b2',
  });
});
test('a stale save pauses autosave until the user chooses; then it resumes on the new base', () => {
  let { state } = run([
    open,
    { type: 'edit', text: 'mine' },
    { type: 'idle', text: 'mine', errors: 0 },
    { type: 'stale' },
  ]);
  expect(state.status).toBe('stale');
  expect(saveStateLabel(state, 1)).toBe('Not saved: file changed on disk');
  const blocked = run(
    [
      { type: 'edit', text: 'mine2' },
      { type: 'idle', text: 'mine2', errors: 0 },
    ],
    state,
  );
  expect(blocked.effects).toEqual([null, null]);
  expect(blocked.state.status).toBe('stale');
  const kept = run(
    [
      { type: 'resolved', hash: 'disk', text: 'theirs' },
      { type: 'idle', text: 'mine2', errors: 0 },
    ],
    blocked.state,
  );
  expect(kept.effects[0]).toEqual({ type: 'schedule' });
  expect(kept.effects[1]).toEqual({
    type: 'save',
    file: 'p/a.yaml',
    baseHash: 'disk',
    from: 'theirs',
    to: 'mine2',
  });
});
test('a failed save is reported and retried on the next edit', () => {
  let { state } = run([
    open,
    { type: 'edit', text: 'c' },
    { type: 'idle', text: 'c', errors: 0 },
    { type: 'failed', message: 'disk full' },
  ]);
  expect(state.status).toBe('failed');
  expect(saveStateLabel(state, 0)).toBe('Not saved: disk full');
  const r = run(
    [
      { type: 'edit', text: 'cc' },
      { type: 'idle', text: 'cc', errors: 0 },
    ],
    state,
  );
  expect(r.effects[1]).toMatchObject({ type: 'save', to: 'cc' });
});
test('delete, move or trash cancels the pending save; a late result is ignored', () => {
  let { state } = run([
    open,
    { type: 'edit', text: 'd' },
    { type: 'idle', text: 'd', errors: 0 },
    { type: 'cancel' },
  ]);
  expect(state.status).toBe('cancelled');
  const late = autosave(state, { type: 'saved', text: 'd', hash: 'h9', at: 1 });
  expect(late.state.status).toBe('cancelled');
  expect(late.state.baseHash).toBe('h0');
  const r = run(
    [
      { type: 'edit', text: 'dd' },
      { type: 'idle', text: 'dd', errors: 0 },
    ],
    state,
  );
  expect(r.effects).toEqual([null, null]);
});
test('during a Git operation the save waits, then resumes and re-checks the base on the server', () => {
  let { state, effects } = run([
    open,
    { type: 'git', busy: true },
    { type: 'edit', text: 'e' },
    { type: 'idle', text: 'e', errors: 0 },
  ]);
  expect(effects[3]).toBeNull();
  expect(state.status).toBe('waiting');
  const r = run(
    [
      { type: 'git', busy: false },
      { type: 'idle', text: 'e', errors: 0 },
    ],
    state,
  );
  expect(r.effects[0]).toEqual({ type: 'schedule' });
  expect(r.effects[1]).toMatchObject({ type: 'save', baseHash: 'h0', to: 'e' });
});
test('the disk is followed only when there are no unsaved edits', () => {
  const clean = autosave(run([open]).state, { type: 'external', hash: 'h5', text: 'z' });
  expect(clean.state).toMatchObject({ baseHash: 'h5', savedText: 'z', text: 'z' });
  const { state } = run([open, { type: 'edit', text: 'mine' }]);
  expect(autosave(state, { type: 'external', hash: 'h5', text: 'z' }).state).toBe(state);
});
test('labels', () => {
  expect(saveStateLabel({ ...initialAutosave, status: 'saved' }, 3)).toBe(
    'Saved to file · 3 uncommitted changes',
  );
  expect(saveStateLabel({ ...initialAutosave, status: 'saved' }, 1)).toBe(
    'Saved to file · 1 uncommitted change',
  );
  expect(saveStateLabel({ ...initialAutosave, status: 'saving' }, 1)).toBe('Saving…');
});
