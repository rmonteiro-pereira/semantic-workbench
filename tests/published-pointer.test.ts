// Exercises publication state transitions and durable restart behavior without reading a checkout.
import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { classify, createPublishedPointers } from '../src/server/projects/published-pointer';
import { createState } from '../src/server/projects/state';
import { dataLayout } from '../src/server/projects/paths';
import { tempDataDir } from './helpers/temp-data-dir';
const previous = 'a'.repeat(40);
const next = 'b'.repeat(40);
const outside = 'c'.repeat(40);

for (const [ref, pointer, descends, expected] of [
  [null, undefined, false, 'none'],
  [previous, { branch: 'main', commit: previous }, false, 'in-sync'],
  [next, { branch: 'main', commit: previous }, true, 'fast-forward'],
  [outside, { branch: 'main', commit: previous }, false, 'diverged'],
  [null, { branch: 'main', commit: previous }, false, 'diverged'],
  [next, { branch: 'main', commit: previous, intent: next }, false, 'intent-completed'],
  [previous, { branch: 'main', commit: previous, intent: next }, false, 'intent-dropped'],
  [outside, { branch: 'main', commit: previous, intent: next }, true, 'fast-forward'],
  [outside, { branch: 'main', commit: previous, intent: next }, false, 'diverged'],
  [null, { branch: 'main', intent: next }, false, 'intent-dropped'],
  [next, { branch: 'main', intent: next }, false, 'intent-completed'],
] as const) {
  test(`pointer transition ${expected} for ${ref} with intent ${pointer?.intent}`, async () => {
    expect(await classify(ref, pointer, async () => descends)).toBe(expected);
  });
}

test('durable intents are completed or dropped on restart and outside moves remain unserved', async () => {
  mkdirSync(join(tmpdir(), 'sw-008'), { recursive: true });
  const temporary = tempDataDir('sw-008/pointers-');
  const layout = dataLayout(temporary.root);
  mkdirSync(layout.state, { recursive: true });
  try {
    const state = createState(layout);
    const pointers = createPublishedPointers(state);
    pointers.complete('definitions', 'main', previous);
    pointers.intent('definitions', 'main', next);
    const restarted = createPublishedPointers(state);
    expect(await restarted.reconcile('definitions', next, async () => true)).toBe('intent-completed');
    expect(restarted.get('definitions')).toEqual({ branch: 'main', commit: next });
    restarted.intent('definitions', 'main', outside);
    expect(await restarted.reconcile('definitions', next, async () => true)).toBe('intent-dropped');
    expect(restarted.get('definitions')).toEqual({ branch: 'main', commit: next });
    expect(await restarted.reconcile('definitions', outside, async () => false)).toBe('diverged');
    expect(restarted.get('definitions')?.commit).toBe(next);
    expect(JSON.parse(readFileSync(join(layout.state, 'published.json'), 'utf8')).repositories.definitions.commit).toBe(next);
  } finally {
    temporary.cleanup();
  }
});

test('damaged pointer state refuses startup without replacing its bytes', () => {
  mkdirSync(join(tmpdir(), 'sw-008'), { recursive: true });
  const temporary = tempDataDir('sw-008/pointers-');
  const layout = dataLayout(temporary.root);
  mkdirSync(layout.state, { recursive: true });
  const path = join(layout.state, 'published.json');
  try {
    for (const contents of ['{', JSON.stringify({ formatVersion: 1, repositories: { definitions: { branch: 'main', commit: 'HEAD' } } })]) {
      writeFileSync(path, contents);
      expect(() => createPublishedPointers(createState(layout))).toThrow();
      expect(readFileSync(path, 'utf8')).toBe(contents);
    }
  } finally {
    temporary.cleanup();
  }
});
