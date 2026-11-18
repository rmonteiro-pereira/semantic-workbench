// Checks that the proposal record survives a reload, refuses a format it does not know and keeps
// the old file when a write is interrupted.
import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProposalRecord } from '../src/shared/proposals/proposal';
import { dataLayout } from '../src/server/projects/paths';
import { createProposalStore, ProposalStateError } from '../src/server/projects/proposal-store';
import { atomicWrite } from '../src/server/projects/atomic';
import { tempDataDir } from './helpers/temp-data-dir';

const record = (id: string): ProposalRecord => ({
  id,
  name: `Proposal ${id}`,
  projects: ['sales'],
  base: 'a'.repeat(40),
  createdBy: 'alice',
  createdByName: 'Alice',
  createdAt: '2026-11-17T10:00:00.000Z',
  status: 'open',
  contributors: [],
});

test('a repository without proposals reads as empty and records survive a reload', () => {
  const data = tempDataDir();
  try {
    const layout = dataLayout(data.root);
    const store = createProposalStore(layout);
    expect(store.read('shared')).toEqual([]);
    store.write('shared', [record('one'), record('two')]);
    const reloaded = createProposalStore(dataLayout(data.root));
    expect(reloaded.read('shared').map(stored => stored.id)).toEqual(['one', 'two']);
    expect(store.read('other')).toEqual([]);
    expect(JSON.parse(readFileSync(join(layout.proposals, 'shared.json'), 'utf8')).formatVersion).toBe(1);
  } finally {
    data.cleanup();
  }
});

test('an unsupported or damaged file is refused and left as it is', () => {
  const data = tempDataDir();
  try {
    const layout = dataLayout(data.root);
    mkdirSync(layout.proposals, { recursive: true });
    for (const content of [{ formatVersion: 2, proposals: [] }, { formatVersion: 1 }, 'text']) {
      const path = join(layout.proposals, 'shared.json');
      writeFileSync(path, JSON.stringify(content));
      expect(() => createProposalStore(layout).read('shared')).toThrow(ProposalStateError);
      expect(readFileSync(path, 'utf8')).toBe(JSON.stringify(content));
    }
  } finally {
    data.cleanup();
  }
});

test('a folder name that could leave the proposals folder is refused', () => {
  const data = tempDataDir();
  try {
    const store = createProposalStore(dataLayout(data.root));
    for (const name of ['', '.hidden', '../escape', 'a/b', 'a\\b']) expect(() => store.read(name), name).toThrow(ProposalStateError);
  } finally {
    data.cleanup();
  }
});

test('a write interrupted before the rename leaves the previous records readable', () => {
  const data = tempDataDir();
  try {
    const layout = dataLayout(data.root);
    const store = createProposalStore(layout);
    store.write('shared', [record('one')]);
    // The store writes through the atomic writer, so a stop before the rename is simulated there.
    const interrupted = () =>
      atomicWrite(join(layout.proposals, 'shared.json'), JSON.stringify({ formatVersion: 1, proposals: [] }), {
        beforeRename: () => {
          throw new Error('stopped');
        },
      });
    expect(interrupted).toThrow('stopped');
    expect(store.read('shared').map(stored => stored.id)).toEqual(['one']);
  } finally {
    data.cleanup();
  }
});
