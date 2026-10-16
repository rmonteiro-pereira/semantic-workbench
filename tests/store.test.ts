import { test, expect } from "bun:test";
import { createStore } from "../server/store";
import { editEntity, inspect } from "../src/model";
const yaml = `# retain this comment\nname: Business\ncustom: preserved\nontology:\n  - concept: Customer\n    type: EntityType\n`;
test("edits preserve unknown fields and comments", () => {
  const out = editEntity(yaml, ["ontology", 0], "Buyer");
  expect(out).toContain("# retain this comment");
  expect(out).toContain("custom: preserved");
  expect(inspect(out).entities[0].description).toBe("Buyer");
});
test("SQLite save indexes atomically and rejects stale updates", () => {
  const s = createStore(":memory:");
  const d = s.save("a.yaml", yaml) as any;
  expect(s.db.query("SELECT * FROM entities").all()).toHaveLength(1);
  expect(() => s.save("a.yaml", "name: invalid", d.id, d.revision)).toThrow();
  expect((s.list()[0] as any).source).toBe(yaml);
  s.save("a.yaml", editEntity(yaml, ["ontology", 0], "Updated"), d.id, d.revision);
  expect(() => s.save("a.yaml", yaml, d.id, d.revision)).toThrow("Document changed");
  s.db.close();
});
test("rejects unresolved semantic joins", () => {
  expect(() =>
    inspect(
      "name: Sales\ndatasets: [{name: orders, source: db.orders}]\nrelationships: [{name: bad, from: orders, to: missing}]",
    ),
  ).toThrow("unknown dataset");
});

test('SQLite retains RDF/XML and SHACL sources without YAML conversion',async()=>{const s=createStore(':memory:');for(const filename of ['commerce.owl','commerce.shacl.ttl']){const source=await Bun.file('public/examples/commerce/'+filename).text();s.save(filename,source);expect((s.list().find((d:any)=>d.filename===filename)as any).source).toBe(source);}expect(s.db.query('SELECT * FROM entities').all().length).toBeGreaterThan(10);s.db.close();});
