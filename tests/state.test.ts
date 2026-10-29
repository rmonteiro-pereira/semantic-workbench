// Tests persisted workspace state, atomic replacement and format compatibility.
import { test, expect } from 'bun:test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataLayout } from '../src/server/projects/paths';
import { createState } from '../src/server/projects/state';
import { tempDataDir } from './helpers/temp-data-dir';
test('every state file carries formatVersion and round-trips', () => {
  const dataDir = tempDataDir();
  try {
    const layout = dataLayout(dataDir.root);
    const state = createState(layout);
    expect(state.registry()).toEqual({ formatVersion: 1, projects: [] });
    expect(state.hasRegistry()).toBe(false);
    state.writeRegistry([{ slug: 'a', name: 'A', createdAt: 't', origin: 'import' }]);
    expect(state.hasRegistry()).toBe(true);
    expect(JSON.parse(readFileSync(layout.registry, 'utf8'))).toEqual({
      formatVersion: 1,
      projects: [{ slug: 'a', name: 'A', createdAt: 't', origin: 'import' }],
    });
    state.writeView('a', { 'x.yaml': { mode: 'types' } });
    expect(JSON.parse(readFileSync(join(layout.views, 'a.json'), 'utf8'))).toEqual({
      formatVersion: 1,
      files: { 'x.yaml': { mode: 'types' } },
    });
    const draft = state.writeDraft('a', 'dir/x.yaml', {
      baseHash: '0'.repeat(64),
      text: 'a: 1\n',
      patches: [{ from: 0, to: 1, insert: 'b' }],
    });
    expect(draft.formatVersion).toBe(1);
    expect(state.draft('a', 'dir/x.yaml')!.text).toBe('a: 1\n');
    expect(state.drafts()).toHaveLength(1);
    state.deleteDraft('a', 'dir/x.yaml');
    expect(state.draft('a', 'dir/x.yaml')).toBeNull();
    expect(state.drafts()).toHaveLength(0);
    state.writeLegacyIds({ 'uuid-1': { project: 'a', path: 'x.yaml' } });
    expect(state.legacyIds()).toEqual({
      formatVersion: 1,
      ids: { 'uuid-1': { project: 'a', path: 'x.yaml' } },
    });
  } finally {
    dataDir.cleanup();
  }
});
test('state files are replaced atomically and unknown formats are refused', () => {
  const dataDir = tempDataDir();
  try {
    const layout = dataLayout(dataDir.root);
    const state = createState(layout);
    state.writeRegistry([]);
    state.writeRegistry([{ slug: 'b', name: 'B', createdAt: 't', origin: 'import' }]);
    expect(readFileSync(layout.registry, 'utf8').endsWith('\n')).toBe(true);
    mkdirSync(layout.views, { recursive: true });
    writeFileSync(join(layout.views, 'z.json'), JSON.stringify({ formatVersion: 9, files: {} }));
    expect(() => state.view('z')).toThrow('Unsupported');
    expect(() => state.writeDraft('a', '../x', { baseHash: null, text: '', patches: [] })).toThrow();
    expect(() => state.view('../x')).toThrow();
  } finally {
    dataDir.cleanup();
  }
});
