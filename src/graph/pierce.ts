import type {Direction,Link} from './expansion';
// Full pierce (FR-020–FR-022, research R5): the transitive closure from the start nodes along the
// chosen direction, optionally one relationship label, honouring the Value types, Technical
// resources and metrics switches, cut at a node budget. Breadth first; within a step nodes are
// ordered by the relationship that reached them, then name, then id, so the result is the same
// for the same input. Each node appears once; cycles terminate. Runs in pierce.worker.ts.
export type PierceNode={id:string;name:string;kind:string};
export type PierceOptions={direction:Direction;relationship?:string;valueTypes:boolean;technical:boolean;metrics:boolean;budget:number};
export type PierceResult={nodes:string[];edges:string[];steps:Record<string,number>;frontier:Record<string,number>;total:number;shown:number;hidden:number;maxStep:number};
export const PIERCE_BUDGET=150,PIERCE_MAX=500;
const VALUE_KINDS=new Set(['ValueType','Built-in concept']);
// Technical resources as the Neighborhood projection reads them: in a model with OWL classes,
// everything that is not a class.
export function technicalIds(nodes:PierceNode[]){return nodes.some(n=>n.kind==='OWL class')?new Set(nodes.filter(n=>n.kind!=='OWL class').map(n=>n.id)):new Set<string>();}
export function boundedClosure(nodes:PierceNode[],edges:Link[],start:string[],o:PierceOptions):PierceResult{
 const byId=new Map(nodes.map(n=>[n.id,n])),technical=o.technical?new Set<string>():technicalIds(nodes);
 const allowed=(id:string)=>{const n=byId.get(id);if(!n)return false;if(!o.valueTypes&&VALUE_KINDS.has(n.kind))return false;if(!o.metrics&&n.kind==='Metric')return false;return !technical.has(id);};
 const adj=new Map<string,{to:string;label:string;edge:string}[]>();
 const add=(a:string,b:string,label:string,edge:string)=>{(adj.get(a)??adj.set(a,[]).get(a)!).push({to:b,label,edge});};
 for(const e of edges){if(o.relationship&&e.label!==o.relationship)continue;if(e.source===e.target)continue;
  if(o.direction!=='in')add(e.source,e.target,e.label,e.id);if(o.direction!=='out')add(e.target,e.source,e.label,e.id);}
 const name=(id:string)=>byId.get(id)?.name??id;
 for(const list of adj.values())list.sort((a,b)=>a.label.localeCompare(b.label)||name(a.to).localeCompare(name(b.to))||a.to.localeCompare(b.to));
 // Full closure, in order.
 const steps:Record<string,number>={},order:string[]=[],via:Record<string,string>={};
 let layer=[...new Set(start)].filter(id=>byId.has(id)).sort((a,b)=>name(a).localeCompare(name(b))||a.localeCompare(b));
 for(const id of layer){steps[id]=0;order.push(id);}
 let step=0;
 while(layer.length){
  step++;const next:{id:string;label:string}[]=[];
  for(const id of layer)for(const n of adj.get(id)??[])if(steps[n.to]===undefined&&allowed(n.to)){steps[n.to]=step;via[n.to]=n.edge;next.push({id:n.to,label:n.label});}
  next.sort((a,b)=>a.label.localeCompare(b.label)||name(a.id).localeCompare(name(b.id))||a.id.localeCompare(b.id));
  layer=next.map(n=>n.id);order.push(...layer);
 }
 const budget=Math.max(1,Math.min(o.budget,PIERCE_MAX)),shownList=order.slice(0,budget),shown=new Set(shownList);
 const frontier:Record<string,number>={};
 for(const id of shownList){let n=0;const seen=new Set<string>();for(const x of adj.get(id)??[])if(!shown.has(x.to)&&steps[x.to]!==undefined&&!seen.has(x.to)){seen.add(x.to);n++;}if(n)frontier[id]=n;}
 // The lines drawn are the ones that reached each node (a tree): every shown node is connected
 // to the start, and the canvas is not buried under every relationship among 150 nodes.
 const edgeIds=shownList.filter(id=>via[id]).map(id=>via[id]);
 const shownSteps:Record<string,number>={};for(const id of shownList)shownSteps[id]=steps[id];
 return {nodes:shownList,edges:edgeIds,steps:shownSteps,frontier,total:order.length,shown:shownList.length,hidden:order.length-shownList.length,maxStep:Math.max(0,...shownList.map(id=>steps[id]))};
}
