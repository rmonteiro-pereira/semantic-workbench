// Tests journaled workspace operations and recovery.
import { test, expect } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteJson } from '../src/server/projects/atomic';
import { createJournal } from '../src/server/projects/journal';
import { dataLayout } from '../src/server/projects/paths';
import { tempDataDir } from './helpers/temp-data-dir';
function setup() {
  const dir = tempDataDir();
  const layout = dataLayout(dir.root);
  mkdirSync(layout.journal, { recursive: true });
  mkdirSync(join(dir.root, 's'), { recursive: true });
  return { tempData: dir, layout, journal: createJournal(layout), rootPath: (p: string) => join(dir.root, p) };
}
const unfinished = (layout: ReturnType<typeof dataLayout>, steps: { from: string; to: string; done: boolean }[]) =>
  atomicWriteJson(join(layout.journal, 'op-1.json'), {
    formatVersion: 1,
    opId: 'op-1',
    kind: 'move',
    steps: steps.map(s => ({ action: 'rename', ...s })),
    cleanup: ['s/tmp'],
    startedAt: 't',
  });
test('run performs every rename and removes the journal and staging', () => {
  const { tempData, layout, journal, rootPath } = setup();
  try {
    writeFileSync(rootPath('s/a'), 'A');
    writeFileSync(rootPath('s/b'), 'B');
    mkdirSync(rootPath('s/tmp'));
    journal.run(
      'move',
      [
        { from: rootPath('s/a'), to: rootPath('x/a') },
        { from: rootPath('s/b'), to: rootPath('x/b') },
      ],
      [rootPath('s/tmp')],
    );
    expect(readFileSync(rootPath('x/a'), 'utf8')).toBe('A');
    expect(readFileSync(rootPath('x/b'), 'utf8')).toBe('B');
    expect(existsSync(rootPath('s/tmp'))).toBe(false);
    expect(readdirSync(layout.journal)).toEqual([]);
  } finally {
    tempData.cleanup();
  }
});
test('run moves completed steps back when a later step fails', () => {
  const { tempData, layout, journal, rootPath } = setup();
  try {
    writeFileSync(rootPath('s/a'), 'A');
    writeFileSync(rootPath('s/b'), 'B');
    mkdirSync(rootPath('x'));
    writeFileSync(rootPath('x/b'), 'occupied');
    expect(() =>
      journal.run('move', [
        { from: rootPath('s/a'), to: rootPath('x/a') },
        { from: rootPath('s/b'), to: rootPath('x/b') },
      ]),
    ).toThrow('already exists');
    expect(readFileSync(rootPath('s/a'), 'utf8')).toBe('A');
    expect(existsSync(rootPath('x/a'))).toBe(false);
    expect(readFileSync(rootPath('x/b'), 'utf8')).toBe('occupied');
    expect(readdirSync(layout.journal)).toEqual([]);
  } finally {
    tempData.cleanup();
  }
});
test('recovery rolls an unfinished operation forward when sources exist and destinations are free', () => {
  const { tempData, layout, journal, rootPath } = setup();
  try {
    mkdirSync(rootPath('x'));
    writeFileSync(rootPath('x/a'), 'A');
    writeFileSync(rootPath('s/b'), 'B');
    mkdirSync(rootPath('s/tmp'));
    unfinished(layout, [
      { from: 's/a', to: 'x/a', done: true },
      { from: 's/b', to: 'x/b', done: false },
    ]);
    expect(journal.recover()).toEqual([{ opId: 'op-1', kind: 'move', outcome: 'completed', paths: ['x/a', 'x/b'] }]);
    expect(readFileSync(rootPath('x/b'), 'utf8')).toBe('B');
    expect(existsSync(rootPath('s/tmp'))).toBe(false);
    expect(journal.pending()).toEqual([]);
  } finally {
    tempData.cleanup();
  }
});
test('recovery settles a rename whose done flag was not written yet', () => {
  const { tempData, layout, journal, rootPath } = setup();
  try {
    mkdirSync(rootPath('x'));
    writeFileSync(rootPath('x/a'), 'A');
    writeFileSync(rootPath('s/b'), 'B');
    unfinished(layout, [
      { from: 's/a', to: 'x/a', done: false },
      { from: 's/b', to: 'x/b', done: false },
    ]);
    expect(journal.recover()[0].outcome).toBe('completed');
    expect(readFileSync(rootPath('x/a'), 'utf8')).toBe('A');
    expect(readFileSync(rootPath('x/b'), 'utf8')).toBe('B');
  } finally {
    tempData.cleanup();
  }
});
test('recovery follows a registry swap in order (destination freed by an earlier step)', () => {
  const { tempData, layout, journal, rootPath } = setup();
  try {
    mkdirSync(rootPath('x'));
    writeFileSync(rootPath('x/reg'), 'old');
    writeFileSync(rootPath('s/reg.new'), 'new');
    unfinished(layout, [
      { from: 'x/reg', to: 's/reg.old', done: false },
      { from: 's/reg.new', to: 'x/reg', done: false },
    ]);
    expect(journal.recover()[0].outcome).toBe('completed');
    expect(readFileSync(rootPath('x/reg'), 'utf8')).toBe('new');
  } finally {
    tempData.cleanup();
  }
});
test('recovery rolls back when a destination is occupied, without overwriting it', () => {
  const { tempData, layout, journal, rootPath } = setup();
  try {
    mkdirSync(rootPath('x'));
    writeFileSync(rootPath('x/a'), 'A');
    writeFileSync(rootPath('s/b'), 'B');
    writeFileSync(rootPath('x/b'), 'someone else');
    unfinished(layout, [
      { from: 's/a', to: 'x/a', done: true },
      { from: 's/b', to: 'x/b', done: false },
    ]);
    expect(journal.recover()).toEqual([{ opId: 'op-1', kind: 'move', outcome: 'rolled-back', paths: ['x/a', 'x/b'] }]);
    expect(readFileSync(rootPath('x/b'), 'utf8')).toBe('someone else');
    expect(readFileSync(rootPath('s/a'), 'utf8')).toBe('A');
    expect(existsSync(rootPath('x/a'))).toBe(false);
  } finally {
    tempData.cleanup();
  }
});
test('recovery rolls back when a source is missing', () => {
  const { tempData, layout, journal, rootPath } = setup();
  try {
    mkdirSync(rootPath('x'));
    writeFileSync(rootPath('x/a'), 'A');
    unfinished(layout, [
      { from: 's/a', to: 'x/a', done: true },
      { from: 's/gone', to: 'x/b', done: false },
    ]);
    expect(journal.recover()[0].outcome).toBe('rolled-back');
    expect(readFileSync(rootPath('s/a'), 'utf8')).toBe('A');
    expect(existsSync(rootPath('x/b'))).toBe(false);
  } finally {
    tempData.cleanup();
  }
});
test('journal paths may not leave the data root', () => {
  const { tempData, journal } = setup();
  try {
    expect(() => journal.run('move', [{ from: '/etc/passwd', to: join(tempData.root, 'x') }])).toThrow('escapes');
  } finally {
    tempData.cleanup();
  }
});
