import { Database } from "bun:sqlite";

const db = new Database("./data/workbench.sqlite");

const tables = db
  .query(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name;
  `)
  .all();

console.log("Tables:");
console.table(tables);

const schemas = db
  .query(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name;
  `)
  .all();

console.log("\nSchemas:");

for (const table of schemas) {
  console.log(table);
}

db.close();