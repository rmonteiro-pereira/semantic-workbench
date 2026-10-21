import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {testWorkspace,isolateGit} from './helpers/temp-data-dir';
import {call,ok,ontology,sh} from './helpers/scm';
// FR-049 / T015: every import commits exactly the written paths ("Import N files", one file
// "Import <name>"); when Git, an identity or a clean merge state is missing, the files are still
// written and the reason is reported.
const log=(dir:string)=>sh(dir,['log','--format=%s']).trim().split('\n');
const committed=(dir:string)=>sh(dir,['show','--name-only','--format=','HEAD']).trim().split('\n').filter(Boolean).sort();
test('import into a new project commits the batch',async()=>{
 const t=await testWorkspace();
 try{
  const r=await ok(call(t,'POST','/api/import',{files:[{path:'a.yaml',source:ontology('A')},{path:'b.yaml',source:ontology('B')}]}));
  expect(r.commit).toMatchObject({committed:true,message:'Import 2 files'});expect(r.commit.commit).toMatch(/^[0-9a-f]{40}$/);
  const dir=join(t.root,'projects',r.slug);expect(log(dir)).toEqual(['Import 2 files']);expect(committed(dir)).toEqual(['a.yaml','b.yaml']);
  const one=await ok(call(t,'POST','/api/import',{files:[{path:'solo.yaml',source:ontology('S')}]}));
  expect(one.commit.message).toBe('Import solo.yaml');
 }finally{t.dispose();}
});
test('import into an existing project commits only the imported paths',async()=>{
 const t=await testWorkspace();
 try{
  const p=await ok(call(t,'POST','/api/import',{files:[{path:'shop.yaml',source:ontology('Shop')}]}));
  const dir=join(t.root,'projects',p.slug);
  writeFileSync(join(dir,'shop.yaml'),ontology('Edited, not committed.'));writeFileSync(join(dir,'notes.yaml'),ontology('Untracked'));
  const r=await ok(call(t,'POST',`/api/projects/${p.slug}/import`,{files:[{path:'x.yaml',source:ontology('X')},{path:'y.yaml',source:ontology('Y')}]}));
  expect(r.commit).toMatchObject({committed:true,message:'Import 2 files'});
  expect(committed(dir)).toEqual(['x.yaml','y.yaml']);
  expect(sh(dir,['status','--porcelain']).split('\n').filter(Boolean).sort()).toEqual([' M shop.yaml','?? notes.yaml']);
  // replace: the replaced file is committed with its new bytes
  const re=await ok(call(t,'POST',`/api/projects/${p.slug}/import`,{files:[{path:'x.yaml',source:ontology('X2')}],onConflict:'replace'}));
  expect(re.commit).toMatchObject({committed:true,message:'Import x.yaml'});expect(committed(dir)).toEqual(['x.yaml']);
 }finally{t.dispose();}
});
test('loading an example commits its files',async()=>{
 const t=await testWorkspace();
 try{
  const r=await ok(call(t,'POST','/api/examples/commerce'));
  expect(r.commit).toMatchObject({committed:true});expect(r.commit.message).toMatch(/^Import \d+ files$/);
  const dir=join(t.root,'projects',r.slug);expect(sh(dir,['status','--porcelain']).trim()).toBe('');
  // opening the existing example project again commits nothing new
  const again=await ok(call(t,'POST','/api/examples/commerce'));expect(again.created).toBe(false);expect(again.commit).toBeUndefined();
 }finally{t.dispose();}
});
test('without an identity the files are written and the reason is reported; a local identity works at once',async()=>{
 isolateGit();
 const extra=mkdtempSync(join(tmpdir(),'workbench-noid-')),empty=join(extra,'gitconfig');writeFileSync(empty,'[init]\n\tdefaultBranch = main\n');
 const saved=process.env.GIT_CONFIG_GLOBAL;process.env.GIT_CONFIG_GLOBAL=empty;
 const t=await testWorkspace();
 try{
  const r=await ok(call(t,'POST','/api/import',{files:[{path:'a.yaml',source:ontology('A')}]}));
  expect(r.commit).toEqual({committed:false,reason:'no-identity'});
  const dir=join(t.root,'projects',r.slug);
  expect((await ok(call(t,'GET',`/api/projects/${r.slug}/files/a.yaml`))).source).toContain('A');
  sh(dir,['config','user.name','Local']);sh(dir,['config','user.email','local@example.invalid']);
  const into=await ok(call(t,'POST',`/api/projects/${r.slug}/import`,{files:[{path:'b.yaml',source:ontology('B')}]}));
  expect(into.commit).toMatchObject({committed:true,message:'Import b.yaml'});
  expect(committed(dir)).toEqual(['b.yaml']);
 }finally{t.dispose();process.env.GIT_CONFIG_GLOBAL=saved;rmSync(extra,{recursive:true,force:true});}
});
test('during a merge the import is written but not committed',async()=>{
 const t=await testWorkspace();
 try{
  const p=await ok(call(t,'POST','/api/import',{files:[{path:'a.yaml',source:ontology('A')}]}));
  const dir=join(t.root,'projects',p.slug);
  sh(dir,['switch','-q','-c','other']);writeFileSync(join(dir,'a.yaml'),ontology('Other'));sh(dir,['commit','-qam','other']);
  sh(dir,['switch','-q','main']);writeFileSync(join(dir,'a.yaml'),ontology('Main'));sh(dir,['commit','-qam','main']);
  Bun.spawnSync(['git','merge','other'],{cwd:dir});
  const r=await ok(call(t,'POST',`/api/projects/${p.slug}/import`,{files:[{path:'b.yaml',source:ontology('B')}]}));
  expect(r.commit).toEqual({committed:false,reason:'merging'});
  expect(log(dir)[0]).toBe('main');
 }finally{t.dispose();}
});
test('without Git the import is written and reported as not committed',async()=>{
 const t=await testWorkspace({gitBinary:'/nonexistent/git'});
 try{
  const r=await ok(call(t,'POST','/api/import',{files:[{path:'a.yaml',source:ontology('A')}]}));
  expect(r.commit).toEqual({committed:false,reason:'no-git'});
 }finally{t.dispose();}
});
