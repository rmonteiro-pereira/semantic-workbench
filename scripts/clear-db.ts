import { Database } from "bun:sqlite";

const db = new Database("./data/workbench.sqlite");

db.exec("PRAGMA foreign_keys = ON;");

const before = db
  .query("SELECT COUNT(*) AS count FROM documents")
  .get() as { count: number };

console.log(`Documents before: ${before.count}`);

db.transaction(() => {
  db.exec(`
    DELETE FROM documents;
  `);
})();

const after = db
  .query("SELECT COUNT(*) AS count FROM documents")
  .get() as { count: number };

console.log(`Documents after: ${after.count}`);

db.exec("VACUUM;");
db.close();

console.log("Database cleared.");
