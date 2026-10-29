// Tests migration from the SQLite workspace to the folder store.
import { LOCAL_READER } from '../src/server/projects/reader';
import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../src/server/projects/atomic';
import { MIGRATION_COMMIT } from '../src/server/projects/migration';
import { tempDataDir, testWorkspace, example } from './helpers/temp-data-dir';
// A v0.1.0 workspace, created with the exact v0.1.0 schema. The connection stays open with
// automatic checkpoints off, so the documents live only in the WAL file, as in a real workspace.
const V010_SCHEMA =
  'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,filename TEXT NOT NULL,source TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated TEXT NOT NULL); CREATE TABLE IF NOT EXISTS entities(document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,id TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(document_id,id)); CREATE TABLE IF NOT EXISTS document_views(document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,grouping TEXT NOT NULL)';
async function legacyWorkspace() {
  const dataDir = tempDataDir();
  const db = new Database(join(dataDir.root, 'workbench.sqlite'), { create: true });
  db.exec('PRAGMA wal_autocheckpoint=0');
  db.exec(V010_SCHEMA);
  const docs = [
    {
      id: 'u-ont',
      filename: 'ubl.ontology.yaml',
      source: await example('ubl', 'ubl.ontology.yaml'),
    },
    { id: 'u-owl', filename: 'ubl.owl.ttl', source: await example('ubl', 'ubl.owl.ttl') },
    {
      id: 'f-map',
      filename: 'flights.mapping.yaml',
      source: await example('ossie', 'flights.mapping.yaml'),
    },
    {
      id: 'n-1',
      filename: 'notes.yaml',
      source: '# first\r\nname: N\r\nontology: [{concept: A}]\r\n',
    },
    {
      id: 'n-2',
      filename: 'notes.yaml',
      source: 'name: N2\nontology: [{concept: B}]\n# ünïcødé ✓\n',
    },
    { id: 'bad', filename: 'broken.yaml', source: 'name: [unclosed' },
  ];
  docs.forEach((doc, i) => db.query('INSERT INTO documents VALUES(?,?,?,1,?)').run(doc.id, doc.filename, doc.source, `2026-10-1${i}T00:00:00.000Z`));
  db.query('INSERT INTO document_views VALUES(?,?)').run(
    'u-ont',
    JSON.stringify({
      mode: 'types',
      assignments: { 'ontology/0': 'custom:A' },
      names: { 'custom:A': 'A' },
    }),
  );
  const files = () =>
    Object.fromEntries(
      readdirSync(dataDir.root)
        .filter(f => f.startsWith('workbench.sqlite'))
        .map(f => [f, sha256(readFileSync(join(dataDir.root, f)))]),
    );
  return { dataDir, db, docs, files };
}
test('v0.1.0 migration backs up, exports byte for byte, verifies, commits and maps legacy ids', async () => {
  const { dataDir, db, docs, files } = await legacyWorkspace();
  try {
    const before = files();
    expect(Object.keys(before)).toContain('workbench.sqlite-wal');
    const workspace = await testWorkspace({ root: dataDir.root });
    try {
      const migrationReport = workspace.ws.migration!;
      expect(migrationReport.status).toBe('completed');
      expect(migrationReport.files).toBe(6);
      expect(migrationReport.verified).toBe(6);
      expect(files()).toEqual(before);
      expect(sha256(readFileSync(migrationReport.backup!))).toBe(before['workbench.sqlite']);
      expect(sha256(readFileSync(migrationReport.backup + '-wal'))).toBe(before['workbench.sqlite-wal']);
      expect(migrationReport.projects).toEqual([
        { slug: 'ubl', name: 'UBL business model', files: 2 },
        { slug: 'flights', name: 'Ossie Flights', files: 1 },
        { slug: 'ungrouped', name: 'Ungrouped', files: 3 },
      ]);
      const registry = workspace.ws.state.registry().projects;
      expect(registry.map(p => [p.slug, p.origin])).toEqual([
        ['ubl', 'example:ubl'],
        ['flights', 'example:flights'],
        ['ungrouped', 'migration'],
      ]);
      const ids = workspace.ws.state.legacyIds().ids;
      expect(ids).toEqual({
        'u-ont': { project: 'ubl', path: 'ubl.ontology.yaml' },
        'u-owl': { project: 'ubl', path: 'ubl.owl.ttl' },
        'f-map': { project: 'flights', path: 'flights.mapping.yaml' },
        'n-1': { project: 'ungrouped', path: 'notes.yaml' },
        'n-2': { project: 'ungrouped', path: 'notes (2).yaml' },
        bad: { project: 'ungrouped', path: 'broken.yaml' },
      });
      for (const doc of docs) {
        const ref = ids[doc.id];
        const stored = (
          db.query('SELECT CAST(source AS BLOB) b FROM documents WHERE id=?').get(doc.id) as {
            b: Uint8Array;
          }
        ).b;
        const written = readFileSync(join(dataDir.root, 'projects', ref.project, ref.path));
        expect(sha256(written)).toBe(sha256(stored));
        expect(written.toString('utf8')).toBe(doc.source);
      }
      for (const slug of ['ubl', 'flights', 'ungrouped']) {
        const log = (await workspace.ws.git.run(join(dataDir.root, 'projects', slug), ['log', '--format=%s'])).stdout.trim().split('\n');
        expect(log).toEqual([MIGRATION_COMMIT]);
        expect((await workspace.ws.git.status(join(dataDir.root, 'projects', slug))).changes).toBe(0);
      }
      expect(workspace.ws.grouping('u-ont', LOCAL_READER)).toEqual({
        mode: 'types',
        assignments: { 'ontology/0': 'custom:A' },
        names: { 'custom:A': 'A' },
      });
      expect(workspace.ws.cache.file('ungrouped', 'broken.yaml')).toMatchObject({
        valid: false,
        visible: true,
      });
      expect(
        workspace.ws
          .documents()
          .map(d => d.id)
          .sort(),
      ).toEqual(['flights/flights.mapping.yaml', 'ubl/ubl.ontology.yaml', 'ubl/ubl.owl.ttl', 'ungrouped/broken.yaml', 'ungrouped/notes (2).yaml', 'ungrouped/notes.yaml']);
      expect(existsSync(join(dataDir.root, 'state', 'journal')) && readdirSync(join(dataDir.root, 'state', 'journal')).length).toBeFalsy();
      expect(readdirSync(join(dataDir.root, 'projects')).sort()).toEqual(['flights', 'ubl', 'ungrouped']);
      workspace.ws.close();
      const again = await testWorkspace({ root: dataDir.root });
      expect(again.ws.migration).toBeNull();
      expect(readdirSync(join(dataDir.root, 'backup')).sort()).toEqual([migrationReport.backup!, migrationReport.backup + '-shm', migrationReport.backup + '-wal'].map(p => p.split('/').pop()!));
      again.ws.close();
    } finally {
      workspace.ws.close();
    }
  } finally {
    db.close();
    dataDir.cleanup();
  }
});
test('a failed verification stops the migration and changes nothing but the backup', async () => {
  const { dataDir, db, files } = await legacyWorkspace();
  try {
    const before = files();
    let writes = 0;
    const workspace = await testWorkspace({
      root: dataDir.root,
      migrationHooks: {
        afterWrite: file => {
          if (++writes === 4) writeFileSync(file, 'tampered');
        },
      },
    });
    try {
      expect(workspace.ws.migration!.status).toBe('failed');
      expect(workspace.ws.migration!.reason).toContain('Verification failed');
      expect(files()).toEqual(before);
      expect(readdirSync(join(dataDir.root, 'projects'))).toEqual([]);
      expect(workspace.ws.state.hasRegistry()).toBe(false);
      expect(existsSync(join(dataDir.root, 'state', 'legacy-ids.json'))).toBe(false);
      expect(readdirSync(join(dataDir.root, 'state')).filter(f => f.startsWith('.staging'))).toEqual([]);
      expect(readdirSync(join(dataDir.root, 'backup')).length).toBeGreaterThan(0);
    } finally {
      workspace.ws.close();
    }
  } finally {
    db.close();
    dataDir.cleanup();
  }
});
test('migration waits for Git and an identity instead of creating projects without history', async () => {
  const { dataDir, db, files } = await legacyWorkspace();
  try {
    const before = files();
    const workspace = await testWorkspace({
      root: dataDir.root,
      gitBinary: join(dataDir.root, 'no-git'),
    });
    try {
      expect(workspace.ws.migration).toMatchObject({ status: 'postponed' });
      expect(workspace.ws.migration!.reason).toContain('Git');
      expect(files()).toEqual(before);
      expect(workspace.ws.state.hasRegistry()).toBe(false);
      expect(readdirSync(join(dataDir.root, 'backup'))).toEqual([]);
    } finally {
      workspace.ws.close();
    }
  } finally {
    db.close();
    dataDir.cleanup();
  }
});
test('after a failed migration, projects created meanwhile are kept and the next start still migrates', async () => {
  const { dataDir, db } = await legacyWorkspace();
  try {
    let writes = 0;
    const first = await testWorkspace({
      root: dataDir.root,
      migrationHooks: {
        afterWrite: file => {
          if (++writes === 1) writeFileSync(file, 'tampered');
        },
      },
    });
    expect(first.ws.migration!.status).toBe('failed');
    await first.ws.importBatch(
      {
        name: 'UBL business model',
        files: [{ path: 'mine.yaml', source: 'name: Mine\nontology: [{concept: M}]\n' }],
      },
      LOCAL_READER,
    );
    first.ws.close();
    const second = await testWorkspace({ root: dataDir.root });
    try {
      expect(second.ws.migration!.status).toBe('completed');
      expect(second.ws.state.registry().projects.map(p => [p.slug, p.name])).toEqual([
        ['ubl-business-model', 'UBL business model'],
        ['ubl', 'UBL business model (2)'],
        ['flights', 'Ossie Flights'],
        ['ungrouped', 'Ungrouped'],
      ]);
      expect(second.ws.documents()).toHaveLength(7);
    } finally {
      second.ws.close();
    }
    const third = await testWorkspace({ root: dataDir.root });
    expect(third.ws.migration).toBeNull();
    third.ws.close();
  } finally {
    db.close();
    dataDir.cleanup();
  }
});
