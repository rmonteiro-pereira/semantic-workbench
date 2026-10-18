import { Database } from "bun:sqlite";
import { inspect } from "../src/model";
export function createStore(path: string) {
  const db = new Database(path, { create: true });
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,filename TEXT NOT NULL,source TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated TEXT NOT NULL); CREATE TABLE IF NOT EXISTS entities(document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,id TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(document_id,id));",
  );
  db.exec("CREATE TABLE IF NOT EXISTS document_views(document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,grouping TEXT NOT NULL)");
  return {
    db,
    grouping: (id:string) => {const row=db.query('SELECT grouping FROM document_views WHERE document_id=?').get(id)as {grouping:string}|null;return row?JSON.parse(row.grouping):{};},
    saveGrouping: (id:string,grouping:unknown) => {if(!db.query('SELECT id FROM documents WHERE id=?').get(id))throw Error('Document not found.');db.query('INSERT INTO document_views VALUES(?,?) ON CONFLICT(document_id) DO UPDATE SET grouping=excluded.grouping').run(id,JSON.stringify(grouping));return grouping;},
    list: () => db.query("SELECT * FROM documents ORDER BY updated DESC").all(),
    save: (filename: string, source: string, id = crypto.randomUUID(), revision?: number) => {
      const model = inspect(source, filename);
      return db.transaction(() => {
        const old = db.query("SELECT revision FROM documents WHERE id=?").get(id) as {
          revision: number;
        } | null;
        if (old && revision !== old.revision)
          throw Error("Document changed. Reload before saving.");
        db.query(
          "INSERT INTO documents VALUES(?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET filename=excluded.filename,source=excluded.source,revision=documents.revision+1,updated=excluded.updated",
        ).run(id, filename, source, new Date().toISOString());
        db.query("DELETE FROM entities WHERE document_id=?").run(id);
        for (const e of model.entities)
          db.query("INSERT INTO entities VALUES(?,?,?,?)").run(id, e.id, e.name, e.kind);
        return db.query("SELECT * FROM documents WHERE id=?").get(id);
      })();
    },
  };
}
