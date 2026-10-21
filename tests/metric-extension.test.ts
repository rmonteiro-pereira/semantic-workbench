import {test,expect} from 'bun:test';
import {parseDocument,stringify} from 'yaml';
import {validateInput} from '../src/input';
import {ansiExpression} from '../src/metrics/deps';
import {inferredAdditivity,inferredType,readMetricExtension} from '../src/metrics/extension';
// Metric extensions (FR-003, FR-004) on copies of the 34 metrics shipped in the examples.
const shipped=['billing/billing.semantic.yaml','commerce/sales.ossie.yaml','commerce/commerce.mapped-semantic.yaml','mall/mall.semantic.yaml'];
// A copy with an extension on every metric: mall's own, inferred ones elsewhere.
async function annotated(file:string){
 const source=await Bun.file('public/examples/'+file).text(),doc=parseDocument(source),data=doc.toJS(),names=new Set<string>(data.metrics.map((m:any)=>m.name));
 data.metrics.forEach((m:any,i:number)=>{
  if(m.custom_extensions)return;
  const sql=ansiExpression(m),shape=inferredType(sql,names);
  const ext={schema:'semantic-workbench/metric/v1',type:shape.type,...(shape.numerator?{numerator:shape.numerator,denominator:shape.denominator}:{}),...(shape.inputs?{inputs:shape.inputs}:{}),...(shape.type==='ratio'?{additivity:'non_additive'}:{})};
  doc.setIn(['metrics',i,'custom_extensions'],doc.createNode([{vendor_name:'SEMANTIC_WORKBENCH',data:JSON.stringify(ext,null,2)+'\n'}]));
 });
 return {file,source:doc.toString({lineWidth:0}),count:data.metrics.length};
}
test('the 34 shipped metrics carry valid extensions that parse back',async()=>{
 const copies=await Promise.all(shipped.map(annotated));expect(copies.reduce((n,c)=>n+c.count,0)).toBe(34);
 let parsed=0;
 for(const c of copies){
  const r=validateInput(c.source,c.file.split('/')[1]);expect(r.issues.filter(i=>i.severity==='error')).toEqual([]);expect(r.valid).toBe(true);
  for(const m of parseDocument(c.source).toJS().metrics){const {value,issues}=readMetricExtension(m);expect(issues).toEqual([]);expect(value?.schema).toBe('semantic-workbench/metric/v1');parsed++;}
 }
 expect(parsed).toBe(34);
});
test('schema errors are located on the offending key inside the block, line and column',async()=>{
 for(const c of await Promise.all(shipped.map(annotated))){
  const doc=parseDocument(c.source);
  doc.toJS().metrics.forEach((m:any,i:number)=>{const data=JSON.parse(m.custom_extensions[0].data);delete data.non_additive_over;delete data.period_aggregation;doc.setIn(['metrics',i,'custom_extensions',0,'data'],JSON.stringify({...data,additivity:'sometimes'},null,2)+'\n');});
  const broken=doc.toString({lineWidth:0});
  const r=validateInput(broken,c.file.split('/')[1]);expect(r.valid).toBe(false);
  const errors=r.issues.filter(i=>i.code==='extension'&&!i.message.startsWith('A ratio'));expect(errors.length).toBe(c.count);
  const lines=broken.split('\n');
  for(const e of errors){expect(e.line).toBeGreaterThan(0);expect(lines[e.line!-1].slice(e.column!-1)).toStartWith('"additivity"');}
 }
});
const model=(metrics:any[],extra:any={})=>stringify({version:'0.2.0.dev0',name:'m',datasets:[{name:'orders',source:'s.orders',primary_key:['id'],fields:['id','amount','order_date','region'].map(name=>({name,expression:{dialects:[{dialect:'ANSI_SQL',expression:name}]}}))}],metrics:metrics.map(([name,expression,ext])=>({name,expression:{dialects:[{dialect:'ANSI_SQL',expression}]},...(ext?{custom_extensions:[{vendor_name:'SEMANTIC_WORKBENCH',data:JSON.stringify({schema:'semantic-workbench/metric/v1',...ext},null,2)+'\n'}]}:{})})),...extra});
const messages=(source:string)=>validateInput(source,'m.yaml').issues.map(i=>`${i.severity}:${i.code}:${i.message}`);
test('plain-language rules: ratio, semi-additive and deprecated',()=>{
 const m=messages(model([['revenue','SUM(orders.amount)',{type:'simple'}],['count','COUNT(orders.id)',null],
  ['avg','revenue / NULLIF(count, 0)',{type:'ratio',numerator:'revenue'}],
  ['stock','SUM(orders.amount)',{type:'simple',additivity:'semi_additive'}],
  ['old','SUM(orders.amount)',{type:'simple',status:'deprecated'}],
  ['summed_ratio','revenue / NULLIF(count, 0)',{type:'ratio',numerator:'revenue',denominator:'count',additivity:'additive'}]]));
 expect(m).toContain('error:extension:A ratio metric requires numerator and denominator.');
 expect(m).toContain('error:extension:A semi_additive metric requires non_additive_over and period_aggregation.');
 expect(m).toContain('error:extension:A deprecated metric requires replaced_by or deprecation_reason.');
 expect(m).toContain('error:extension:A ratio metric is non_additive: summing ratios gives a wrong result.');
 // Unknown keys and malformed JSON are reported, not ignored.
 expect(messages(model([['a','SUM(orders.amount)',{type:'simple',colour:'red'}]])).some(x=>x.includes('colour'))).toBe(true);
 const bad=model([['a','SUM(orders.amount)',{type:'simple'}]]).replace('"type": "simple"','"type": "simple",');
 expect(messages(bad).some(x=>x.includes('not valid JSON'))).toBe(true);
});
test('workspace findings: inputs exist, cycles, grains, fields and declared type (FR-004)',()=>{
 const m=messages(model([
  ['revenue','SUM(orders.amount)',{type:'simple',time:{dimension:'orders.order_date',min_grain:'month',allowed_grains:['day','month']},dimensions:['orders.region','orders.missing'],filters:[{field:'orders.nope',operator:'equals',value:1}]}],
  ['margin','revenue / NULLIF(cost, 0)',{type:'ratio',numerator:'revenue',denominator:'cost'}],
  ['a','b + 1',{type:'derived',inputs:['b']}],['b','a + 1',{type:'derived',inputs:['a','ghost']}],
  ['mislabelled','revenue * 2',{type:'simple'}],
  ['not_ratio','revenue - revenue',{type:'ratio',numerator:'revenue',denominator:'revenue'}]]));
 expect(m).toContain('error:kpi-reference:denominator "cost" is not a metric of this semantic model.');
 expect(m).toContain('error:kpi-reference:Input "ghost" is not a metric of this semantic model.');
 expect(m.some(x=>x.startsWith('warning:metric-cycle:Metric dependency cycle: a → b → a'))).toBe(true);
 expect(m).toContain('error:kpi-grain:Grain day is finer than the minimum grain month.');
 expect(m).toContain('error:kpi-reference:Field orders.missing does not exist in this semantic model.');
 expect(m).toContain('error:kpi-reference:Field orders.nope does not exist in this semantic model.');
 expect(m.some(x=>x.startsWith('warning:kpi-type:Declared simple, but the expression uses other metrics (revenue)'))).toBe(true);
 expect(m.some(x=>x.startsWith('warning:kpi-type:Declared ratio revenue / revenue, but the expression is not a division'))).toBe(true);
 expect(m.some(x=>x.includes('orders.region'))).toBe(false);
});
test('type and additivity are inferred from the expression when not declared',()=>{
 const names=new Set(['a','b']);
 expect(inferredType('a / NULLIF(b, 0)',names)).toEqual({type:'ratio',numerator:'a',denominator:'b'});
 expect(inferredType('a - b',names)).toEqual({type:'derived',inputs:['a','b']});
 expect(inferredType('SUM(t.x)',names).type).toBe('simple');
 expect(inferredAdditivity('SUM(t.x)','simple',()=>null)).toBe('additive');
 expect(inferredAdditivity('COUNT(DISTINCT t.x)','simple',()=>null)).toBe('non_additive');
 expect(inferredAdditivity('AVG(t.x)','simple',()=>null)).toBe('non_additive');
 expect(inferredAdditivity('a / NULLIF(b, 0)','ratio',()=>'additive')).toBe('non_additive');
 expect(inferredAdditivity('a - b','derived',()=>'additive',['a','b'])).toBe('additive');
 expect(inferredAdditivity('a - b','derived',n=>n==='a'?'semi_additive':'additive',['a','b'])).toBe('semi_additive');
 expect(inferredAdditivity('t.x','simple',()=>null)).toBe(null);
});
