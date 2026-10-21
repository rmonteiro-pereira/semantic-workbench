import type {Entity,Relationship} from './model';
// Neighborhood projection (FR-034–FR-039, research R10). The OWL "classes only" projection is a
// property of the model, not of the center: technical resources (properties, restrictions, plain
// RDF resources) appear only when the user asks for them. A center shows its neighbors, ranked
// deterministically (relationship kind, then name), up to a page size; the rest are counted and can
// be revealed. Relationships among visible neighbors are kept unless the user hides them.
export type NeighborhoodOptions={center?:string;limit?:number;lateral?:boolean;technical?:boolean;relationship?:string;keep?:string[]};
export type Neighborhood={center:string|undefined;entities:Entity[];edges:Relationship[];incoming:string[];outgoing:string[];both:string[];total:number;shown:number;hidden:number;lateral:number;relationships:{label:string;count:number}[];technicalHidden:number};
export const NEIGHBOR_PAGE=12;
const byName=(a:Entity,b:Entity)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
// Entities and edges of the default projection; `technical` includes everything.
export function projectModel(entities:Entity[],edges:Relationship[],technical=false){
 if(technical||!entities.some(e=>e.kind==='OWL class'))return {entities,edges,technicalHidden:0};
 const classes=entities.filter(e=>e.kind==='OWL class'),ids=new Set(classes.map(e=>e.id));
 return {entities:classes,edges:edges.filter(e=>ids.has(e.source)&&ids.has(e.target)),technicalHidden:entities.length-classes.length};
}
// Search ranking: exact name, name prefix, word prefix, name substring, then IRI/id substring.
export function searchEntities(entities:Entity[],query:string,limit=50):Entity[]{
 const q=query.trim().toLowerCase();if(!q)return [];
 const score=(e:Entity)=>{const n=e.name.toLowerCase();if(n===q)return 0;if(n.startsWith(q))return 1;if(e.name.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().split(/[^\p{L}\p{N}]+/u).some(w=>w.startsWith(q)))return 2;if(n.includes(q))return 3;if(e.id.toLowerCase().includes(q))return 4;return 9;};
 return entities.map(e=>({e,s:score(e)})).filter(x=>x.s<9).sort((a,b)=>a.s-b.s||a.e.name.length-b.e.name.length||byName(a.e,b.e)).slice(0,limit).map(x=>x.e);
}
// The default center: the most connected entity (ties by name), so a fresh view is never a leaf.
// Value types and built-ins are hubs of attributes, not useful starting points, so they are passed
// over when the model has anything else.
const VALUE_KINDS=new Set(['ValueType','Built-in concept']);
export function defaultCenter(entities:Entity[],edges:Relationship[]){
 const candidates=entities.some(e=>!VALUE_KINDS.has(e.kind))?entities.filter(e=>!VALUE_KINDS.has(e.kind)):entities,ids=new Set(candidates.map(e=>e.id));
 const degree=new Map<string,number>();for(const e of edges)if(ids.has(e.source)&&ids.has(e.target)&&e.source!==e.target){degree.set(e.source,(degree.get(e.source)??0)+1);degree.set(e.target,(degree.get(e.target)??0)+1);}
 return [...candidates].sort((a,b)=>(degree.get(b.id)??0)-(degree.get(a.id)??0)||byName(a,b))[0]?.id;
}
export function neighborhood(allEntities:Entity[],allEdges:Relationship[],options:NeighborhoodOptions={}):Neighborhood{
 const {entities,edges,technicalHidden}=projectModel(allEntities,allEdges,options.technical);
 const byId=new Map(entities.map(e=>[e.id,e]));
 const center=options.center&&byId.has(options.center)?options.center:defaultCenter(entities,edges);
 const empty={center,entities:center?[byId.get(center)!]:[],edges:[],incoming:[],outgoing:[],both:[],total:0,shown:0,hidden:0,lateral:0,relationships:[],technicalHidden};
 if(!center)return empty;
 // Every neighbor with its direction(s) and the kinds and labels of the relationships that reach it.
 const touching=edges.filter(e=>e.source===center||e.target===center);
 const relationships=new Map<string,number>();for(const e of touching)relationships.set(e.label,(relationships.get(e.label)??0)+1);
 const filtered=options.relationship?touching.filter(e=>e.label===options.relationship):touching;
 const info=new Map<string,{incoming:boolean;outgoing:boolean;kind:string}>();
 for(const e of filtered){const other=e.source===center?e.target:e.source;if(other===center)continue;const i=info.get(other)??{incoming:false,outgoing:false,kind:e.data.kind};if(e.source===center)i.outgoing=true;if(e.target===center)i.incoming=true;if(e.data.kind<i.kind)i.kind=e.data.kind;info.set(other,i);}
 const ranked=[...info.keys()].filter(id=>byId.has(id)).sort((a,b)=>info.get(a)!.kind.localeCompare(info.get(b)!.kind)||byName(byId.get(a)!,byId.get(b)!));
 const limit=Math.max(1,options.limit??NEIGHBOR_PAGE),keep=new Set((options.keep??[]).filter(id=>info.has(id)));
 const shownIds=[...new Set([...ranked.filter(id=>keep.has(id)),...ranked.slice(0,limit)])].sort((a,b)=>ranked.indexOf(a)-ranked.indexOf(b));
 const included=new Set([center,...shownIds]);
 const visibleEdges=edges.filter(e=>included.has(e.source)&&included.has(e.target)&&(e.source===center||e.target===center?(!options.relationship||e.label===options.relationship||e.source===e.target):options.lateral!==false));
 const dir=(id:string)=>info.get(id)!;
 const lateral=edges.filter(e=>e.source!==center&&e.target!==center&&included.has(e.source)&&included.has(e.target)).length;
 return {center,entities:[byId.get(center)!,...shownIds.map(id=>byId.get(id)!)],edges:visibleEdges,
  incoming:shownIds.filter(id=>dir(id).incoming&&!dir(id).outgoing),outgoing:shownIds.filter(id=>dir(id).outgoing&&!dir(id).incoming),both:shownIds.filter(id=>dir(id).incoming&&dir(id).outgoing),
  total:ranked.length,shown:shownIds.length,hidden:ranked.length-shownIds.length,lateral,relationships:[...relationships.entries()].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)),technicalHidden};
}
// Compatibility wrapper used by tests and imports: a bounded neighborhood, a search result as center,
// or every projected entity with `all`.
export function graphView(entities:Entity[],edges:Relationship[],query:string,all=false,limit=8,focusId=''){
 if(all&&!query){const p=projectModel(entities,edges,true);return {entities:p.entities,edges:p.edges,focus:focusId||p.entities[0]?.id};}
 const projected=projectModel(entities,edges);
 const center=query?searchEntities(projected.entities,query,1)[0]?.id:focusId||undefined;
 if(query&&!center)return {entities:[],edges:[],focus:undefined};
 const n=neighborhood(entities,edges,{center,limit:Math.max(1,limit-1)});
 return {entities:n.entities,edges:n.edges,focus:n.center};
}
export function groupRelationships(edges:Relationship[]){
 const groups=new Map<string,Relationship[]>();
 for(const edge of edges){const key=JSON.stringify([edge.source,edge.target]);const group=groups.get(key)??[];group.push(edge);groups.set(key,group);}
 return [...groups.values()].map(relationships=>({...relationships[0],data:{...relationships[0].data,relationships}}));
}
