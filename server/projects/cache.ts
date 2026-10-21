// Maintains a rebuildable SQLite index of project folders. Missing, incompatible, or corrupt caches
// are recreated from source files.
import { Database } from 'bun:sqlite';
import { rmSync } from 'node:fs';
import type { Issue } from '../../src/diagnostics';
/** Schema version required for the rebuildable SQLite cache. */
export const CACHE_VERSION = 3;
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
const SCHEMA = `
CREATE TABLE files(project TEXT NOT NULL,path TEXT NOT NULL,hash TEXT NOT NULL,serialization TEXT NOT NULL,doc_type TEXT NOT NULL,layout TEXT,valid INTEGER NOT NULL,visible INTEGER NOT NULL,git_state TEXT NOT NULL,indexed_at TEXT NOT NULL,PRIMARY KEY(project,path));
CREATE TABLE entities(project TEXT NOT NULL,path TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(project,path,id));
CREATE TABLE findings(project TEXT NOT NULL,path TEXT NOT NULL,severity TEXT NOT NULL,code TEXT NOT NULL,json_path TEXT NOT NULL,line INTEGER,column INTEGER,message TEXT NOT NULL);
CREATE INDEX findings_file ON findings(project,path);
CREATE TABLE suggestions(file_project TEXT NOT NULL,file_path TEXT NOT NULL,target TEXT NOT NULL,evidence_json TEXT NOT NULL);`;
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
  return {
    db,
    rebuilt: opened.rebuilt,
    file: (project: string, path: string) => {
      const r = db.query('SELECT * FROM files WHERE project=? AND path=?').get(project, path);
      return r ? row(r) : null;
    },
    files: (project?: string) =>
      (project === undefined
        ? db.query('SELECT * FROM files ORDER BY project,path').all()
        : db.query('SELECT * FROM files WHERE project=? ORDER BY path').all(project)
      ).map(row),
    entities: (project: string, path: string) =>
      db
        .query('SELECT id,name,kind FROM entities WHERE project=? AND path=? ORDER BY rowid')
        .all(project, path) as CachedEntity[],
    findings: (project: string, path: string): Issue[] =>
      (
        db
          .query('SELECT * FROM findings WHERE project=? AND path=? ORDER BY rowid')
          .all(project, path) as any[]
      ).map(f => ({
        severity: f.severity,
        code: f.code,
        path: f.json_path,
        message: f.message,
        ...(f.line != null ? { line: f.line } : {}),
        ...(f.column != null ? { column: f.column } : {}),
      })),
    put: db.transaction((file: CachedFile, entities: CachedEntity[], findings: Issue[]) => {
      db.query('INSERT OR REPLACE INTO files VALUES(?,?,?,?,?,?,?,?,?,?)').run(
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
      db.query('DELETE FROM entities WHERE project=? AND path=?').run(file.project, file.path);
      db.query('DELETE FROM findings WHERE project=? AND path=?').run(file.project, file.path);
      const entity = db.query('INSERT OR IGNORE INTO entities VALUES(?,?,?,?,?)');
      for (const e of entities) entity.run(file.project, file.path, e.id, e.name, e.kind);
      const finding = db.query('INSERT INTO findings VALUES(?,?,?,?,?,?,?,?)');
      for (const f of findings)
        finding.run(
          file.project,
          file.path,
          f.severity,
          f.code,
          f.path,
          f.line ?? null,
          f.column ?? null,
          f.message,
        );
    }),
    remove: db.transaction((project: string, path: string) => {
      for (const t of ['files', 'entities', 'findings'])
        db.query(`DELETE FROM ${t} WHERE project=? AND path=?`).run(project, path);
    }),
    removeProject: db.transaction((project: string) => {
      for (const t of ['files', 'entities', 'findings'])
        db.query(`DELETE FROM ${t} WHERE project=?`).run(project);
      db.query('DELETE FROM suggestions WHERE file_project=?').run(project);
    }),
    close: () => db.close(),
  };
}
/** Access to cached files, entities, findings, and suggestions. */
export type Cache = ReturnType<typeof createCache>;
