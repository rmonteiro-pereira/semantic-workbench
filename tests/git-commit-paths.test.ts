import {test,expect} from 'bun:test';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createGit} from '../server/projects/git';
import {isolateGit} from './helpers/temp-data-dir';
// commitPaths (T014, research R8): `git add` for untracked listed paths, then `git commit --only`,
// so exactly the listed paths are committed and other staged or unstaged work is left alone.
const sh=(cwd:string,args:string[])=>{const r=Bun.spawnSync(['git',...args],{cwd});if(r.exitCode!==0)throw Error(r.stderr.toString());return r.stdout.toString();};
function repo(){
 isolateGit();
 const root=mkdtempSync(join(tmpdir(),'workbench-commitpaths-')),projects=join(root,'projects'),dir=join(projects,'p');
 mkdirSync(dir,{recursive:true});const git=createGit({projectsRoot:projects});
 return {git,dir,root,write:(p:string,t:string)=>writeFileSync(join(dir,p),t),dispose:()=>rmSync(root,{recursive:true,force:true})};
}
test('commits only the listed paths; untracked listed paths are added; other work is untouched',async()=>{
 const r=repo();
 try{
  await r.git.init(r.dir);r.write('a.yaml','a: 1\n');r.write('b.yaml','b: 1\n');
  const first=await r.git.commitPaths(r.dir,['a.yaml','b.yaml'],'Import 2 files');
  expect(first).toMatchObject({committed:true});
  expect(sh(r.dir,['log','--format=%s']).trim()).toBe('Import 2 files');
  r.write('a.yaml','a: 2\n');r.write('b.yaml','b: 2\n');sh(r.dir,['add','b.yaml']);
  r.write('c.yaml','c: 1\n');r.write('d.yaml','d: 1\n');
  const out=await r.git.commitPaths(r.dir,['a.yaml','c.yaml'],'Update a and c');
  if(!out.committed)throw Error('expected a commit');
  expect(out.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(sh(r.dir,['show','--name-only','--format=','HEAD']).trim().split('\n').sort()).toEqual(['a.yaml','c.yaml']);
  // b stays staged, d stays untracked
  expect(sh(r.dir,['status','--porcelain']).split('\n').filter(Boolean).sort()).toEqual(['?? d.yaml','M  b.yaml']);
 }finally{r.dispose();}
});
test('a deleted tracked path is committed as a deletion',async()=>{
 const r=repo();
 try{
  await r.git.init(r.dir);r.write('a.yaml','a: 1\n');await r.git.commitPaths(r.dir,['a.yaml'],'Add');
  rmSync(join(r.dir,'a.yaml'));
  expect(await r.git.commitPaths(r.dir,['a.yaml'],'Remove a')).toMatchObject({committed:true});
  expect(sh(r.dir,['ls-files']).trim()).toBe('');
 }finally{r.dispose();}
});
test('refuses during a merge and reports it',async()=>{
 const r=repo();
 try{
  await r.git.init(r.dir);r.write('a.yaml','a: 1\n');await r.git.commitPaths(r.dir,['a.yaml'],'Base');
  sh(r.dir,['switch','-q','-c','other']);r.write('a.yaml','a: other\n');sh(r.dir,['commit','-qam','other']);
  sh(r.dir,['switch','-q','main']);r.write('a.yaml','a: main\n');sh(r.dir,['commit','-qam','main']);
  Bun.spawnSync(['git','merge','other'],{cwd:r.dir});
  r.write('z.yaml','z: 1\n');
  expect(await r.git.commitPaths(r.dir,['z.yaml'],'Import z')).toEqual({committed:false,reason:'merging'});
  expect(sh(r.dir,['log','-1','--format=%s']).trim()).toBe('main');
 }finally{r.dispose();}
});
test('without a Git identity nothing is committed and the reason is given',async()=>{
 const r=repo();
 const empty=join(r.root,'empty-gitconfig');writeFileSync(empty,'');
 const git=createGit({projectsRoot:join(r.root,'projects'),env:{...process.env,GIT_CONFIG_GLOBAL:empty,GIT_CONFIG_NOSYSTEM:'1'}});
 try{
  await git.init(r.dir);r.write('a.yaml','a: 1\n');
  expect(await git.commitPaths(r.dir,['a.yaml'],'Import a.yaml')).toEqual({committed:false,reason:'no-identity'});
  expect(Bun.spawnSync(['git','rev-parse','-q','--verify','HEAD'],{cwd:r.dir}).exitCode).not.toBe(0);
  // a repository-local identity is seen at once (no restart)
  sh(r.dir,['config','user.name','Local Person']);sh(r.dir,['config','user.email','local@example.invalid']);
  expect(await git.commitPaths(r.dir,['a.yaml'],'Import a.yaml')).toMatchObject({committed:true});
 }finally{r.dispose();}
});
test('an empty path list or message is refused',async()=>{
 const r=repo();
 try{
  await r.git.init(r.dir);
  await expect(r.git.commitPaths(r.dir,[],'x')).rejects.toThrow();
  r.write('a.yaml','a: 1\n');
  await expect(r.git.commitPaths(r.dir,['a.yaml'],' ')).rejects.toThrow('commit message');
 }finally{r.dispose();}
});
