import type {KpiType} from './extension';
// The metric wizard's draft → the metric expression and the SEMANTIC_WORKBENCH extension it saves.
export type Draft={measures:string;of:string;file:string;name:string;label:string;description:string;type:KpiType;aggregation:string;field:string;numerator:string;denominator:string;inputs:string;expression:string;window:string;windowLength:string;windowGrain:string;filterField:string;filterOperator:string;filterValue:string;
 additivity:string;timeDimension:string;minGrain:string;grains:string[];dimensions:string[];direction:string;target:string;targetGrain:string;warning:string;critical:string;owner:string;steward:string;status:string;unit:string;format:string};
export function expressionFor(d:Draft){
 if(d.type==='simple')return d.field?(d.aggregation==='COUNT DISTINCT'?`COUNT(DISTINCT ${d.field})`:`${d.aggregation}(${d.field})`):'';
 if(d.type==='ratio')return d.numerator&&d.denominator?`${d.numerator} / NULLIF(${d.denominator}, 0)`:'';
 return d.expression.trim();
}
export const list=(s:string)=>s.split(',').map(x=>x.trim()).filter(Boolean);
const num=(s:string)=>s.trim()===''?undefined:Number(s);
// The extension names inputs and rules; the formula stays in the metric's expression (FR-002).
export function extensionFor(d:Draft):Record<string,any>{
 const e:Record<string,any>={label:d.label.trim()||undefined,type:d.type};
 if(d.type==='ratio'){e.numerator=d.numerator;e.denominator=d.denominator;}
 if(['derived','cumulative','filtered'].includes(d.type)&&list(d.inputs).length)e.inputs=list(d.inputs);
 if(d.type==='cumulative')e.window={kind:d.window||'to_date',...(d.window==='rolling'&&num(d.windowLength)?{length:num(d.windowLength)}:{}),...(d.windowGrain?{grain:d.windowGrain}:{})};
 if(d.type==='filtered'&&d.filterField)e.filters=[{field:d.filterField,operator:d.filterOperator||'equals',...(['is_null','is_not_null'].includes(d.filterOperator)?{}:{value:d.filterValue})}];
 const additivity=d.additivity||(d.type==='ratio'?'non_additive':d.type==='simple'&&['SUM','COUNT'].includes(d.aggregation)?'additive':'');
 if(additivity)e.additivity=additivity;
 if(additivity==='semi_additive'){e.non_additive_over='time';e.period_aggregation='last';}
 if(d.timeDimension)e.time={dimension:d.timeDimension,...(d.minGrain?{min_grain:d.minGrain}:{}),...(d.grains.length?{allowed_grains:d.grains}:{})};
 if(d.dimensions.length)e.dimensions=d.dimensions;
 if(d.unit.trim())e.unit=d.unit.trim();if(d.format.trim())e.format=d.format.trim();
 if(d.direction&&num(d.target)!==undefined){const ops=d.direction==='higher_is_better'?'mustBeLessThan':'mustBeGreaterThan',thresholds:Record<string,any>={};
  if(num(d.warning)!==undefined)thresholds.warning={[ops]:num(d.warning)};if(num(d.critical)!==undefined)thresholds.critical={[ops]:num(d.critical)};
  e.targets=[{...(d.targetGrain?{grain:d.targetGrain}:{}),direction:d.direction,value:num(d.target),...(Object.keys(thresholds).length?{thresholds}:{})}];}
 if(d.owner.trim())e.owner=d.owner.trim();if(d.steward.trim())e.steward=d.steward.trim();e.status=d.status||'proposed';
 return Object.fromEntries(Object.entries(e).filter(([,v])=>v!==undefined));
}
