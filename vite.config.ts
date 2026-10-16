import { defineConfig } from "vite-plus";
export default defineConfig({
  server: { host: "127.0.0.1", strictPort:true, proxy: { "/api": "http://127.0.0.1:4310" } },
});
