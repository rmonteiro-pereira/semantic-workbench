import{test,expect}from'bun:test';import{readFileSync}from'node:fs';
import{applyPatches}from'../src/editor/patch';
import{insertPatches,removePatches,itemValue,edit}from'../src/edit/yaml-patch';
import{newItem,itemKindAt,listPathFor}from'../src/edit/item-model';
import{findReferences,removeDependents,rewriteReferences,type ProjectDoc}from'../src/edit/references';
import{validateInput}from'../src/input';
// Adding items in the document's style and deleting them with their dependents (FR-049, FR-050,
// FR-051, FR-054).
const read=(p:string)=>readFileSync(p,'utf8');
const doc=(path:string,dir='public/examples/commerce'):ProjectDoc=>({id:'p/'+path,path,filename:path,source:read(`${dir}/${path}`)});
test('add a concept and a relationship to it, then delete both: the file equals the original',()=>{
 const original=read('public/examples/commerce/commerce-business.ossie.yaml'),data=(validateInput(original,'b.ossie.yaml').model as any).document;
 const added=edit(original,
  t=>insertPatches(t,listPathFor('concept',data)!,newItem('concept',{concept:'Supplier',type:'EntityType',description:'Who sells products to us.'})),
  t=>insertPatches(t,['ontology',3,'relationships'],newItem('ontology-relationship',{name:'supplied_by',target:'Supplier',verbalizes:['{Product} supplied by {Supplier}']})));
 const v=validateInput(added,'b.ossie.yaml');expect(v.valid).toBe(true);
 expect(v.model!.edges.some(e=>e.label==='supplied_by')).toBe(true);
 expect(added).toContain('  - concept: Supplier\n    type: EntityType\n    description: Who sells products to us.\n');
 expect(added).toContain('    relationships:\n      - name: supplied_by\n        roles:\n          - concept: Supplier\n        verbalizes:\n          - "{Product} supplied by {Supplier}"\n');
 const concepts=itemValue(added,['ontology']) as any[];
 const removed=edit(added,t=>removePatches(t,['ontology',concepts.length-1]),t=>removePatches(t,['ontology',3,'relationships',0]));
 // The emptied list is written back as an empty list.
 expect(removed).toBe(original);
});
test('deleting a concept lists the relationships and mappings that name it, and removes them on request',()=>{
 const docs=[doc('commerce-business.ossie.yaml'),doc('commerce.mapped-ontology.yaml'),doc('commerce.mapping.yaml')];
 const refs=findReferences({kind:'concept',name:'Order',docId:docs[0].id,path:['ontology',1]},docs);
 expect(refs.filter(r=>r.docId===docs[0].id).map(r=>r.where)).toEqual(['relationship places of Customer']);
 expect(refs.some(r=>r.file==='commerce.mapping.yaml'&&r.dependent?.label.startsWith('concept mapping Order'))).toBe(true);
 const edited=removeDependents(docs,refs.filter(r=>r.dependent&&r.docId===docs[0].id).map(r=>({docId:r.docId,dependent:r.dependent!})));
 const next=applyPatches(edited[0].source,removePatches(edited[0].source,['ontology',1]));
 expect(validateInput(next,'b.ossie.yaml').valid).toBe(true);
 expect(next).not.toContain('concept: Order\n');expect(next).not.toContain('name: places');
});
test('deleting a dataset lists its joins and the metrics that read it',()=>{
 const docs=[doc('sales.ossie.yaml')];
 const data=(validateInput(docs[0].source,'sales.ossie.yaml').model as any).document,i=data.datasets.findIndex((d:any)=>d.name==='orders');
 const refs=findReferences({kind:'dataset',name:'orders',docId:docs[0].id,path:['datasets',i]},docs);
 const labels=[...new Set(refs.map(r=>r.dependent?.label))];
 expect(labels).toContain('dataset relationship orders_customer');expect(labels).toContain('metric gross_revenue');expect(labels).toContain('metric average_order_value');
 expect(refs.find(r=>r.where==='metric gross_revenue')!.excerpt).toBe('expression: SUM(orders.amount)');
});
test('deleting a contract object lists foreign keys that point at it; the result validates',()=>{
 const docs=[doc('commerce.odcs.yaml')];
 const refs=findReferences({kind:'odcs-object',name:'customers',docId:docs[0].id,path:['schema',0]},docs);
 expect(refs.map(r=>r.dependent?.label)).toEqual(['foreign key of customer_id']);
 expect(itemKindAt((validateInput(docs[0].source,'c.odcs.yaml').model as any).document,refs[0].dependent!.path)).toBe('odcs-foreign-key');
 const [edited]=removeDependents(docs,[{docId:docs[0].id,dependent:refs[0].dependent!}]);
 const next=applyPatches(edited.source,removePatches(edited.source,['schema',0]));
 expect(validateInput(next,'c.odcs.yaml').valid).toBe(true);
});
test('deleting a KPI removes its binding line from the mapping extension',()=>{
 const docs=[doc('mall.semantic.yaml','public/examples/mall'),doc('mall.mapping.yaml','public/examples/mall')];
 const metrics=itemValue(docs[0].source,['metrics']) as any[],i=metrics.findIndex(m=>m.name==='headcount');
 const refs=findReferences({kind:'metric',name:'headcount',docId:docs[0].id,path:['metrics',i]},docs);
 const binding=refs.find(r=>r.dependent?.binding);expect(binding?.file).toBe('mall.mapping.yaml');
 expect(docs[1].source.slice(binding!.from,binding!.to)).toBe('headcount');
 const [edited]=removeDependents(docs,[{docId:binding!.docId,dependent:binding!.dependent!}]);
 const before=docs[1].source.split('\n'),after=edited.source.split('\n');
 expect(before.length-after.length).toBe(1);expect(before.filter(l=>!after.includes(l))).toEqual(['        {"metric":"headcount","measures":"kpi:Headcount","of":"Employee"},']);
 expect(validateInput(edited.source,'mall.mapping.yaml').valid).toBe(true);
});
test('a rename lists the remaining references and rewrites only the ones confirmed',()=>{
 const docs=[doc('commerce-business.ossie.yaml'),doc('commerce.mapping.yaml')];
 const refs=findReferences({kind:'concept',name:'OrderLine',docId:docs[0].id,path:['ontology',2]},docs);
 expect(refs.length).toBeGreaterThan(0);
 const local=refs.filter(r=>r.docId===docs[0].id);
 const [out]=rewriteReferences(docs,local,'LineItem');
 const renamed=out.source.replace('  - concept: OrderLine\n','  - concept: LineItem\n');
 expect(validateInput(renamed,'b.ossie.yaml').valid).toBe(true);
 expect(renamed.split('\n').filter((l,n)=>l!==docs[0].source.split('\n')[n]).length).toBe(local.length+1);
 expect(docs[0].source.match(/\{Order\} contains \{OrderLine\}/)).not.toBeNull();
});
