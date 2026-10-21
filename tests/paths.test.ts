import {test,expect} from 'bun:test';
import {assertSlug,dataLayout,disambiguate,projectFile,projectName,projectPath,slugify,uniqueName} from '../server/projects/paths';
const layout=dataLayout('/tmp/workbench-paths-test');
test('data layout follows DATA_DIR',()=>{
 expect(layout.projects).toBe('/tmp/workbench-paths-test/projects');expect(layout.state).toBe('/tmp/workbench-paths-test/state');
 expect(layout.trash).toBe('/tmp/workbench-paths-test/trash');expect(layout.backup).toBe('/tmp/workbench-paths-test/backup');expect(layout.cache).toBe('/tmp/workbench-paths-test/cache.sqlite');
 const old=process.env.DATA_DIR;process.env.DATA_DIR='/tmp/elsewhere';try{expect(dataLayout().root).toBe('/tmp/elsewhere');}finally{if(old===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=old;}
});
test('project paths reject traversal, absolute paths and .git',()=>{
 for(const bad of ['../x.yaml','a/../../x','/etc/passwd','C:/x','.git/config','a/.git/hooks/x','.GIT/config','a//b','./a','','a\\b','x\0y'])expect(()=>projectPath(bad)).toThrow();
 for(const good of ['a.yaml','dir/b.ttl','.gitignore','x (2).yaml','a/.gitkeep'])expect(projectPath(good)).toBe(good);
 expect(()=>projectFile(layout,'p','../q/a.yaml')).toThrow();
 expect(projectFile(layout,'p','dir/a.yaml')).toBe('/tmp/workbench-paths-test/projects/p/dir/a.yaml');
});
test('slugs match the registry pattern',()=>{
 for(const ok of ['a','ubl','commerce-scale','0x',`a${'b'.repeat(62)}`])expect(assertSlug(ok)).toBe(ok);
 for(const bad of ['','-a','A','a_b','a b','.staging',`a${'b'.repeat(63)}`,'../x'])expect(()=>assertSlug(bad)).toThrow();
 expect(slugify('Ossie Flights',new Set())).toBe('ossie-flights');expect(slugify('Ossie Flights',new Set(['ossie-flights']))).toBe('ossie-flights-2');
 expect(slugify('Ação ®',new Set())).toBe('acao');expect(slugify('***',new Set())).toBe('project');
});
test('project names are 1–200 characters and unique ignoring case',()=>{
 expect(projectName('  Flights ')).toBe('Flights');
 for(const bad of ['','   ','x'.repeat(201),42,null])expect(()=>projectName(bad)).toThrow();
 expect(()=>projectName('flights',['Flights'])).toThrow('already exists');
 expect(projectName('FLIGHTS',['Flights'],'Flights')).toBe('FLIGHTS');
 expect(uniqueName('Flights',['flights','Flights (2)'])).toBe('Flights (3)');
});
test('duplicate filenames become name (2).ext',()=>{
 expect(disambiguate('a.yaml',new Set(['a.yaml']))).toBe('a (2).yaml');
 expect(disambiguate('a.yaml',new Set(['a.yaml','a (2).yaml']))).toBe('a (3).yaml');
 expect(disambiguate('dir/.gitignore',new Set(['dir/.gitignore']))).toBe('dir/.gitignore (2)');
 expect(disambiguate('b.owl.ttl',new Set(['b.owl.ttl']))).toBe('b.owl (2).ttl');
});
