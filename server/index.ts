import { mkdirSync } from "node:fs";
import { createStore } from "./store";
mkdirSync("data", { recursive: true });
const store = createStore("data/workbench.sqlite");
Bun.serve({
  hostname: "127.0.0.1",
  port: 4310,
  async fetch(req) {
    const url = new URL(req.url);
    if (
      req.headers.get("origin") &&
      !["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:4310"].includes(
        req.headers.get("origin")!,
      )
    )
      return new Response("Forbidden", { status: 403 });
    try {
      if (url.pathname === "/api/documents" && req.method === "GET")
        return Response.json(store.list());
      if (url.pathname === "/api/documents" && req.method === "POST") {
        const body = await req.json();
        if (
          typeof body.filename !== "string" ||
          typeof body.source !== "string" ||
          body.source.length > 2_000_000
        )
          return Response.json({ error: "Invalid document (maximum 2 MB)" }, { status: 400 });
        return Response.json(store.save(body.filename, body.source, body.id, body.revision));
      }
      return new Response("Not found", { status: 404 });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  },
});
console.log('SQLite API: http://127.0.0.1:4310');
