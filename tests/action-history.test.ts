// Tests the pure action history behind Back and Forward.
import { expect, test } from 'bun:test';
import {
  MAX_ACTIONS,
  back,
  canBack,
  canForward,
  emptyActionHistory,
  forward,
  positionOf,
  record,
  travel,
  type ActionHistory,
  type ActionStep,
} from '../src/app/workspace/action-history';

const step = (label: string): ActionStep => ({ label, undo: () => {}, redo: () => {} });
const recordAll = (labels: string[]): ActionHistory =>
  labels.reduce((history, label) => record(history, step(label)), emptyActionHistory);
const labelsOf = (moves: { step: ActionStep }[]) => moves.map(move => move.step.label);

test('an empty history cannot go back or forward', () => {
  expect(canBack(emptyActionHistory)).toBe(false);
  expect(canForward(emptyActionHistory)).toBe(false);
  expect(back(emptyActionHistory).moves).toEqual([]);
  expect(forward(emptyActionHistory).moves).toEqual([]);
});

test('recording moves the cursor to the newest step', () => {
  const history = recordAll(['a', 'b', 'c']);
  expect(positionOf(history)).toBe(3);
  expect(canBack(history)).toBe(true);
  expect(canForward(history)).toBe(false);
});

test('back undoes the newest step and forward redoes it', () => {
  const history = recordAll(['a', 'b']);
  const undone = back(history);
  expect(undone.moves.map(move => [move.step.label, move.direction])).toEqual([['b', 'undo']]);
  expect(canForward(undone.history)).toBe(true);
  const redone = forward(undone.history);
  expect(redone.moves.map(move => [move.step.label, move.direction])).toEqual([['b', 'redo']]);
  expect(positionOf(redone.history)).toBe(2);
});

test('travelling several steps undoes newest first and redoes oldest first', () => {
  const history = recordAll(['a', 'b', 'c']);
  const down = travel(history, 0);
  expect(labelsOf(down.moves)).toEqual(['c', 'b', 'a']);
  const up = travel(down.history, 3);
  expect(labelsOf(up.moves)).toEqual(['a', 'b', 'c']);
});

test('recording after going back drops the steps that were undone', () => {
  const undone = back(back(recordAll(['a', 'b', 'c'])).history).history;
  const history = record(undone, step('d'));
  expect(history.steps.map(item => item.label)).toEqual(['a', 'd']);
  expect(canForward(history)).toBe(false);
});

test('a position beyond the known steps is clamped', () => {
  const history = recordAll(['a', 'b']);
  expect(travel(history, 99).moves).toEqual([]);
  expect(travel(history, -5).history.cursor).toBe(0);
});

test('the oldest steps are dropped past the limit and positions stay absolute', () => {
  const labels = Array.from({ length: MAX_ACTIONS + 5 }, (_, index) => `s${index}`);
  const history = recordAll(labels);
  expect(history.steps).toHaveLength(MAX_ACTIONS);
  expect(history.dropped).toBe(5);
  expect(positionOf(history)).toBe(MAX_ACTIONS + 5);
  const oldest = travel(history, 0);
  expect(oldest.moves).toHaveLength(MAX_ACTIONS);
  expect(oldest.history.cursor).toBe(0);
  expect(positionOf(oldest.history)).toBe(5);
});
