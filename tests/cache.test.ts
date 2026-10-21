import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {rmSync,writeFileSync} from 'node:fs';
import {CACHE_VERSION,createCache} from '../server/projects/cache';
import {testWorkspace,example} from './helpers/temp-data-dir';
// rdflib numbers blank nodes with a process-wide counter, so their labels differ between parses in
// one process (not between restarts); compare them by position only.
const snapshot=(ws:Awaited<ReturnType<typeof testWorkspace>>['ws'])=>ws.cache.files().map(f=>({...f,indexedAt:'',entities:ws.cache.entities(f.project,f.path).map(e=>e.kind==='Blank node'?{...e,id:'_:b',name:'_:b'}:e),findings:ws.cache.findings(f.project,f.path)}));
test('deleting cache.sqlite and reopening rebuilds identical files, entities and findings (SC-015)',async()=>{
 const t=await testWorkspace();
 try{
  await t.seed([{path:'ubl.ontology.yaml',source:await example('ubl','ubl.ontology.yaml')},{path:'commerce.owl',source:await example('commerce','commerce.owl')}],'UBL');
  writeFileSync(`${t.root}/projects/ubl/notes.txt`,'x');await t.ws.rescan('ubl');
  await t.seed([{path:'tpcds.yaml',source:await Bun.file('tests/fixtures/ossie-mapping/tpcds_semantic_model.yaml').text()}],'TPC-DS');
  t.ws.state.writeView('ubl',{'ubl.ontology.yaml':{mode:'types'}});
  t.ws.state.writeDraft('ubl','commerce.owl',{baseHash:null,text:'draft',patches:[]});
  const before=snapshot(t.ws),registry=t.ws.state.registry();
  expect(before.length).toBe(4);expect(before.some(f=>f.findings.length)).toBe(true);
  t.ws.close();for(const s of ['','-wal','-shm'])rmSync(t.ws.layout.cache+s,{force:true});
  const again=await testWorkspace({root:t.root});
  try{
   expect(again.ws.cache.rebuilt).toBe(true);expect(snapshot(again.ws)).toEqual(before);
   expect(again.ws.state.registry()).toEqual(registry);expect(again.ws.grouping('ubl/ubl.ontology.yaml')).toEqual({mode:'types'});
   expect(again.ws.state.draft('ubl','commerce.owl')!.text).toBe('draft');
  }finally{again.ws.close();}
 }finally{t.dispose();}
});
test('a user_version mismatch or a corrupt file triggers a rebuild',()=>{
 const t=`/tmp/workbench-cache-${crypto.randomUUID()}.sqlite`;
 try{
  const c=createCache(t);expect(c.rebuilt).toBe(true);c.put({project:'p',path:'a',hash:'h',serialization:'yaml',docType:'x',valid:true,visible:true,gitState:'clean',indexedAt:'t'},[],[]);c.close();
  const kept=createCache(t);expect(kept.rebuilt).toBe(false);expect(kept.files()).toHaveLength(1);kept.close();
  const db=new Database(t);db.exec(`PRAGMA user_version=${CACHE_VERSION+1}`);db.close();
  const bumped=createCache(t);expect(bumped.rebuilt).toBe(true);expect(bumped.files()).toHaveLength(0);bumped.close();
  for(const s of ['','-wal','-shm'])rmSync(t+s,{force:true});writeFileSync(t,'this is not a database');
  const corrupt=createCache(t);expect(corrupt.rebuilt).toBe(true);expect(corrupt.files()).toHaveLength(0);corrupt.close();
 }finally{for(const s of ['','-wal','-shm'])rmSync(t+s,{force:true});}
});
