import { defineConfig } from 'vite-plus';
import { fileURLToPath } from 'node:url';
const sqlDialects = ['athena', 'bigquery', 'db2', 'hive', 'mysql', 'postgresql', 'redshift', 'snowflake', 'sqlite', 'transactsql', 'trino'];

// The compiler's digest module reads Node's hash function, which a browser lacks. Only that module is given a browser version, so any other server import in the client still fails loudly.
const browserSha256 = fileURLToPath(new URL('./src/app/compile/browser-sha256.ts', import.meta.url));
const browserDigest = {
  name: 'browser-digest',
  enforce: 'pre' as const,
  resolveId(id: string, importer?: string) {
    return id === 'node:crypto' && importer?.endsWith('/src/shared/tessera/digest.ts') ? browserSha256 : null;
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [browserDigest],
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
