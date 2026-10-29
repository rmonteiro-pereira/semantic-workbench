// Tests queued automatic saves, stale versions and cancellation.
import { test, expect } from 'bun:test';
import { autosave, initialAutosave, isDirty, saveStateLabel, saveNeedsAction, saveStateShortLabel, type AutosaveEvent, type AutosaveState } from '../src/app/projects/autosave';
// The autosave state machine: pending → saving → saved/stale/failed/invalid, one save in flight,
// queued text saved on the returned hash, cancel on delete/move, wait for Git.
const run = (events: AutosaveEvent[], state: AutosaveState = initialAutosave) => {
  const effects: any[] = [];
  for (const event of events) {
    const step = autosave(state, event);
    state = step.state;
    effects.push(step.effect);
  }
  return { state, effects };
};
const open: AutosaveEvent = { type: 'open', file: 'p/a.yaml', hash: 'h0', text: 'a: 1\n' };
test('a valid edit is saved after the pause, from the saved text to the new text on the base hash', () => {
  const { state, effects } = run([open, { type: 'edit', text: 'a: 2\n' }, { type: 'idle', text: 'a: 2\n', errors: 0 }]);
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
  const { state, effects } = run([open, { type: 'edit', text: 'a: [' }, { type: 'idle', text: 'a: [', errors: 2 }]);
  expect(effects[2]).toBeNull();
  expect(state.status).toBe('invalid');
  expect(state.errors).toBe(2);
  expect(saveStateLabel(state, 0)).toBe('Not saved: 2 errors');
  // Repaired: saved on the next pause.
  const trace = run(
    [
      { type: 'edit', text: 'a: 3\n' },
      { type: 'idle', text: 'a: 3\n', errors: 0 },
    ],
    state,
  );
  expect(trace.effects[1]).toMatchObject({ type: 'save', from: 'a: 1\n', to: 'a: 3\n' });
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
  let { state } = run([open, { type: 'edit', text: 'b1' }, { type: 'idle', text: 'b1', errors: 0 }, { type: 'edit', text: 'b2' }, { type: 'idle', text: 'b2', errors: 0 }]);
  expect(state.inFlight).toBe('b1');
  expect(state.status).toBe('saving');
  const afterSave = autosave(state, { type: 'saved', text: 'b1', hash: 'h1', at: 1 });
  expect(afterSave.effect).toEqual({ type: 'schedule' });
  expect(afterSave.state.status).toBe('pending');
  const next = autosave(afterSave.state, { type: 'idle', text: 'b2', errors: 0 });
  expect(next.effect).toEqual({
    type: 'save',
    file: 'p/a.yaml',
    baseHash: 'h1',
    from: 'b1',
    to: 'b2',
  });
});
test('a stale save pauses autosave until the user chooses; then it resumes on the new base', () => {
  let { state } = run([open, { type: 'edit', text: 'mine' }, { type: 'idle', text: 'mine', errors: 0 }, { type: 'stale' }]);
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
  let { state } = run([open, { type: 'edit', text: 'c' }, { type: 'idle', text: 'c', errors: 0 }, { type: 'failed', message: 'disk full' }]);
  expect(state.status).toBe('failed');
  expect(saveStateLabel(state, 0)).toBe('Not saved: disk full');
  const trace = run(
    [
      { type: 'edit', text: 'cc' },
      { type: 'idle', text: 'cc', errors: 0 },
    ],
    state,
  );
  expect(trace.effects[1]).toMatchObject({ type: 'save', to: 'cc' });
});
test('delete, move or trash cancels the pending save; a late result is ignored', () => {
  let { state } = run([open, { type: 'edit', text: 'd' }, { type: 'idle', text: 'd', errors: 0 }, { type: 'cancel' }]);
  expect(state.status).toBe('cancelled');
  const late = autosave(state, { type: 'saved', text: 'd', hash: 'h9', at: 1 });
  expect(late.state.status).toBe('cancelled');
  expect(late.state.baseHash).toBe('h0');
  const trace = run(
    [
      { type: 'edit', text: 'dd' },
      { type: 'idle', text: 'dd', errors: 0 },
    ],
    state,
  );
  expect(trace.effects).toEqual([null, null]);
});
test('during a Git operation the save waits, then resumes and re-checks the base on the server', () => {
  let { state, effects } = run([open, { type: 'git', busy: true }, { type: 'edit', text: 'e' }, { type: 'idle', text: 'e', errors: 0 }]);
  expect(effects[3]).toBeNull();
  expect(state.status).toBe('waiting');
  const trace = run(
    [
      { type: 'git', busy: false },
      { type: 'idle', text: 'e', errors: 0 },
    ],
    state,
  );
  expect(trace.effects[0]).toEqual({ type: 'schedule' });
  expect(trace.effects[1]).toMatchObject({ type: 'save', baseHash: 'h0', to: 'e' });
});
test('the disk is followed only when there are no unsaved edits', () => {
  const clean = autosave(run([open]).state, { type: 'external', hash: 'h5', text: 'z' });
  expect(clean.state).toMatchObject({ baseHash: 'h5', savedText: 'z', text: 'z' });
  const { state } = run([open, { type: 'edit', text: 'mine' }]);
  expect(autosave(state, { type: 'external', hash: 'h5', text: 'z' }).state).toBe(state);
});
test('labels', () => {
  expect(saveStateLabel({ ...initialAutosave, status: 'saved' }, 3)).toBe('Saved to file · 3 uncommitted changes');
  expect(saveStateLabel({ ...initialAutosave, status: 'saved' }, 1)).toBe('Saved to file · 1 uncommitted change');
  expect(saveStateLabel({ ...initialAutosave, status: 'saving' }, 1)).toBe('Saving…');
});
test('the short label says only "Saved" when nothing waits to be committed', () => {
  const saved = { ...initialAutosave, status: 'saved' as const };
  expect(saveStateShortLabel(saved, 0)).toBe('Saved');
  expect(saveStateShortLabel(saved, 3)).toBe('Saved · 3 to commit');
  expect(saveStateShortLabel({ ...saved, status: 'saving' }, 3)).toBe('Saving…');
  expect(saveStateShortLabel({ ...saved, status: 'stale' }, 0)).toBe('Not saved: file changed on disk');
});
test('only the Not saved states ask to be read', () => {
  for (const status of ['clean', 'pending', 'saving', 'saved'] as const) {
    expect(saveNeedsAction(status)).toBe(false);
  }
  for (const status of ['invalid', 'stale', 'failed', 'waiting', 'cancelled'] as const) {
    expect(saveNeedsAction(status)).toBe(true);
  }
});
test('stored text that differs from the sent text is followed unless something was typed since', () => {
  const saving = run([open, { type: 'edit', text: 'status: approved\n' }, { type: 'idle', text: 'status: approved\n', errors: 0 }]).state;
  const stored = { type: 'saved', text: 'status: proposed\n', hash: 'h1', at: 1 } as const;
  const followed = autosave(saving, stored);
  expect(followed.state).toMatchObject({
    status: 'saved',
    text: 'status: proposed\n',
    savedText: 'status: proposed\n',
  });
  expect(followed.effect).toBeNull();
  const typed = autosave(saving, { type: 'edit', text: 'status: approved\nmore\n' }).state;
  const kept = autosave(typed, stored);
  expect(kept.state.text).toBe('status: approved\nmore\n');
  expect(kept.effect).toEqual({ type: 'schedule' });
});
test('text typed during a demoted save gets the same demotion, so the next save is accepted', () => {
  const metric = (status: string, expression: string) =>
    [
      'name: m',
      'datasets: [{name: d, source: s}]',
      'metrics:',
      '  - name: revenue',
      `    expression: ${expression}`,
      '    custom_extensions:',
      '      - vendor_name: SEMANTIC_WORKBENCH',
      '        data: |',
      `          {"schema": "semantic-workbench/metric/v1", "type": "simple", "status": "${status}"}`,
      '',
    ].join('\n');
  const sent = metric('approved', 'SUM(a) * 2');
  const typed = metric('approved', 'SUM(a) * 3');
  const opened = {
    type: 'open',
    file: 'p/m.yaml',
    hash: 'h0',
    text: metric('approved', 'SUM(a)'),
  };
  const saving = run([opened as AutosaveEvent, { type: 'edit', text: sent }, { type: 'idle', text: sent, errors: 0 }, { type: 'edit', text: typed }]).state;
  const demoted = [{ file: 'm.yaml', pointer: '/metrics/0', metric: 'revenue' }];
  const stored = metric('proposed', 'SUM(a) * 2');
  const next = autosave(saving, { type: 'saved', text: stored, hash: 'h1', at: 1, demoted });
  expect(next.state.text).toBe(metric('proposed', 'SUM(a) * 3'));
  expect(next.state.savedText).toBe(stored);
  expect(next.effect).toEqual({ type: 'schedule' });
});
