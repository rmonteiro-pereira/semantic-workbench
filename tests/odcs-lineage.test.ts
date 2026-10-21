import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
import {odcsLineage,objectId} from '../src/odcs/lineage';
const file=(dir:string,path:string)=>({path,data:parse(readFileSync(`public/examples/${dir}/${path}`,'utf8'))});
const commerce=[file('commerce','commerce.odcs.yaml'),file('commerce','sales.ossie.yaml'),file('commerce','commerce-business.ossie.yaml')];
const labels=(l:ReturnType<typeof odcsLineage>,kind:string)=>l.nodes.filter(n=>n.kind===kind).map(n=>n.label).sort();
test('orders: foreign-key neighbors both ways, the semantic dataset it feeds, its fields and the sales metrics',()=>{
 const l=odcsLineage(commerce,'commerce.odcs.yaml','orders',3);
 expect(l.center).toBe(objectId('commerce.odcs.yaml','orders'));
 expect(l.nodes.find(n=>n.id===l.center)).toMatchObject({kind:'object',depth:0,detail:'analytics.commerce.orders'});
 // orders.customer_id → customers (outgoing), order_lines.order_id → orders (incoming).
 expect(l.nodes.filter(n=>n.kind==='object'&&n.depth===1).map(n=>n.label).sort()).toEqual(['customers','order_lines']);
 expect(l.edges.filter(e=>e.kind==='foreign-key'&&(e.from===l.center||e.to===l.center)).map(e=>e.label).sort()).toEqual(['customer_id','order_id']);
 expect(l.nodes.find(n=>n.kind==='dataset'&&n.label==='orders')).toMatchObject({depth:1,file:'sales.ossie.yaml'});
 expect(labels(l,'metric')).toEqual(['average_order_value','gross_revenue','order_count']);
 expect(l.edges.filter(e=>e.kind==='aggregates'&&e.from.endsWith('/orders.amount')).map(e=>e.to.split('/').pop()).sort()).toEqual(['average_order_value','gross_revenue']);
 expect(l.edges.find(e=>e.kind==='reads'&&e.to.endsWith('/orders.amount'))?.properties).toEqual(['amount']);
});
test('property-level lineage: which fields and metrics read each property',()=>{
 const l=odcsLineage(commerce,'commerce.odcs.yaml','orders',1);
 expect(l.properties.amount).toEqual({fields:['orders.amount'],metrics:['average_order_value','gross_revenue']});
 expect(l.properties.order_id).toEqual({fields:['orders.order_id'],metrics:['average_order_value','order_count']});
 expect(l.properties.status).toEqual({fields:['orders.status'],metrics:[]});
});
test('depth limits what is shown; maxDepth tells how far the lineage reaches',()=>{
 const at=(d:number)=>odcsLineage(commerce,'commerce.odcs.yaml','orders',d);
 expect(at(0).nodes.map(n=>n.label)).toEqual(['orders']);expect(at(0).edges).toEqual([]);
 expect(at(1).nodes.every(n=>n.depth<=1)).toBe(true);expect(labels(at(1),'metric')).toEqual([]);
 expect(labels(at(2),'field')).toContain('orders.amount');expect(labels(at(2),'metric')).toEqual([]);
 expect(labels(at(3),'metric')).toHaveLength(3);
 expect(at(1).maxDepth).toBe(at(9).maxDepth);expect(at(9).nodes.length).toBeGreaterThan(at(3).nodes.length);
 for(const d of [0,1,2,3])for(const e of at(d).edges){const ids=new Set(at(d).nodes.map(n=>n.id));expect(ids.has(e.from)&&ids.has(e.to)).toBe(true);}
});
test('mall: KPIs downstream of occupancy snapshots, through metric dependencies',()=>{
 const files=['mall.odcs.yaml','mall.semantic.yaml','mall.ontology.yaml','mall.mapping.yaml'].map(p=>file('mall',p));
 const l=odcsLineage(files,'mall.odcs.yaml','occupancy_snapshots',6);
 const kpis=labels(l,'kpi');expect(kpis.length).toBeGreaterThan(2);
 expect(kpis.some(k=>/occupancy/i.test(k))).toBe(true);
 expect(l.edges.some(e=>e.kind==='uses')).toBe(true);
 expect(l.properties.contracted_minimum_rent?.metrics.length).toBeGreaterThan(0);
});
test('unknown object and contracts without consumers',()=>{
 expect(()=>odcsLineage(commerce,'commerce.odcs.yaml','nope')).toThrow('not an object');
 const alone=odcsLineage([commerce[0]],'commerce.odcs.yaml','products',5);
 expect(alone.nodes.map(n=>n.kind).every(k=>k==='object')).toBe(true);expect(alone.properties).toEqual({});
});
