import {test,expect} from 'bun:test';
import {readFileSync,readdirSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {parse} from 'yaml';
import {buildLineage,objectId,closure,around,type LineageGraph} from '../src/odcs/lineage';
// Column-level lineage (T025, SC-002). Every expected edge is derived here by an independent,
// deliberately plain reading of the files (regular expressions over the parsed YAML, not the
// builder's modules) and compared both ways with the builder; the edge lists are also kept as
// golden files in tests/fixtures/lineage/ so any change shows up in review.
type Edge=[string,string,string];
const load=(dir:string)=>readdirSync(`public/examples/${dir}`).filter(f=>/\.(ya?ml|json)$/.test(f)&&f!=='manifest.json'&&f!=='expected.json'&&f!=='model-map.json'&&f!=='summary.json').map(f=>({path:f,data:(()=>{try{return parse(readFileSync(`public/examples/${dir}/${f}`,'utf8'));}catch{return null;}})()}));
const edgesOf=(g:LineageGraph):Edge[]=>g.edges.map(e=>[e.from,e.to,e.kind] as Edge).sort((a,b)=>a.join('>').localeCompare(b.join('>')));
function oracle(files:{path:string;data:any}[],contract:string):Edge[]{
 const c=files.find(f=>f.path===contract)!.data,out:Edge[]=[];
 const obj=(n:string)=>`object:${contract}#${n}`;
 for(const o of c.schema)for(const p of o.properties??[])for(const r of p.relationships??[]){const [t,col]=String(r.to).split('.');out.push([`${obj(t)}/${col}`,`${obj(o.name)}/${p.name}`,'foreign-key']);}
 const byPhysical=new Map(c.schema.map((o:any)=>[o.physicalName??o.name,o]));
 for(const f of files){
  const m=f.data;if(!m||!Array.isArray(m.datasets))continue;
  const ansi=(x:any)=>{const ds=x?.expression?.dialects??[];return (ds.find((d:any)=>d.dialect==='ANSI_SQL')??ds[0])?.expression;};
  const fields=new Map<string,string>();
  for(const d of m.datasets){
   const o:any=byPhysical.get(d.source)??c.schema.find((x:any)=>x.name===d.source);if(!o)continue;
   const ds=`dataset:${f.path}#/${d.name}`;
   for(const fd of d.fields??[]){
    fields.set(`${d.name}.${fd.name}`,`${ds}/${fd.name}`);
    const e=String(ansi(fd)??fd.name);
    // Field expressions in the shipped examples are column names or arithmetic over column names.
    expect(/^[A-Za-z0-9_\s*+\-\/()]+$/.test(e)).toBe(true);
    for(const col of new Set(e.match(/[A-Za-z_]\w*/g)??[])){const p=(o.properties??[]).find((x:any)=>(x.physicalName??x.name)===col);if(p)out.push([`${obj(o.name)}/${p.name}`,`${ds}/${fd.name}`,'reads']);}
   }
  }
  const names=new Set((m.metrics??[]).map((x:any)=>x.name));
  const inLineage=new Set<string>();
  for(const x of m.metrics??[]){const e=String(ansi(x)??'');for(const [,t,col] of e.matchAll(/\b([A-Za-z_]\w*)\.([A-Za-z_]\w*)\b/g)){const fid=fields.get(`${t}.${col}`);if(fid){out.push([fid,`metric:${f.path}#/${x.name}`,'aggregates']);inLineage.add(x.name);}}}
  let grew=true;while(grew){grew=false;for(const x of m.metrics??[]){const e=String(ansi(x)??'').replace(/'[^']*'/g,'');for(const [w] of e.matchAll(/\b[A-Za-z_]\w*\b/g))if(names.has(w)&&w!==x.name&&!/\.\s*$/.test(e.slice(0,e.indexOf(w)))&&inLineage.has(w)){const edge:Edge=[`metric:${f.path}#/${w}`,`metric:${f.path}#/${x.name}`,'uses'];if(!out.some(o=>o.join()===edge.join())){out.push(edge);if(!inLineage.has(x.name)){inLineage.add(x.name);}grew=true;}}}}
 }
 return [...new Map(out.map(e=>[e.join('>'),e])).values()].sort((a,b)=>a.join('>').localeCompare(b.join('>')));
}
function golden(name:string,edges:Edge[]){
 const file=`tests/fixtures/lineage/${name}.edges.json`;
 if(!existsSync(file)||process.env.UPDATE_GOLDEN){mkdirSync('tests/fixtures/lineage',{recursive:true});writeFileSync(file,JSON.stringify(edges,null,1)+'\n');}
 expect(edges).toEqual(JSON.parse(readFileSync(file,'utf8')));
}
for(const [dir,contract] of [['commerce','commerce.odcs.yaml'],['mall','mall.odcs.yaml'],['ubl','ubl.odcs.yaml']] as const){
 test(`${dir}: every drawn edge is expected and no expected edge is missing (SC-002)`,()=>{
  const files=load(dir),g=buildLineage(files,contract),got=edgesOf(g),want=oracle(files,contract);
  expect(got.filter(e=>!want.some(w=>w.join()===e.join()))).toEqual([]);
  expect(want.filter(w=>!got.some(e=>e.join()===w.join()))).toEqual([]);
  golden(dir,got);
  // a card appears once; every edge end is a known card or column
  const nodes=new Set([...g.cards.keys(),...[...g.cards.values()].flatMap(c=>c.columns.map(x=>x.id))]);
  for(const e of g.edges){expect(nodes.has(e.from)).toBe(true);expect(nodes.has(e.to)).toBe(true);}
 });
}
test('commerce: customers.customer_id → orders.customer_id (parent left of child), fields and metrics to the right',()=>{
 const g=buildLineage(load('commerce'),'commerce.odcs.yaml'),o=(n:string)=>objectId('commerce.odcs.yaml',n);
 expect(g.edges).toContainEqual(expect.objectContaining({from:`${o('customers')}/customer_id`,to:`${o('orders')}/customer_id`,kind:'foreign-key'}));
 expect(g.edges.some(e=>e.from===`${o('orders')}/amount`&&e.to==='dataset:sales.ossie.yaml#/orders/amount'&&e.kind==='reads')).toBe(true);
 expect(g.edges.filter(e=>e.from==='dataset:sales.ossie.yaml#/orders/amount').map(e=>e.to).sort()).toEqual(['metric:sales.ossie.yaml#/average_order_value','metric:sales.ossie.yaml#/gross_revenue']);
 const orders=g.cards.get(o('orders'))!;
 expect(orders.columns.find(c=>c.path==='order_id')!.badges.map(b=>b.label)).toEqual(['PK','Required','Unique']);
 expect(orders.columns.find(c=>c.path==='customer_id')!.badges.map(b=>b.label)).toContain('FK');
 expect(orders.columns.find(c=>c.path==='customer_id')!.fk).toEqual(['customers.customer_id']);
});
const contract=(schema:any[])=>({path:'c.odcs.yaml',data:{apiVersion:'v3.1.0',kind:'DataContract',id:'c',name:'C',version:'1',status:'active',schema}});
test('nested columns, composite keys, external stubs, declared transforms, cycles and ambiguous sources',()=>{
 const files=[contract([
  {name:'a',physicalName:'db.a',properties:[{name:'id'},{name:'k2'},{name:'address',properties:[{name:'zip'}]},{name:'parent',relationships:[{to:'a.id'}]},{name:'ext',relationships:[{to:'crm.odcs.yaml#/schema/c/properties/id'}]}]},
  {name:'b',physicalName:'a',properties:[{name:'x'},{name:'y'},{name:'total',transformSourceObjects:['a','raw_feed'],transformLogic:'SELECT 1'}],relationships:[{from:['b.x','b.y'],to:['a.id','a.k2']}]},
 ]),{path:'s.yaml',data:{name:'S',datasets:[{name:'a',source:'a',fields:[{name:'id'}]}],metrics:[{name:'n',expression:{dialects:[{dialect:'ANSI_SQL',expression:'COUNT(a.id)'}]}},{name:'n2',expression:{dialects:[{dialect:'ANSI_SQL',expression:'n * 2'}]}},{name:'orphan',expression:{dialects:[{dialect:'ANSI_SQL',expression:'1'}]}}]}}];
 const g=buildLineage(files,'c.odcs.yaml'),a='object:c.odcs.yaml#a',b='object:c.odcs.yaml#b';
 expect(g.cards.get(a)!.columns.map(c=>c.path)).toEqual(['id','k2','address','address.zip','parent','ext']);
 expect(g.edges.filter(e=>e.kind==='foreign-key').map(e=>[e.from,e.to])).toEqual([[`${a}/id`,`${a}/parent`],[`${a}/id`,`${b}/x`],[`${a}/k2`,`${b}/y`],['external:crm.odcs.yaml#/schema/c/properties/id',`${a}/ext`]]);
 expect(g.cards.get('external:crm.odcs.yaml#/schema/c/properties/id')!.kind).toBe('external');
 expect(g.edges.filter(e=>e.kind==='transform').map(e=>[e.from,e.to])).toEqual([[a,`${b}/total`],['external:raw_feed',`${b}/total`]]);
 // dataset source "a" is a's name and b's physical name: both lines, flagged ambiguous
 const reads=g.edges.filter(e=>e.kind==='reads');expect(reads.map(e=>e.from).sort()).toEqual([`${a}/id`]);expect(reads.every(e=>e.ambiguous)).toBe(true);
 expect(g.edges.filter(e=>e.kind==='uses').map(e=>[e.from,e.to])).toEqual([['metric:s.yaml#/n','metric:s.yaml#/n2']]);
 expect(g.cards.has('metric:s.yaml#/orphan')).toBe(false);
 // self-referencing foreign key: path highlighting terminates
 const c=closure(g,[`${a}/id`]);expect(c.nodes.has(`${a}/parent`)).toBe(true);
 // a dataset reading nothing of this contract is counted, not drawn
 const g2=buildLineage([...files,{path:'t.yaml',data:{name:'T',datasets:[{name:'z',source:'nowhere',fields:[]}]}}],'c.odcs.yaml');expect(g2.unmatchedDatasets).toBe(1);
 void around;
});
