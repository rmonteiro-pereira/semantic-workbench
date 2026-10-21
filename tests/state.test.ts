import {test,expect} from 'bun:test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {dataLayout} from '../server/projects/paths';
import {createState} from '../server/projects/state';
import {tempDataDir} from './helpers/temp-data-dir';
test('every state file carries formatVersion and round-trips',()=>{
 const d=tempDataDir();
 try{
  const layout=dataLayout(d.root),s=createState(layout);
  expect(s.registry()).toEqual({formatVersion:1,projects:[]});expect(s.hasRegistry()).toBe(false);
  s.writeRegistry([{slug:'a',name:'A',createdAt:'t',origin:'import'}]);expect(s.hasRegistry()).toBe(true);
  expect(JSON.parse(readFileSync(layout.registry,'utf8'))).toEqual({formatVersion:1,projects:[{slug:'a',name:'A',createdAt:'t',origin:'import'}]});
  s.writeView('a',{'x.yaml':{mode:'types'}});expect(JSON.parse(readFileSync(join(layout.views,'a.json'),'utf8'))).toEqual({formatVersion:1,files:{'x.yaml':{mode:'types'}}});
  const draft=s.writeDraft('a','dir/x.yaml',{baseHash:'0'.repeat(64),text:'a: 1\n',patches:[{from:0,to:1,insert:'b'}]});
  expect(draft.formatVersion).toBe(1);expect(s.draft('a','dir/x.yaml')!.text).toBe('a: 1\n');expect(s.drafts()).toHaveLength(1);
  s.deleteDraft('a','dir/x.yaml');expect(s.draft('a','dir/x.yaml')).toBeNull();expect(s.drafts()).toHaveLength(0);
  s.writeLegacyIds({'uuid-1':{project:'a',path:'x.yaml'}});expect(s.legacyIds()).toEqual({formatVersion:1,ids:{'uuid-1':{project:'a',path:'x.yaml'}}});
 }finally{d.cleanup();}
});
test('state files are replaced atomically and unknown formats are refused',()=>{
 const d=tempDataDir();
 try{
  const layout=dataLayout(d.root),s=createState(layout);
  s.writeRegistry([]);s.writeRegistry([{slug:'b',name:'B',createdAt:'t',origin:'import'}]);
  expect(readFileSync(layout.registry,'utf8').endsWith('\n')).toBe(true);
  mkdirSync(layout.views,{recursive:true});writeFileSync(join(layout.views,'z.json'),JSON.stringify({formatVersion:9,files:{}}));
  expect(()=>s.view('z')).toThrow('Unsupported');
  expect(()=>s.writeDraft('a','../x',{baseHash:null,text:'',patches:[]})).toThrow();
  expect(()=>s.view('../x')).toThrow();
 }finally{d.cleanup();}
});
