import { defineConfig } from 'vite-plus';
const sqlDialects = ['athena', 'bigquery', 'db2', 'hive', 'mysql', 'postgresql', 'redshift', 'snowflake', 'sqlite', 'transactsql', 'trino'];

export default defineConfig({
  server: { host: '127.0.0.1', strictPort: true, proxy: { '/api': 'http://127.0.0.1:4310' } },
  // ES module workers keep dynamic imports as separate chunks: the validation worker loads one
  // SQL grammar build per dialect on first need instead of all of them.
  worker: { format: 'es' },
  // These are imported only from a worker or on demand. Found late, the dev server re-optimizes them and reloads the page in the middle of a run.
  optimizeDeps: {
    include: ['shacl-engine', 'shacl-engine/sparql.js', ...sqlDialects.map(dialect => `node-sql-parser/build/${dialect}.js`)],
  },
});
