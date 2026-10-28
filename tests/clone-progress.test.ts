// Exercises clone events arriving before or after the server's start response.
import { expect, test } from 'bun:test';
import { cloneProgressReducer, initialCloneProgress } from '../src/app/scm/clone-progress';
import type { CloneEvent } from '../src/app/projects/api';

const operation = { op: 'clone-one', name: 'Orders' };
const failure: CloneEvent = {
  op: operation.op,
  name: operation.name,
  phase: 'failed',
  message: 'Folder missing.',
  missingFolder: 'semantic/none',
};

test('a terminal event received before the start response remains visible', () => {
  const early = cloneProgressReducer(initialCloneProgress, { type: 'progress', event: failure });
  expect(early.operation).toBeNull();
  const started = cloneProgressReducer(early, { type: 'started', operation });
  expect(started.progress).toEqual(failure);
});

test('a terminal event after the start response replaces the running state', () => {
  const started = cloneProgressReducer(initialCloneProgress, { type: 'started', operation });
  expect(started.progress?.phase).toBe('cloning');
  const finished = cloneProgressReducer(started, { type: 'progress', event: failure });
  expect(finished.progress).toEqual(failure);
});

test('events for another operation do not replace the active clone', () => {
  const started = cloneProgressReducer(initialCloneProgress, { type: 'started', operation });
  const unrelated: CloneEvent = {
    op: 'another-clone',
    phase: 'done',
    repo: 'another',
    definitions: 0,
    hasCommits: true,
  };
  const updated = cloneProgressReducer(started, { type: 'progress', event: unrelated });
  expect(updated.operation).toEqual(operation);
  expect(updated.progress).toEqual(started.progress);
});

test('retrying a missing folder starts the new operation without the old failure', () => {
  const early = cloneProgressReducer(initialCloneProgress, { type: 'progress', event: failure });
  const failed = cloneProgressReducer(early, { type: 'started', operation });
  const retry = { op: 'clone-retry', name: operation.name };
  const started = cloneProgressReducer(failed, { type: 'started', operation: retry });
  expect(started.progress).toEqual({ ...retry, phase: 'cloning' });
  const stale = cloneProgressReducer(started, { type: 'progress', event: failure });
  expect(stale.progress).toEqual(started.progress);
});

test('Edit details forgets the failed operation so the form can be shown again', () => {
  const started = cloneProgressReducer(initialCloneProgress, { type: 'started', operation });
  const failed = cloneProgressReducer(started, { type: 'progress', event: failure });
  expect(failed.progress?.phase).toBe('failed');
  expect(cloneProgressReducer(failed, { type: 'reset' })).toEqual(initialCloneProgress);
});
