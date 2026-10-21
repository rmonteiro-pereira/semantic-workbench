import {test,expect} from 'bun:test';
import {join} from 'node:path';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dataLayout,locationOf,projectDir,repoDir,projectPrefix,PathError} from '../server/projects/paths';
import {testWorkspace} from './helpers/temp-data-dir';
import {call,ok} from './helpers/scm';
// Research R10/T011: a project folder and its repository folder are resolved through the registry;
// entries without `folder`/`repo` (every v0.2.0 registry) keep `folder = repo = slug`.
test('v0.2.0 entries default to folder = repo = slug',()=>{
 expect(locationOf({slug:'shop'})).toEqual({folder:'shop',repo:'shop'});
 const layout=dataLayout('/tmp/x');
 expect(projectDir(layout,'shop')).toBe(join(layout.projects,'shop'));
 expect(repoDir(layout,'shop')).toBe(join(layout.projects,'shop'));
 expect(projectPrefix(layout,'shop')).toBe('');
});
test('subfolder entries resolve inside their repository; invalid ones are refused',()=>{
 expect(locationOf({slug:'sales',folder:'team/domains/sales',repo:'team'})).toEqual({folder:'team/domains/sales',repo:'team'});
 expect(locationOf({slug:'team',folder:'team',repo:'team'})).toEqual({folder:'team',repo:'team'});
 for(const bad of [{folder:'team/../other',repo:'team'},{folder:'other/x',repo:'team'},{folder:'team/.git/x',repo:'team'},{folder:'/abs',repo:'team'},{folder:'teamx/a',repo:'team'}])
  expect(()=>locationOf({slug:'s',...bad})).toThrow(PathError);
 const layout={...dataLayout('/tmp/x'),locate:(slug:string)=>slug==='sales'?{folder:'team/domains/sales',repo:'team'}:undefined};
 expect(projectDir(layout,'sales')).toBe(join(layout.projects,'team/domains/sales'));
 expect(repoDir(layout,'sales')).toBe(join(layout.projects,'team'));
 expect(projectPrefix(layout,'sales')).toBe('domains/sales/');
 expect(projectDir(layout,'other')).toBe(join(layout.projects,'other'));
 expect(()=>projectDir(layout,'../x')).toThrow(PathError);
});
test('a v0.2.0 registry file loads unchanged and its projects keep working',async()=>{
 const t=await testWorkspace();
 try{
  const created=await ok(call(t,'POST','/api/import',{files:[{path:'shop.yaml',source:'name: Shop\nontology:\n  - concept: Customer\n    type: EntityType\n'}]}));
  const before=readFileSync(t.ws.layout.registry,'utf8');
  expect(JSON.parse(before).projects[0]).not.toHaveProperty('folder');
  expect(t.ws.layout.locate!(created.slug)).toEqual({folder:created.slug,repo:created.slug});
  const file=await ok(call(t,'GET',`/api/projects/${created.slug}/files/shop.yaml`));
  expect(file.source).toContain('Customer');
  const status=await ok(call(t,'GET',`/api/projects/${created.slug}/git/status`));
  expect(status.branch).toBe('main');
  expect(readFileSync(t.ws.layout.registry,'utf8')).toBe(before);
 }finally{t.dispose();}
});
test('the workspace resolves a registered subfolder project through the registry',async()=>{
 const t=await testWorkspace();
 try{
  const repo=join(t.ws.layout.projects,'team'),sub=join(repo,'domains','sales');mkdirSync(sub,{recursive:true});
  await t.ws.git.init(repo);writeFileSync(join(sub,'sales.yaml'),'name: Sales\nontology:\n  - concept: Customer\n    type: EntityType\n');
  t.ws.state.writeRegistry([{slug:'sales',name:'Sales',createdAt:new Date(0).toISOString(),origin:'clone',folder:'team/domains/sales',repo:'team'}]);
  expect(projectDir(t.ws.layout,'sales')).toBe(sub);expect(repoDir(t.ws.layout,'sales')).toBe(repo);
  const file=t.ws.readFile('sales','sales.yaml');expect(file.source).toContain('Sales');
  expect(existsSync(join(t.ws.layout.projects,'sales'))).toBe(false);
 }finally{t.dispose();}
});
