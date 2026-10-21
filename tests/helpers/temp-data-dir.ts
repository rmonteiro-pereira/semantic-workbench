import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openWorkspace,type WorkspaceOptions,type ImportFile} from '../../server/projects/workspace';
import {createHandler} from '../../server/handler';
// Isolated data roots for tests: never the owner's data/. Git gets its own global config with a
// test identity, and the system config is ignored, for the whole test process.
let gitHome:string|undefined;
export function isolateGit(){
 if(!gitHome){
  gitHome=mkdtempSync(join(tmpdir(),'workbench-git-'));
  const config=join(gitHome,'gitconfig');
  writeFileSync(config,'[user]\n\tname = Workbench Test\n\temail = workbench-test@example.invalid\n[init]\n\tdefaultBranch = main\n');
  process.env.GIT_CONFIG_GLOBAL=config;process.env.GIT_CONFIG_NOSYSTEM='1';
 }
 return gitHome;
}
export function tempDataDir(prefix='workbench-data-'){
 isolateGit();
 const root=mkdtempSync(join(tmpdir(),prefix));
 return {root,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
export async function testWorkspace(options:Omit<WorkspaceOptions,'root'>&{root?:string}={}){
 const dir=options.root?{root:options.root,cleanup:()=>rmSync(options.root!,{recursive:true,force:true})}:tempDataDir();
 const ws=await openWorkspace({...options,root:dir.root});
 const handler=createHandler(ws);
 return {ws,handler,root:dir.root,
  seed:(files:ImportFile[],name?:string)=>ws.importBatch({files,...(name?{name}:{})}),
  dispose:()=>{ws.close();dir.cleanup();},
  [Symbol.dispose](){ws.close();dir.cleanup();}};
}
export const example=(folder:string,filename:string)=>Bun.file(`public/examples/${folder}/${filename}`).text();
