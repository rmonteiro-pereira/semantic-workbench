import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {Writer} from 'n3';
import {applyPatches} from '../src/editor/patch';
import {isomorphic,gate,description} from '../src/edit/rdf-patch/isomorphism';
import {parseGraph,termKey,formatOf,RDFS,SH,type Triple} from '../src/edit/rdf-patch/terms';
import {readRdfItem,editRdfItem,deleteRdfItem,addRdfItem,checkRdfSource} from '../src/edit/rdf-patch/index';
// The RDF edit gate (FR-055a, SC-010) and round trips over every shipped RDF example: for a seeded
// sample of resources, a no-op edit changes nothing, a label change changes only that resource's
// statements and exactly one triple, removing and re-adding a statement restores the graph, and
// deleting and re-adding a resource restores the graph.
const bn=(v:string)=>({termType:'BlankNode' as const,value:v}),nn=(v:string)=>({termType:'NamedNode' as const,value:v}),lit=(v:string)=>({termType:'Literal' as const,value:v,datatype:'http://www.w3.org/2001/XMLSchema#string'});
test('graphs compare up to blank-node renaming, and differ on any changed triple',()=>{
 const a:Triple[]=[{s:nn('x'),p:nn('p'),o:bn('1')},{s:bn('1'),p:nn('q'),o:lit('v')},{s:bn('1'),p:nn('r'),o:bn('2')},{s:bn('2'),p:nn('q'),o:lit('w')}];
 const b:Triple[]=[{s:bn('b'),p:nn('r'),o:bn('a')},{s:bn('a'),p:nn('q'),o:lit('w')},{s:nn('x'),p:nn('p'),o:bn('b')},{s:bn('b'),p:nn('q'),o:lit('v')}];
 expect(isomorphic(a,b)).toBe(true);
 expect(isomorphic(a,b.map(t=>t.o.value==='w'?{...t,o:lit('W')}:t))).toBe(false);
 expect(isomorphic(a,b.slice(1))).toBe(false);
 // Interchangeable blank nodes are matched by search, not only by hashes.
 const ring=(n:number,tag:string):Triple[]=>Array.from({length:n},(_,i)=>({s:bn(tag+i),p:nn('next'),o:bn(tag+((i+1)%n))}));
 expect(isomorphic(ring(6,'a'),ring(6,'b'))).toBe(true);
 expect(isomorphic([...ring(3,'a'),...ring(3,'c')],ring(6,'b'))).toBe(false);
});
test('the gate refuses a change to another resource and reports removed and added triples',()=>{
 const before=parseGraph('@prefix e: <https://e/> . e:a e:p "1" . e:b e:p "2" .','turtle');
 expect(gate(before,parseGraph('@prefix e: <https://e/> . e:a e:p "1", "3" . e:b e:p "2" .','turtle'),['https://e/a'])).toEqual({ok:true,removed:0,added:1});
 expect(gate(before,parseGraph('@prefix e: <https://e/> . e:a e:p "1" . e:b e:p "9" .','turtle'),['https://e/a']).ok).toBe(false);
 expect(checkRdfSource('<https://e/a> <https://e/p> "1" .\n<https://e/b> <https://e/p> "2" .\n','<https://e/a> <https://e/p> "1" .\n<https://e/b> <https://e/p> "2" .\n<https://e/c> <https://e/p> "3" .\n','x.nt','https://e/a').ok).toBe(false);
});
// --- round trips over the shipped examples -----------------------------------------------------------
const files=['commerce/commerce.owl.ttl','commerce/commerce.owl','commerce/commerce.shacl.ttl','commerce/commerce-data.ttl','ubl/ubl.owl.ttl','ubl/ubl.shacl.ttl','mall/mall.owl.ttl','mall/mall.shacl.ttl','mall/mall-data.ttl'];
const extra=(()=>{const src=readFileSync('public/examples/commerce/commerce.owl.ttl','utf8'),w=new Writer({format:'N-Triples'});w.addQuads(new (require('n3').Parser)({baseIRI:'https://workbench.local/import/'}).parse(src));let nt='';w.end((_e:any,r:string)=>{nt=r;});return [{name:'commerce.owl.nt',source:nt},{name:'commerce.n3',source:src+'\n{ ?x a <https://example.org/commerce#PaidOrder> } => { ?x a <https://example.org/commerce#Order> } .\n'}];})();
let seed=7;const random=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
const sample=<T,>(xs:T[],n:number)=>{const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,n);};
const LABEL=[RDFS+'label',SH+'name'];
for(const {name,source} of [...files.map(f=>({name:f.split('/')[1],source:readFileSync('public/examples/'+f,'utf8')})),...extra]){
 test(`round trips on ${name}`,()=>{
  seed=[...name].reduce((h,c)=>(h*31+c.charCodeAt(0))%2147483647,7);
  const format=formatOf(name,source),graph=parseGraph(source,format);
  const subjects=[...new Set(graph.filter(t=>t.s.termType==='NamedNode').map(t=>t.s.value))];
  let checked=0;
  for(const subject of sample(subjects,format==='rdfxml'?10:8)){
   const item=readRdfItem(source,name,subject);
   if(item.refusal){expect(name).toBe('commerce.n3');continue;}
   if(!item.pairs.length)continue;
   const same=item.pairs.map(p=>({id:p.id,predicateText:p.predicateText,objectText:p.objectText}));
   // No-op.
   const none=editRdfItem(source,name,subject,same);expect(none.ok&&none.text).toBe(source);
   // A label change: one triple out, one in, and only inside this resource's statements.
   const label=item.pairs.find(p=>LABEL.includes(p.predicate)&&p.object?.termType==='Literal'&&!p.object.language);
   const desired=label?same.map(d=>d.id===label.id?{...d,objectText:'"Changed by the round trip"'}:d):[...same,{predicateText:'rdfs:label',objectText:'"Changed by the round trip"'}];
   const r=editRdfItem(source,name,subject,desired);
   if(!r.ok)throw Error(`${name} ${subject}: ${r.error}`);
   expect([r.removed,r.added]).toEqual([label?1:0,1]);
   for(const p of r.patches)expect(item.ranges.some(x=>p.from>=x.from&&p.to<=x.to)||(p.from===p.to&&p.from===source.length)).toBe(true);
   const expected=graph.filter(t=>!(label&&t.s.value===subject&&t.p.value===label.predicate&&t.o.value===label.object!.value)).concat([{s:{termType:'NamedNode',value:subject},p:{termType:'NamedNode',value:label?.predicate??RDFS+'label'},o:{termType:'Literal',value:'Changed by the round trip',datatype:'http://www.w3.org/2001/XMLSchema#string'}}]);
   expect(isomorphic(parseGraph(r.text,format),expected)).toBe(true);
   // Remove a statement, then add it back.
   const victim=item.pairs.find(p=>!p.locked&&!(format==='rdfxml'&&p.nested));
   if(victim){
    const a=editRdfItem(source,name,subject,same.filter(d=>d.id!==victim.id));if(!a.ok)throw Error(`${name} ${subject}: ${a.error}`);
    const back=readRdfItem(a.text,name,subject);
    const b=editRdfItem(a.text,name,subject,[...back.pairs.map(p=>({id:p.id,predicateText:p.predicateText,objectText:p.objectText})),{predicateText:victim.predicateText,objectText:victim.objectText}]);
    if(!b.ok)throw Error(`${name} ${subject} re-add: ${b.error}`);
    expect(isomorphic(parseGraph(b.text,format),graph)).toBe(true);
   }
   // Delete the resource (statements only), then add it again.
   // (A labelled blank node's own statements are not part of the pair texts, so those re-adds are skipped.)
   if(!item.pairs.some(p=>(p.locked&&format==='rdfxml'&&p.nested)||(p.object?.termType==='BlankNode'&&!p.nested))){
    const d=deleteRdfItem(source,name,subject,false);if(!d.ok)throw Error(`${name} ${subject} delete: ${d.error}`);
    const own=description(graph,new Set([termKey({termType:'NamedNode',value:subject})])),rest=graph.filter(t=>!own.has(t));
    expect(isomorphic(parseGraph(d.text,format),rest)).toBe(true);
    const again=addRdfItem(d.text,name,subject,item.pairs.map(p=>({predicateText:p.predicateText,objectText:p.objectText})));
    if(!again.ok)throw Error(`${name} ${subject} re-add item: ${again.error}`);
    expect(isomorphic(parseGraph(again.text,format),graph)).toBe(true);
   }
   checked++;
  }
  expect(checked).toBeGreaterThan(0);
 },60_000);
}
void applyPatches;
