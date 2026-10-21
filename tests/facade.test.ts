import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {editEntity,inspect} from '../src/model';
import {testWorkspace} from './helpers/temp-data-dir';
const yaml=`# retain this comment\nname: Business\ncustom: preserved\nontology:\n  - concept: Customer\n    type: EntityType\n`;
test("edits preserve unknown fields and comments",()=>{
 const out=editEntity(yaml,["ontology",0],"Buyer");
 expect(out).toContain("# retain this comment");expect(out).toContain("custom: preserved");expect(inspect(out).entities[0].description).toBe("Buyer");
});
test("facade save indexes into the cache and rejects stale updates",async()=>{
 const t=await testWorkspace();
 try{
  const d=await t.ws.saveDocument("a.yaml",yaml);
  expect(d.id).toBe('ungrouped/a.yaml');expect(t.ws.cache.entities('ungrouped','a.yaml')).toHaveLength(1);
  await expect(t.ws.saveDocument("a.yaml","name: invalid",d.id,{revision:d.revision})).rejects.toThrow();
  expect(t.ws.documents()[0].source).toBe(yaml);
  await t.ws.saveDocument("a.yaml",editEntity(yaml,["ontology",0],"Updated"),d.id,{revision:d.revision});
  await expect(t.ws.saveDocument("a.yaml",yaml,d.id,{revision:d.revision})).rejects.toThrow("changed");
  await expect(t.ws.saveDocument("a.yaml",yaml,d.id,{baseHash:d.hash})).rejects.toThrow("changed");
 }finally{t.dispose();}
});
test("rejects unresolved semantic joins",()=>{
 expect(()=>inspect("name: Sales\ndatasets: [{name: orders, source: db.orders}]\nrelationships: [{name: bad, from: orders, to: missing}]")).toThrow("unknown dataset");
});
test('folder store retains RDF/XML and SHACL sources byte for byte',async()=>{
 const t=await testWorkspace();
 try{
  for(const filename of ['commerce.owl','commerce.shacl.ttl']){
   const source=await Bun.file('public/examples/commerce/'+filename).text();await t.ws.saveDocument(filename,source);
   expect(t.ws.documents().find(d=>d.filename===filename)!.source).toBe(source);
   expect(readFileSync(`${t.root}/projects/ungrouped/${filename}`,'utf8')).toBe(source);
  }
  expect(t.ws.cache.entities('ungrouped','commerce.owl').length).toBeGreaterThan(10);
 }finally{t.dispose();}
});
