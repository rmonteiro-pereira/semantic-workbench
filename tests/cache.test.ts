// Tests cached parsing and stable comparison of blank nodes.
import { LOCAL_READER } from '../src/server/projects/reader';
import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { rmSync, writeFileSync } from 'node:fs';
import { CACHE_VERSION, createCache } from '../src/server/projects/cache';
import { testWorkspace, example } from './helpers/temp-data-dir';
// Rdflib numbers blank nodes with a process-wide counter, so their labels differ between parses in
// one process (not between restarts); compare them by position only.
const snapshot = (ws: Awaited<ReturnType<typeof testWorkspace>>['ws']) =>
  ws.cache.files().map(cachedFile => ({
    ...cachedFile,
    indexedAt: '',
    entities: ws.cache.entities(cachedFile.project, cachedFile.path).map(e => (e.kind === 'Blank node' ? { ...e, id: '_:b', name: '_:b' } : e)),
    findings: ws.cache.findings(cachedFile.project, cachedFile.path),
  }));
test('deleting cache.sqlite and reopening rebuilds identical files, entities and findings', async () => {
  const workspace = await testWorkspace();
  try {
    await workspace.seed(
      [
        { path: 'ubl.ontology.yaml', source: await example('ubl', 'ubl.ontology.yaml') },
        { path: 'commerce.owl', source: await example('commerce', 'commerce.owl') },
      ],
      'UBL',
    );
    writeFileSync(`${workspace.root}/projects/ubl/notes.txt`, 'x');
    await workspace.ws.rescan('ubl');
    await workspace.seed(
      [
        {
          path: 'tpcds.yaml',
          source: await Bun.file('tests/fixtures/ossie-mapping/tpcds_semantic_model.yaml').text(),
        },
      ],
      'TPC-DS',
    );
    workspace.ws.state.writeView('ubl', { 'ubl.ontology.yaml': { mode: 'types' } });
    workspace.ws.state.writeDraft('ubl', 'commerce.owl', {
      baseHash: null,
      text: 'draft',
      patches: [],
    });
    const before = snapshot(workspace.ws);
    const registry = workspace.ws.state.registry();
    expect(before.length).toBe(4);
    expect(before.some(f => f.findings.length)).toBe(true);
    workspace.ws.close();
    for (const sqliteSuffix of ['', '-wal', '-shm']) rmSync(workspace.ws.layout.cache + sqliteSuffix, { force: true });
    const again = await testWorkspace({ root: workspace.root });
    try {
      expect(again.ws.cache.rebuilt).toBe(true);
      expect(snapshot(again.ws)).toEqual(before);
      expect(again.ws.state.registry()).toEqual(registry);
      expect(again.ws.grouping('ubl/ubl.ontology.yaml', LOCAL_READER)).toEqual({ mode: 'types' });
      expect(again.ws.state.draft('ubl', 'commerce.owl')!.text).toBe('draft');
    } finally {
      again.ws.close();
    }
  } finally {
    workspace.dispose();
  }
});
test('a user_version mismatch or a corrupt file triggers a rebuild', () => {
  const cachePath = `/tmp/workbench-cache-${crypto.randomUUID()}.sqlite`;
  try {
    const cache = createCache(cachePath);
    expect(cache.rebuilt).toBe(true);
    cache.put(
      {
        project: 'p',
        path: 'a',
        hash: 'h',
        serialization: 'yaml',
        docType: 'x',
        layout: null,
        valid: true,
        visible: true,
        gitState: 'clean',
        indexedAt: 't',
      },
      [],
      [],
    );
    cache.close();
    const kept = createCache(cachePath);
    expect(kept.rebuilt).toBe(false);
    expect(kept.files()).toHaveLength(1);
    kept.close();
    const db = new Database(cachePath);
    db.exec(`PRAGMA user_version=${CACHE_VERSION + 1}`);
    db.close();
    const bumped = createCache(cachePath);
    expect(bumped.rebuilt).toBe(true);
    expect(bumped.files()).toHaveLength(0);
    bumped.close();
    for (const suffix of ['', '-wal', '-shm']) rmSync(cachePath + suffix, { force: true });
    writeFileSync(cachePath, 'this is not a database');
    const corrupt = createCache(cachePath);
    expect(corrupt.rebuilt).toBe(true);
    expect(corrupt.files()).toHaveLength(0);
    corrupt.close();
  } finally {
    for (const suffix of ['', '-wal', '-shm']) rmSync(cachePath + suffix, { force: true });
  }
});
