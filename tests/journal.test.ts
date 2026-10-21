import { test, expect } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteJson } from '../server/projects/atomic';
import { createJournal } from '../server/projects/journal';
import { dataLayout } from '../server/projects/paths';
import { tempDataDir } from './helpers/temp-data-dir';
function setup() {
  const d = tempDataDir(),
    layout = dataLayout(d.root);
  mkdirSync(layout.journal, { recursive: true });
  mkdirSync(join(d.root, 's'), { recursive: true });
  return { d, layout, j: createJournal(layout), f: (p: string) => join(d.root, p) };
}
const unfinished = (
  layout: ReturnType<typeof dataLayout>,
  steps: { from: string; to: string; done: boolean }[],
) =>
  atomicWriteJson(join(layout.journal, 'op-1.json'), {
    formatVersion: 1,
    opId: 'op-1',
    kind: 'move',
    steps: steps.map(s => ({ action: 'rename', ...s })),
    cleanup: ['s/tmp'],
    startedAt: 't',
  });
test('run performs every rename and removes the journal and staging', () => {
  const { d, layout, j, f } = setup();
  try {
    writeFileSync(f('s/a'), 'A');
    writeFileSync(f('s/b'), 'B');
    mkdirSync(f('s/tmp'));
    j.run(
      'move',
      [
        { from: f('s/a'), to: f('x/a') },
        { from: f('s/b'), to: f('x/b') },
      ],
      [f('s/tmp')],
    );
    expect(readFileSync(f('x/a'), 'utf8')).toBe('A');
    expect(readFileSync(f('x/b'), 'utf8')).toBe('B');
    expect(existsSync(f('s/tmp'))).toBe(false);
    expect(readdirSync(layout.journal)).toEqual([]);
  } finally {
    d.cleanup();
  }
});
test('run moves completed steps back when a later step fails', () => {
  const { d, layout, j, f } = setup();
  try {
    writeFileSync(f('s/a'), 'A');
    writeFileSync(f('s/b'), 'B');
    mkdirSync(f('x'));
    writeFileSync(f('x/b'), 'occupied');
    expect(() =>
      j.run('move', [
        { from: f('s/a'), to: f('x/a') },
        { from: f('s/b'), to: f('x/b') },
      ]),
    ).toThrow('already exists');
    expect(readFileSync(f('s/a'), 'utf8')).toBe('A');
    expect(existsSync(f('x/a'))).toBe(false);
    expect(readFileSync(f('x/b'), 'utf8')).toBe('occupied');
    expect(readdirSync(layout.journal)).toEqual([]);
  } finally {
    d.cleanup();
  }
});
test('recovery rolls an unfinished operation forward when sources exist and destinations are free', () => {
  const { d, layout, j, f } = setup();
  try {
    mkdirSync(f('x'));
    writeFileSync(f('x/a'), 'A');
    writeFileSync(f('s/b'), 'B');
    mkdirSync(f('s/tmp'));
    unfinished(layout, [
      { from: 's/a', to: 'x/a', done: true },
      { from: 's/b', to: 'x/b', done: false },
    ]);
    expect(j.recover()).toEqual([
      { opId: 'op-1', kind: 'move', outcome: 'completed', paths: ['x/a', 'x/b'] },
    ]);
    expect(readFileSync(f('x/b'), 'utf8')).toBe('B');
    expect(existsSync(f('s/tmp'))).toBe(false);
    expect(j.pending()).toEqual([]);
  } finally {
    d.cleanup();
  }
});
test('recovery settles a rename whose done flag was not written yet', () => {
  const { d, layout, j, f } = setup();
  try {
    mkdirSync(f('x'));
    writeFileSync(f('x/a'), 'A');
    writeFileSync(f('s/b'), 'B');
    unfinished(layout, [
      { from: 's/a', to: 'x/a', done: false },
      { from: 's/b', to: 'x/b', done: false },
    ]);
    expect(j.recover()[0].outcome).toBe('completed');
    expect(readFileSync(f('x/a'), 'utf8')).toBe('A');
    expect(readFileSync(f('x/b'), 'utf8')).toBe('B');
  } finally {
    d.cleanup();
  }
});
test('recovery follows a registry swap in order (destination freed by an earlier step)', () => {
  const { d, layout, j, f } = setup();
  try {
    mkdirSync(f('x'));
    writeFileSync(f('x/reg'), 'old');
    writeFileSync(f('s/reg.new'), 'new');
    unfinished(layout, [
      { from: 'x/reg', to: 's/reg.old', done: false },
      { from: 's/reg.new', to: 'x/reg', done: false },
    ]);
    expect(j.recover()[0].outcome).toBe('completed');
    expect(readFileSync(f('x/reg'), 'utf8')).toBe('new');
  } finally {
    d.cleanup();
  }
});
test('recovery rolls back when a destination is occupied, without overwriting it', () => {
  const { d, layout, j, f } = setup();
  try {
    mkdirSync(f('x'));
    writeFileSync(f('x/a'), 'A');
    writeFileSync(f('s/b'), 'B');
    writeFileSync(f('x/b'), 'someone else');
    unfinished(layout, [
      { from: 's/a', to: 'x/a', done: true },
      { from: 's/b', to: 'x/b', done: false },
    ]);
    expect(j.recover()).toEqual([
      { opId: 'op-1', kind: 'move', outcome: 'rolled-back', paths: ['x/a', 'x/b'] },
    ]);
    expect(readFileSync(f('x/b'), 'utf8')).toBe('someone else');
    expect(readFileSync(f('s/a'), 'utf8')).toBe('A');
    expect(existsSync(f('x/a'))).toBe(false);
  } finally {
    d.cleanup();
  }
});
test('recovery rolls back when a source is missing', () => {
  const { d, layout, j, f } = setup();
  try {
    mkdirSync(f('x'));
    writeFileSync(f('x/a'), 'A');
    unfinished(layout, [
      { from: 's/a', to: 'x/a', done: true },
      { from: 's/gone', to: 'x/b', done: false },
    ]);
    expect(j.recover()[0].outcome).toBe('rolled-back');
    expect(readFileSync(f('s/a'), 'utf8')).toBe('A');
    expect(existsSync(f('x/b'))).toBe(false);
  } finally {
    d.cleanup();
  }
});
test('journal paths may not leave the data root', () => {
  const { d, j } = setup();
  try {
    expect(() => j.run('move', [{ from: '/etc/passwd', to: join(d.root, 'x') }])).toThrow(
      'escapes',
    );
  } finally {
    d.cleanup();
  }
});
