// Tests how the recorder groups changes into steps and brings back state across screens.
import { expect, test } from 'bun:test';
import { createActionRecorder, type StateRegistration } from '../src/app/action-recorder';

function createFixture() {
  const deferred: (() => void)[] = [];
  const mirrored: number[] = [];
  const recorder = createActionRecorder({
    defer: run => void deferred.push(run),
    applyAtomically: run => run(),
    mirrorStep: position => void mirrored.push(position),
  });
  // Ends the current event, which closes the open click and the replay in progress.
  const endEvent = () => {
    while (deferred.length > 0) deferred.shift()!();
  };
  return { recorder, endEvent, mirrored };
}

// A fake piece of component state that the recorder can restore.
function fakeState(initial: string) {
  const state = { value: initial, restored: [] as unknown[] };
  const registration: StateRegistration = {
    read: () => state.value,
    restore: value => {
      state.value = value as string;
      state.restored.push(value);
    },
  };
  return { state, registration };
}

test('one click with three changes gives one step', () => {
  const { recorder, endEvent, mirrored } = createFixture();
  recorder.openGroup('');
  recorder.noteSet('a', 1, 2);
  recorder.noteSet('b', 1, 2);
  recorder.noteSet('c', 1, 2);
  endEvent();
  expect(recorder.snapshot().steps).toHaveLength(1);
  expect(mirrored).toEqual([1]);
});

test('unmount and remount in one click gives the old value back on undo', () => {
  const { recorder, endEvent } = createFixture();
  const first = fakeState('old');
  recorder.mount('screen', first.registration);
  recorder.openGroup('');
  recorder.unmount('screen', first.registration, 'old');
  const second = fakeState('fresh');
  recorder.mount('screen', second.registration);
  endEvent();
  recorder.travelTo(0);
  expect(recorder.restoredValue('screen', () => 'fallback')).toBe('old');
});

test('a state that mounts after replay ends picks up the staged value', () => {
  const { recorder, endEvent } = createFixture();
  recorder.openGroup('');
  recorder.noteSet('late', 'before', 'after');
  endEvent();
  recorder.travelTo(0);
  endEvent();
  expect(recorder.isReplaying()).toBe(false);
  expect(recorder.restoredValue('late', () => 'fallback')).toBe('before');
  expect(recorder.restoredValue('late', () => 'fallback')).toBe('fallback');
});

test('setters during replay are ignored', () => {
  const { recorder, endEvent } = createFixture();
  recorder.openGroup('');
  recorder.noteSet('x', 1, 2);
  endEvent();
  recorder.travelTo(0);
  expect(recorder.isReplaying()).toBe(true);
  recorder.openGroup('');
  recorder.noteSet('y', 1, 2);
  endEvent();
  expect(recorder.snapshot().steps).toHaveLength(1);
});

test('an action outside a click records a step', () => {
  const { recorder, endEvent } = createFixture();
  const result = recorder.act('async result', () => {
    recorder.noteSet('z', 'a', 'b');
    return 42;
  });
  endEvent();
  expect(result).toBe(42);
  expect(recorder.snapshot().steps.map(step => step.label)).toEqual(['async result']);
});

test('a position older than the kept steps cannot be reached', () => {
  const { recorder, endEvent } = createFixture();
  for (let index = 0; index < 201; index++) {
    recorder.openGroup('');
    recorder.noteSet('n', index, index + 1);
    endEvent();
  }
  expect(recorder.travelTo(0)).toBe(false);
  expect(recorder.travelTo(150)).toBe(true);
});
