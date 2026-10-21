import { defineConfig } from "vite-plus";
export default defineConfig({
  server: { host: "127.0.0.1", strictPort:true, proxy: { "/api": "http://127.0.0.1:4310" } },
  // ES module workers keep dynamic imports as separate chunks: the validation worker loads one
  // SQL grammar build per dialect on first need instead of all of them (research R11).
  worker: { format: "es" },
});
