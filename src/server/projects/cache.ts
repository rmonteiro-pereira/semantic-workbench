// Maintains a rebuildable SQLite index of project folders. Missing, incompatible, or corrupt caches
// are recreated from source files.
import { Database } from 'bun:sqlite';
import { rmSync } from 'node:fs';
import type { Issue } from '../../shared/validation/diagnostics';
/** Schema version required for the rebuildable SQLite cache. */
export const CACHE_VERSION = 4;
/** The copy id of the published state, which local mode and Viewers read. */
export const PUBLISHED_COPY = '';
/** Indexed file metadata, validation status, visibility, and Git state. */
export type CachedFile = {
  project: string;
  path: string;
  hash: string;
  serialization: string;
  docType: string;
  layout: string | null;
  valid: boolean;
  visible: boolean;
  gitState: string;
  indexedAt: string;
};
/** An entity identifier, display name, and kind extracted from a file. */
export type CachedEntity = { id: string; name: string; kind: string };
// Files and findings are kept per working copy; entities are kept per blob (content hash and file
// name), so a file with the same bytes in several copies is parsed and stored once.
const SCHEMA = `
CREATE TABLE files(
  copy TEXT NOT NULL, project TEXT NOT NULL, path TEXT NOT NULL, hash TEXT NOT NULL,
  serialization TEXT NOT NULL, doc_type TEXT NOT NULL, layout TEXT, valid INTEGER NOT NULL,
  visible INTEGER NOT NULL, git_state TEXT NOT NULL, indexed_at TEXT NOT NULL,
  PRIMARY KEY(copy, project, path));
CREATE INDEX files_blob ON files(hash, path);
CREATE TABLE entities(
  hash TEXT NOT NULL, name TEXT NOT NULL, id TEXT NOT NULL, entity_name TEXT NOT NULL,
  kind TEXT NOT NULL, PRIMARY KEY(hash, name, id));
CREATE TABLE findings(
  copy TEXT NOT NULL, project TEXT NOT NULL, path TEXT NOT NULL, severity TEXT NOT NULL,
  code TEXT NOT NULL, json_path TEXT NOT NULL, line INTEGER, column INTEGER,
  message TEXT NOT NULL);
CREATE INDEX findings_file ON findings(copy, project, path);
CREATE TABLE suggestions(
  file_project TEXT NOT NULL, file_path TEXT NOT NULL, target TEXT NOT NULL,
  evidence_json TEXT NOT NULL);`;
function open(path: string) {
  const db = new Database(path, { create: true });
  try {
    const version = (db.query('PRAGMA user_version').get() as { user_version: number })
      .user_version;
    const tables = (
      db.query("SELECT count(*) n FROM sqlite_master WHERE type='table'").get() as { n: number }
    ).n;
    if (version === CACHE_VERSION) return { db, rebuilt: false };
    if (version !== 0 || tables) {
      db.close();
      throw Error('stale cache');
    }
    db.exec('PRAGMA journal_mode=WAL;' + SCHEMA + `PRAGMA user_version=${CACHE_VERSION};`);
    return { db, rebuilt: true };
  } catch (e) {
    try {
      db.close();
    } catch {}
    throw e;
  }
}
const row = (r: any): CachedFile => ({
  project: r.project,
  path: r.path,
  hash: r.hash,
  serialization: r.serialization,
  docType: r.doc_type,
  layout: r.layout ?? null,
  valid: !!r.valid,
  visible: !!r.visible,
  gitState: r.git_state,
  indexedAt: r.indexed_at,
});
const finding = (f: any): Issue => ({
  severity: f.severity,
  code: f.code,
  path: f.json_path,
  message: f.message,
  ...(f.line != null ? { line: f.line } : {}),
  ...(f.column != null ? { column: f.column } : {}),
});
const blobName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
// A blob's entities are dropped once no file of any copy holds that blob any more.
function forgetUnusedEntities(db: Database, hashes: string[]) {
  const unused = db.query(
    'DELETE FROM entities WHERE hash=? AND NOT EXISTS (SELECT 1 FROM files WHERE hash=?)',
  );
  for (const hash of new Set(hashes)) unused.run(hash, hash);
}
const hashesOf = (db: Database, where: string, values: string[]) =>
  (db.query(`SELECT DISTINCT hash FROM files WHERE ${where}`).all(...values) as any[]).map(
    r => r.hash as string,
  );
/** The index of one working copy: the same operations for every copy, keyed by its id. */
function copyIndex(db: Database, copy: string) {
  const entitiesOf = (hash: string, path: string) =>
    db
      .query('SELECT id,entity_name name,kind FROM entities WHERE hash=? AND name=? ORDER BY rowid')
      .all(hash, blobName(path)) as CachedEntity[];
  const findingsOf = (project: string, path: string): Issue[] =>
    (
      db
        .query('SELECT * FROM findings WHERE copy=? AND project=? AND path=? ORDER BY rowid')
        .all(copy, project, path) as any[]
    ).map(finding);
  const file = (project: string, path: string) => {
    const r = db
      .query('SELECT * FROM files WHERE copy=? AND project=? AND path=?')
      .get(copy, project, path);
    return r ? row(r) : null;
  };
  return {
    copy,
    file,
    files: (project?: string) =>
      (project === undefined
        ? db.query('SELECT * FROM files WHERE copy=? ORDER BY project,path').all(copy)
        : db
            .query('SELECT * FROM files WHERE copy=? AND project=? ORDER BY path')
            .all(copy, project)
      ).map(row),
    entities: (project: string, path: string) => {
      const indexed = file(project, path);
      return indexed ? entitiesOf(indexed.hash, path) : [];
    },
    entitiesOf,
    findings: findingsOf,
    /** The same blob already parsed under this path in another copy, so it is not parsed again. */
    parsedElsewhere: (project: string, path: string, hash: string) => {
      const r = db
        .query('SELECT * FROM files WHERE project=? AND path=? AND hash=? AND copy<>? LIMIT 1')
        .get(project, path, hash, copy) as any;
      if (!r) return null;
      const findings = (
        db
          .query('SELECT * FROM findings WHERE copy=? AND project=? AND path=? ORDER BY rowid')
          .all(r.copy, project, path) as any[]
      ).map(finding);
      return { file: row(r), findings };
    },
    put: db.transaction((file: CachedFile, entities: CachedEntity[], findings: Issue[]) => {
      const replaced = hashesOf(db, 'copy=? AND project=? AND path=?', [
        copy,
        file.project,
        file.path,
      ]);
      db.query('INSERT OR REPLACE INTO files VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(
        copy,
        file.project,
        file.path,
        file.hash,
        file.serialization,
        file.docType,
        file.layout ?? null,
        file.valid ? 1 : 0,
        file.visible ? 1 : 0,
        file.gitState,
        file.indexedAt,
      );
      db.query('DELETE FROM findings WHERE copy=? AND project=? AND path=?').run(
        copy,
        file.project,
        file.path,
      );
      const name = blobName(file.path);
      db.query('DELETE FROM entities WHERE hash=? AND name=?').run(file.hash, name);
      const entity = db.query('INSERT OR IGNORE INTO entities VALUES(?,?,?,?,?)');
      for (const e of entities) entity.run(file.hash, name, e.id, e.name, e.kind);
      const insert = db.query('INSERT INTO findings VALUES(?,?,?,?,?,?,?,?,?)');
      for (const f of findings)
        insert.run(
          copy,
          file.project,
          file.path,
          f.severity,
          f.code,
          f.path,
          f.line ?? null,
          f.column ?? null,
          f.message,
        );
      forgetUnusedEntities(db, replaced);
    }),
    remove: db.transaction((project: string, path: string) => {
      const removed = hashesOf(db, 'copy=? AND project=? AND path=?', [copy, project, path]);
      for (const t of ['files', 'findings'])
        db.query(`DELETE FROM ${t} WHERE copy=? AND project=? AND path=?`).run(copy, project, path);
      forgetUnusedEntities(db, removed);
    }),
    removeProject: db.transaction((project: string) => {
      const removed = hashesOf(db, 'copy=? AND project=?', [copy, project]);
      for (const t of ['files', 'findings'])
        db.query(`DELETE FROM ${t} WHERE copy=? AND project=?`).run(copy, project);
      if (copy === PUBLISHED_COPY)
        db.query('DELETE FROM suggestions WHERE file_project=?').run(project);
      forgetUnusedEntities(db, removed);
    }),
  };
}
/** The index of one working copy. */
export type CopyIndex = ReturnType<typeof copyIndex>;
/** Opens the cache, rebuilding it when its schema is incompatible or its contents are corrupt. */
export function createCache(path: string) {
  let opened: { db: Database; rebuilt: boolean };
  try {
    opened = open(path);
  } catch {
    for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
    opened = open(path);
    opened.rebuilt = true;
  }
  const db = opened.db;
  return {
    db,
    rebuilt: opened.rebuilt,
    ...copyIndex(db, PUBLISHED_COPY),
    /** The index of one person's working copy, keyed by its folder key. */
    forCopy: (copy: string) => copyIndex(db, copy),
    /** Drops every row of one working copy, for a removed copy. */
    removeCopy: db.transaction((copy: string) => {
      const removed = hashesOf(db, 'copy=?', [copy]);
      for (const t of ['files', 'findings']) db.query(`DELETE FROM ${t} WHERE copy=?`).run(copy);
      forgetUnusedEntities(db, removed);
    }),
    /** Drops one project from every person's working copy, for a project leaving the workspace. */
    removeProjectFromCopies: db.transaction((project: string) => {
      const removed = hashesOf(db, 'copy<>? AND project=?', [PUBLISHED_COPY, project]);
      for (const t of ['files', 'findings'])
        db.query(`DELETE FROM ${t} WHERE copy<>? AND project=?`).run(PUBLISHED_COPY, project);
      forgetUnusedEntities(db, removed);
    }),
    close: () => db.close(),
  };
}
/** Access to cached files, entities, findings, and suggestions. */
export type Cache = ReturnType<typeof createCache>;
