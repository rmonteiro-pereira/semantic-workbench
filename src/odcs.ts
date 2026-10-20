// ODCS 3.1 foreign keys: property-level `relationships` (from is the property) and
// schema-level `relationships` (explicit from/to). References use shorthand
// `object.property` or fully qualified `schema/<id>/properties/<id>` notation.
// References into another contract file are external and never resolved here.
export type OdcsForeignKey={from:number;to:number;label:string;path:(string|number)[];definition:any};
export type OdcsReferenceIssue={path:string;message:string};
const list=(v:unknown)=>Array.isArray(v)?v:v===undefined?[]:[v];
function resolver(schema:any[]){
 const byName=new Map<string,number>(),byId=new Map<string,number>();
 schema.forEach((x,i)=>{if(x&&typeof x==='object'){if(typeof x.name==='string')byName.set(x.name,i);if(typeof x.id==='string')byId.set(x.id,i);}});
 return (ref:unknown):number|'external'|undefined=>{
  if(typeof ref!=='string')return undefined;
  if(/\.ya?ml#/.test(ref))return 'external';
  const qualified=/^\/?schema\/([^/]+)/.exec(ref);
  if(qualified)return byId.get(qualified[1])??byName.get(qualified[1]);
  const dot=ref.indexOf('.');
  return dot>0?byName.get(ref.slice(0,dot)):undefined;
 };
}
function collect(data:any){
 const schema=Array.isArray(data?.schema)?data.schema:[],resolve=resolver(schema);
 const keys:OdcsForeignKey[]=[],issues:OdcsReferenceIssue[]=[];
 const add=(from:number,toRef:unknown,label:string,path:(string|number)[],definition:any)=>{
  const target=resolve(list(toRef)[0]);
  if(target==='external')return;
  if(target===undefined){issues.push({path:'/'+[...path,'to'].join('/'),message:`Relationship target "${String(list(toRef)[0])}" is not an object of this contract.`});return;}
  keys.push({from,to:target,label,path,definition});
 };
 schema.forEach((x:any,i:number)=>{
  if(!x||typeof x!=='object')return;
  (Array.isArray(x.properties)?x.properties:[]).forEach((p:any,j:number)=>(Array.isArray(p?.relationships)?p.relationships:[]).forEach((r:any,k:number)=>{if(r&&typeof r==='object')add(i,r.to,String(p.name),['schema',i,'properties',j,'relationships',k],{from:`${x.name}.${p.name}`,...r});}));
  (Array.isArray(x.relationships)?x.relationships:[]).forEach((r:any,k:number)=>{
   if(!r||typeof r!=='object')return;
   const from=resolve(list(r.from)[0]),path=['schema',i,'relationships',k];
   if(typeof from!=='number'){if(from!=='external')issues.push({path:'/'+[...path,'from'].join('/'),message:`Relationship source "${String(list(r.from)[0])}" is not an object of this contract.`});return;}
   add(from,r.to,list(r.from).map(f=>String(f).split('.').pop()).join(', '),path,r);
  });
 });
 return {keys,issues};
}
export const odcsForeignKeys=(data:any)=>collect(data).keys;
export const odcsReferenceIssues=(data:any)=>collect(data).issues;
