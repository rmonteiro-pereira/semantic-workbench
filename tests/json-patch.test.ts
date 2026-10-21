import{test,expect}from'bun:test';import{readFileSync}from'node:fs';import{parse}from'yaml';
import{applyPatches}from'../src/editor/patch';
import{valuePatches,insertPatches,removePatches,itemValue}from'../src/edit/yaml-patch';
import{jsonTextPatches}from'../src/edit/json-patch';
import{validateInput}from'../src/input';
// JSON item edits change only the edited value's text and keep the document's indentation style
// elsewhere; the file is never re-serialized (FR-053, baseline defect 22).
const contract=(indent:string|number)=>JSON.stringify(parse(readFileSync('public/examples/commerce/commerce.odcs.yaml','utf8')),null,indent)+'\n';
const set=(src:string,path:(string|number)[],value:any)=>applyPatches(src,valuePatches(src,path,value,'c.odcs.json'));
const lines=(a:string,b:string)=>{const x=a.split('\n'),y=b.split('\n');let p=0;while(x[p]===y[p])p++;let s=0;while(s<x.length-p&&s<y.length-p&&x[x.length-1-s]===y[y.length-1-s])s++;return {removed:x.slice(p,x.length-s),added:y.slice(p,y.length-s)};};
for(const indent of [2,4,'\t']){
 const src=contract(indent),pad=typeof indent==='number'?' '.repeat(indent):indent;
 test(`a changed value is the only changed line (indent ${JSON.stringify(indent)})`,()=>{
  const out=set(src,['schema',0,'properties',0,'description'],'Customer identifier.');
  expect(lines(src,out).added).toEqual([`${pad.repeat(5)}"description": "Customer identifier."${src.split('\n').find(l=>l.includes('"description"')&&l.startsWith(pad.repeat(5)))!.endsWith(',')?',':''}`]);
  expect(lines(src,out).removed.length).toBe(1);
  expect(validateInput(out,'c.odcs.json').valid).toBe(true);
 });
 test(`adding a key and a list entry uses the document's indentation (indent ${JSON.stringify(indent)})`,()=>{
  const item=itemValue(src,['schema',0,'properties',0]);
  const out=set(src,['schema',0,'properties',0],{...item,classification:'restricted'});
  const d=lines(src,out);expect(d.added.at(-1)).toBe(`${pad.repeat(5)}"classification": "restricted"`);expect(d.added.length).toBe(2);expect(d.removed.length).toBe(1);
  const added=applyPatches(src,insertPatches(src,['schema',0,'properties'],{name:'segment',logicalType:'string'},undefined,'c.odcs.json'));
  expect(lines(src,added).added).toEqual([`${pad.repeat(4)}},`,`${pad.repeat(4)}{`,`${pad.repeat(5)}"name": "segment",`,`${pad.repeat(5)}"logicalType": "string"`]);
  expect(JSON.parse(added).schema[0].properties.at(-1)).toEqual({name:'segment',logicalType:'string'});
  // Removing it again restores the original bytes.
  expect(applyPatches(added,removePatches(added,['schema',0,'properties',JSON.parse(added).schema[0].properties.length-1],'c.odcs.json'))).toBe(src);
 });
}
test('removing a first, middle or last entry keeps commas valid',()=>{
 const src='{\n  "a": [1, 2, 3],\n  "b": {"x": 1, "y": 2},\n  "c": true\n}\n';
 for(const i of [0,1,2]){const out=set(src,['a'],[1,2,3].filter((_,j)=>j!==i));expect(JSON.parse(out).a).toEqual([1,2,3].filter((_,j)=>j!==i));expect(out.split('\n').slice(2)).toEqual(src.split('\n').slice(2));}
 expect(set(src,['b'],{x:1})).toBe(src.replace('{"x": 1, "y": 2}','{"x": 1}'));
 expect(set(src,['b'],{y:2})).toBe(src.replace('{"x": 1, "y": 2}','{"y": 2}'));
 expect(set(src,['b'],{x:1,y:2,z:[3]})).toBe(src.replace('{"x": 1, "y": 2}','{"x": 1, "y": 2, "z": [3]}'));
 expect(applyPatches(src,removePatches(src,['c'],'x.json'))).toBe(src.replace(',\n  "c": true',''));
 expect(applyPatches(src,removePatches(src,['a'],'x.json'))).toBe(src.replace('"a": [1, 2, 3],\n  ',''));
});
test('a binding list written one per line gets one new line in sorted position',()=>{
 const text='{"schema": "semantic-workbench/mapping/v1", "kpi_bindings": [\n  {"metric":"a","measures":"A"},\n  {"metric":"c","measures":"C"}\n]}\n';
 const out=applyPatches(text,jsonTextPatches(text,['kpi_bindings'],[{metric:'a',measures:'A'},{metric:'b',measures:'B'},{metric:'c',measures:'C'}]));
 expect(out).toBe(text.replace('  {"metric":"c"','  {"metric":"b","measures":"B"},\n  {"metric":"c"'));
});
