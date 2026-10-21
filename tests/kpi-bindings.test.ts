import {test,expect} from 'bun:test';
import {parseDocument} from 'yaml';
import {validateInput} from '../src/input';
import {readKpiBindings,resolveBindings,resolveConcept,mappingExpressionBindings} from '../src/metrics/bindings';
import {projectMetrics} from '../server/agent/explain';
// KPI-to-concept bindings in the mapping document's root extension (research R12).
const mall=async(f:string)=>Bun.file('public/examples/mall/'+f).text();
const bindingsData=(list:any[])=>JSON.stringify({schema:'semantic-workbench/mapping/v1',kpi_bindings:list});
const withBindings=(source:string,data:string)=>{const doc=parseDocument(source);doc.set('custom_extensions',doc.createNode([{vendor_name:'SEMANTIC_WORKBENCH',data}]));return doc.toString({lineWidth:0});};
test('the shopping center mapping binds all 25 KPIs; every concept resolves',async()=>{
 const mapping=parseDocument(await mall('mall.mapping.yaml')).toJS(),ontology=parseDocument(await mall('mall.ontology.yaml')).toJS(),semantic=parseDocument(await mall('mall.semantic.yaml')).toJS();
 const {value,issues}=readKpiBindings(mapping);expect(issues).toEqual([]);expect(value).toHaveLength(25);
 expect(value.map(b=>b.metric)).toEqual([...value.map(b=>b.metric)].sort());
 const resolved=resolveBindings(value,ontology,new Set(semantic.metrics.map((m:any)=>m.name)));
 expect(resolved.flatMap(r=>r.problems)).toEqual([]);
 expect(resolved.find(r=>r.metric==='occupancy_rate')).toMatchObject({measures:{input:'kpi:OccupancyRate',concept:'OccupancyRate'},of:{input:'Property',concept:'Property'},source:'kpi-binding'});
 // Concept name, QName and full IRI resolve to the same concept; unknown ones do not.
 const iri=ontology.prefixes.kpi+'OccupancyRate';
 for(const input of ['OccupancyRate','kpi:OccupancyRate',iri])expect(resolveConcept(input,ontology)).toBe('OccupancyRate');
 expect(resolveConcept('kpi:Nothing',ontology)).toBe(null);expect(resolveConcept('nope:OccupancyRate',ontology)).toBe(null);
 // Standard mappings whose expression is a metric name stay readable as evidence.
 expect(mappingExpressionBindings(mapping,new Set(['occupancy_rate']))).toEqual([{metric:'occupancy_rate',measures:{input:'OccupancyRate',concept:'OccupancyRate'},source:'mapping-expression',problems:[]}]);
});
test('bindings are validated: schema, measures required, metric unique, metric and concepts exist',async()=>{
 const source=await mall('mall.mapping.yaml'),errors=(data:string)=>validateInput(withBindings(source,data),'mall.mapping.yaml').issues.filter(i=>i.severity==='error').map(i=>i.message);
 expect(errors(bindingsData([{metric:'visitors'}])).join(' ')).toContain('measures');
 expect(errors(bindingsData([{metric:'visitors',measures:'kpi:Visitors',colour:'red'}])).join(' ')).toContain('colour');
 expect(errors(bindingsData([{metric:'visitors',measures:'kpi:Visitors'},{metric:'visitors',measures:'kpi:Visitors',of:'Property'}]))).toContain('KPI "visitors" is bound more than once; keep one binding per metric.');
 expect(errors(bindingsData([{metric:'visitors',measures:'kpi:Visitors'}]))).toEqual([]);
 expect(errors('{"schema":"semantic-workbench/mapping/v1",').join(' ')).toContain('not valid JSON');
 const problems=resolveBindings([{metric:'ghost',measures:'kpi:Nothing',of:'Nowhere'}],parseDocument(await mall('mall.ontology.yaml')).toJS(),new Set(['visitors']))[0].problems;
 expect(problems).toEqual(['Metric "ghost" is not in the referenced semantic model.','Concept "kpi:Nothing" is not in the referenced ontology.','Concept "Nowhere" is not in the referenced ontology.']);
 // A semantic model root extension that is not a binding block is left alone.
 expect(readKpiBindings({custom_extensions:[{vendor_name:'SEMANTIC_WORKBENCH',data:'{"defaults":1}'}]},'',false)).toEqual({value:[],issues:[]});
});
test('a consolidated file keeps its bindings in the embedded semantic model root',async()=>{
 const doc=parseDocument(await Bun.file('public/examples/ossie/flights.yaml').text());
 const base=['ontology_mappings',0,'semantic_model'];
 doc.setIn([...base,'metrics'],doc.createNode([{name:'flight_count',expression:{dialects:[{dialect:'ANSI_SQL',expression:'COUNT(FLIGHT.id)'}]}},{name:'total_delay',expression:{dialects:[{dialect:'ANSI_SQL',expression:'SUM(FLIGHT.dep_delay)'}]}}]));
 doc.setIn([...base,'custom_extensions'],doc.createNode([{vendor_name:'SEMANTIC_WORKBENCH',data:bindingsData([{metric:'total_delay',measures:'Delay',of:'Flight'}])}]));
 const source=doc.toString({lineWidth:0});expect(validateInput(source,'flights.yaml').issues.filter(i=>i.severity==='error')).toEqual([]);
 const kpis=projectMetrics([{id:'f/flights.yaml',project:'f',path:'flights.yaml',filename:'flights.yaml',revision:1,source} as any],'f');
 expect(kpis.map(k=>k.name)).toEqual(['flight_count','total_delay']);
 expect(kpis[1].concepts.map(c=>[c.role,c.concept,c.source])).toEqual([['measures','Delay','kpi-binding'],['of','Flight','kpi-binding']]);
 expect(kpis[0].concepts).toEqual([]);expect(kpis[0].layout).toBe('embedded (deprecated)');
});
