import { defineConfig } from 'vite-plus';
const sqlDialects = ['athena', 'bigquery', 'db2', 'hive', 'mysql', 'postgresql', 'redshift', 'snowflake', 'sqlite', 'transactsql', 'trino'];

export default defineConfig(({ mode }) => ({
  define: { __SW_PROFILE_UI__: mode === 'profile' },
  resolve: {
    alias: mode === 'profile' ? [{ find: /^react-dom\/client$/, replacement: 'react-dom/profiling' }] : [],
  },
  server: { host: '127.0.0.1', strictPort: true, proxy: { '/api': 'http://127.0.0.1:4310' } },
  // ES module workers keep dynamic imports as separate chunks: the validation worker loads one
  // SQL grammar build per dialect on first need instead of all of them.
  worker: { format: 'es' },
  // These are imported only from a worker (the Network layout loads cytoscape) or on demand. Found late, the dev server re-optimizes them and reloads the page in the middle of a run.
  optimizeDeps: {
    include: ['shacl-engine', 'shacl-engine/sparql.js', 'cytoscape', 'cytoscape-fcose', ...sqlDialects.map(dialect => `node-sql-parser/build/${dialect}.js`)],
  },
}));
