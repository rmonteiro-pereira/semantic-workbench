import {test,expect} from 'bun:test';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {sha256} from '../server/projects/atomic';
import {applyPatches} from '../server/projects/workspace';
import {testWorkspace,example} from './helpers/temp-data-dir';
const api=(t:{handler:(r:Request)=>Promise<Response>},method:string,path:string,body?:unknown,headers:Record<string,string>={})=>t.handler(new Request('http://127.0.0.1:4310'+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})}));
const ontology='# keep\r\nname: Shop\r\nontology:\r\n  - concept: Customer\r\n    type: EntityType\r\n';
async function project(){const t=await testWorkspace();const r=await api(t,'POST','/api/import',{files:[{path:'shop.yaml',source:ontology},{path:'dir/ref.ttl',source:'@prefix ex: <https://e/> .\nex:a ex:b ex:c .\n'}]});expect(r.status).toBe(200);return {t,created:await r.json()};}
test('import creates one project per batch, named after its ontology, with one commit',async()=>{
 const {t,created}=await project();
 try{
  expect(created.slug).toBe('shop');expect(created.name).toBe('Shop');expect(created.written).toEqual([{path:'shop.yaml',hash:sha256(ontology)},{path:'dir/ref.ttl',hash:sha256('@prefix ex: <https://e/> .\nex:a ex:b ex:c .\n')}]);
  const projects=await(await api(t,'GET','/api/projects')).json();
  expect(projects).toHaveLength(1);expect(projects[0]).toMatchObject({slug:'shop',name:'Shop',origin:'import',branch:'main',changes:0});
  expect(projects[0].files.map((f:any)=>[f.path,f.docType,f.valid,f.gitState])).toEqual([['dir/ref.ttl','RDF',true,'clean'],['shop.yaml','Ossie ontology',true,'clean']]);
  expect(readFileSync(join(t.root,'projects/shop/shop.yaml'),'utf8')).toBe(ontology);
  expect((await t.ws.git.run(join(t.root,'projects/shop'),['log','--format=%s'])).stdout.trim()).toBe('Import 2 files');
  const second=await(await api(t,'POST','/api/import',{files:[{path:'other.yaml',source:ontology}]})).json();expect([second.slug,second.name]).toEqual(['shop-2','Shop (2)']);
  const invalid=await api(t,'POST','/api/import',{files:[{path:'ok.yaml',source:ontology},{path:'bad.yaml',source:'ontology: []'}]});
  expect(invalid.status).toBe(400);expect((await invalid.json()).issues[0].message).toContain('bad.yaml');
  for(const files of [[{path:'../x.yaml',source:ontology}],[{path:'.git/config',source:ontology}],[{path:'a.csv',source:'a,b'}],[]])expect((await api(t,'POST','/api/import',{files})).status).toBe(400);
  expect((await(await api(t,'GET','/api/projects')).json())).toHaveLength(2);
 }finally{t.dispose();}
});
test('GET returns the exact bytes, hash and findings',async()=>{
 const {t}=await project();
 try{
  const file=await(await api(t,'GET','/api/projects/shop/files/shop.yaml')).json();
  expect(file).toMatchObject({path:'shop.yaml',source:ontology,hash:sha256(ontology),docType:'Ossie ontology'});
  expect((await api(t,'GET','/api/projects/shop/files/dir%2Fref.ttl')).status).toBe(200);
  expect((await api(t,'GET','/api/projects/shop/files/dir/ref.ttl')).status).toBe(200);
  expect((await api(t,'GET','/api/projects/shop/files/missing.yaml')).status).toBe(404);
  expect((await api(t,'GET','/api/projects/nope/files/shop.yaml')).status).toBe(404);
  for(const bad of ['%2E%2E%2Fescape.yaml','..%2F..%2Fstate%2Fprojects.json','.git%2Fconfig','%2Fetc%2Fpasswd'])expect((await api(t,'GET','/api/projects/shop/files/'+bad)).status).toBeGreaterThanOrEqual(400);
 }finally{t.dispose();}
});
test('PUT with a stale baseHash returns 409 with the current file and writes nothing',async()=>{
 const {t}=await project();
 try{
  const path=join(t.root,'projects/shop/shop.yaml');
  const ok=await api(t,'PUT','/api/projects/shop/files/shop.yaml',{baseHash:sha256(ontology),source:ontology.replace('Shop','Store')});
  expect(ok.status).toBe(200);const saved=await ok.json();expect(saved.hash).toBe(sha256(readFileSync(path)));
  const stale=await api(t,'PUT','/api/projects/shop/files/shop.yaml',{baseHash:sha256(ontology),source:ontology.replace('Shop','Other')});
  expect(stale.status).toBe(409);expect(await stale.json()).toEqual({error:'stale',currentHash:saved.hash,currentSource:ontology.replace('Shop','Store')});
  expect(readFileSync(path,'utf8')).toBe(ontology.replace('Shop','Store'));
  writeFileSync(path,'name: External\nontology: [{concept: X}]\n');
  const external=await api(t,'PUT','/api/projects/shop/files/shop.yaml',{baseHash:saved.hash,source:ontology});
  expect(external.status).toBe(409);expect((await external.json()).currentSource).toBe('name: External\nontology: [{concept: X}]\n');
  expect((await api(t,'PUT','/api/projects/shop/files/new.yaml',{baseHash:sha256('x'),source:ontology})).status).toBe(409);
  expect((await api(t,'PUT','/api/projects/shop/files/new.yaml',{baseHash:null,source:ontology})).status).toBe(200);
  expect((await api(t,'PUT','/api/projects/shop/files/new.yaml',{baseHash:null,source:ontology})).status).toBe(409);
 }finally{t.dispose();}
});
test('patches apply to the base bytes and leave every other byte (CRLF included) unchanged',async()=>{
 const {t}=await project();
 try{
  const from=ontology.indexOf('Customer');
  const r=await api(t,'PUT','/api/projects/shop/files/shop.yaml',{baseHash:sha256(ontology),patches:[{from,to:from+8,insert:'Buyer'}]});
  expect(r.status).toBe(200);expect(readFileSync(join(t.root,'projects/shop/shop.yaml'),'utf8')).toBe(ontology.replace('Customer','Buyer'));
  expect(applyPatches('a\r\nb\nc\r\n',[{from:0,to:1,insert:'x'},{from:5,to:6,insert:'z'}])).toBe('x\r\nb\nz\r\n');
  for(const patches of [[{from:5,to:2,insert:''}],[{from:0,to:3,insert:''},{from:2,to:4,insert:''}],[{from:0,to:999,insert:''}],[{from:0.5,to:1,insert:''}],'x'])expect(()=>applyPatches('abcdef',patches as any)).toThrow();
  const current=sha256(readFileSync(join(t.root,'projects/shop/shop.yaml')));
  expect((await api(t,'PUT','/api/projects/shop/files/shop.yaml',{baseHash:current,patches:[{from:0,to:999999,insert:''}]})).status).toBe(400);
 }finally{t.dispose();}
});
test('an invalid source is rejected with issues and no write',async()=>{
 const {t}=await project();
 try{
  const before=readdirSync(join(t.root,'projects/shop'));
  const r=await api(t,'PUT','/api/projects/shop/files/shop.yaml',{baseHash:sha256(ontology),source:'ontology: [ ]'});
  expect(r.status).toBe(400);const body=await r.json();expect(body.issues[0].path).toBe('/ontology');
  expect(readFileSync(join(t.root,'projects/shop/shop.yaml'),'utf8')).toBe(ontology);expect(readdirSync(join(t.root,'projects/shop'))).toEqual(before);
  for(const body of [{source:'x'},{baseHash:'abc',source:ontology},{baseHash:sha256(ontology)},{baseHash:sha256(ontology),source:ontology,patches:[]},{baseHash:sha256(ontology),source:ontology,extra:1}])expect((await api(t,'PUT','/api/projects/shop/files/shop.yaml',body)).status).toBe(400);
  expect((await api(t,'PUT','/api/projects/shop/files/notes.csv',{baseHash:null,source:'a,b'})).status).toBe(400);
  expect((await api(t,'PUT','/api/projects/shop/files/shop.yaml',{baseHash:sha256(ontology),source:ontology},{origin:'https://evil.example'})).status).toBe(403);
 }finally{t.dispose();}
});
test('.gitignore is plain text: saved without model validation, and rescans apply it',async()=>{
 const {t}=await project();
 try{
  writeFileSync(join(t.root,'projects/shop/scratch.yaml'),ontology);await t.ws.rescan('shop');
  const paths=async()=>(await(await api(t,'GET','/api/projects')).json())[0].files.map((f:any)=>f.path);
  expect(await paths()).toEqual(['dir/ref.ttl','scratch.yaml','shop.yaml']);
  expect((await api(t,'PUT','/api/projects/shop/files/.gitignore',{baseHash:null,source:'scratch.yaml\ndir/\n'})).status).toBe(200);
  // As in Git, ignore rules hide untracked files; a committed file stays listed.
  expect(await paths()).toEqual(['.gitignore','dir/ref.ttl','shop.yaml']);
 }finally{t.dispose();}
});
test('drafts persist with their base hash',async()=>{
 const {t}=await project();
 try{
  expect((await api(t,'PUT','/api/drafts/shop/shop.yaml',{baseHash:sha256(ontology),text:'draft text',patches:[]})).status).toBe(200);
  expect(await(await api(t,'GET','/api/drafts')).json()).toMatchObject([{project:'shop',path:'shop.yaml',baseHash:sha256(ontology)}]);
  expect((await(await api(t,'GET','/api/drafts/shop/shop.yaml')).json()).text).toBe('draft text');
  expect((await api(t,'PUT','/api/drafts/nope/shop.yaml',{baseHash:null,text:'',patches:[]})).status).toBe(404);
  expect((await api(t,'PUT','/api/drafts/shop/..%2Fx',{baseHash:null,text:'',patches:[]})).status).toBe(400);
  await api(t,'PUT','/api/projects/shop/files/shop.yaml',{baseHash:sha256(ontology),source:ontology.replace('Shop','Saved')});
  expect(await(await api(t,'GET','/api/drafts')).json()).toEqual([]);
  await api(t,'PUT','/api/drafts/shop/shop.yaml',{baseHash:null,text:'again',patches:[]});
  expect((await api(t,'DELETE','/api/drafts/shop/shop.yaml')).status).toBe(204);expect(await(await api(t,'GET','/api/drafts')).json()).toEqual([]);
 }finally{t.dispose();}
});
test('projects can be created empty and renamed; names stay unique',async()=>{
 const t=await testWorkspace();
 try{
  const created=await(await api(t,'POST','/api/projects',{name:'Sales models'})).json();expect(created).toEqual({slug:'sales-models',name:'Sales models'});
  expect((await t.ws.git.run(join(t.root,'projects/sales-models'),['log','--format=%s'])).stdout.trim()).toBe('Create project');
  expect((await api(t,'POST','/api/projects',{name:'sales MODELS'})).status).toBe(400);
  expect(await(await api(t,'PATCH','/api/projects/sales-models',{name:'Revenue'})).json()).toEqual({slug:'sales-models',name:'Revenue'});
  expect((await api(t,'PATCH','/api/projects/missing',{name:'X'})).status).toBe(404);
  expect((await api(t,'PATCH','/api/projects/sales-models',{name:''})).status).toBe(400);
  expect(t.ws.state.registry().projects.map(p=>p.name)).toEqual(['Revenue']);
 }finally{t.dispose();}
});
test('example loaders create the example project once and reopen it afterwards',async()=>{
 const t=await testWorkspace();
 try{
  expect(await(await api(t,'POST','/api/examples/flights')).json()).toEqual({slug:'flights',name:'Ossie Flights',created:true});
  expect(await(await api(t,'POST','/api/examples/flights')).json()).toEqual({slug:'flights',name:'Ossie Flights',created:false});
  expect(readFileSync(join(t.root,'projects/flights/flights.yaml'),'utf8')).toBe(await example('ossie','flights.yaml'));
  expect((await api(t,'POST','/api/examples/unknown')).status).toBe(404);
  const status=await(await api(t,'GET','/api/status')).json();expect(status).toMatchObject({gitAvailable:true,identityConfigured:true,migration:null,recovery:[]});
 }finally{t.dispose();}
});
test('the legacy /api/documents facade keeps its shapes over the folder store (R9)',async()=>{
 const {t}=await project();
 try{
  const docs=await(await api(t,'GET','/api/documents')).json();
  expect(docs.map((d:any)=>d.id)).toEqual(['shop/dir/ref.ttl','shop/shop.yaml']);
  const d=docs[1];expect(Object.keys(d).sort()).toEqual(['filename','hash','id','path','project','revision','source','updated']);
  expect(d).toMatchObject({filename:'shop.yaml',source:ontology,hash:sha256(ontology)});expect(Number.isSafeInteger(d.revision)).toBe(true);
  const saved=await(await api(t,'POST','/api/documents',{id:d.id,filename:'shop.yaml',source:ontology.replace('Shop','Facade'),revision:d.revision})).json();
  expect(saved.id).toBe(d.id);expect(saved.revision).not.toBe(d.revision);
  expect((await api(t,'POST','/api/documents',{id:d.id,filename:'shop.yaml',source:ontology,baseHash:d.hash})).status).toBe(400);
  expect((await api(t,'POST','/api/documents',{id:d.id,filename:'shop.yaml',source:ontology,baseHash:saved.hash})).status).toBe(200);
 }finally{t.dispose();}
});
