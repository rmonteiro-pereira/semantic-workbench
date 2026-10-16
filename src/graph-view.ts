import type {Entity,Relationship} from './model';
export function graphView(entities:Entity[],edges:Relationship[],query:string,all=false,limit=8){
 if(!all && !query && entities.some(e=>e.kind==='OWL class')) {
   const classes=entities.filter(e=>e.kind==='OWL class');const ids=new Set(classes.map(e=>e.id));
   entities=classes;edges=edges.filter(e=>ids.has(e.source)&&ids.has(e.target));
 }
 const matches=entities.filter(e=>e.name.toLowerCase().includes(query.toLowerCase())||e.id.toLowerCase().includes(query.toLowerCase()));
 if(all&&!query)return {entities,edges};
 if(entities.length<=limit&&!query)return {entities,edges};
 const focus=matches[0]?.id;
 const included=new Set<string>();const adjacent=new Map<string,string[]>();
 for(const e of edges){for(const [a,b] of [[e.source,e.target],[e.target,e.source]]){const next=adjacent.get(a)??[];next.push(b);adjacent.set(a,next);}}
 if(focus){included.add(focus);for(const next of adjacent.get(focus)??[]){if(included.size>=limit)break;included.add(next);}}
 return {entities:entities.filter(e=>included.has(e.id)),edges:edges.filter(e=>included.has(e.source)&&included.has(e.target)&&(e.source===focus||e.target===focus))};
}
export function groupRelationships(edges:Relationship[]){
 const groups=new Map<string,Relationship[]>();
 for(const edge of edges){const key=JSON.stringify([edge.source,edge.target]);const group=groups.get(key)??[];group.push(edge);groups.set(key,group);}
 return [...groups.values()].map(relationships=>({...relationships[0],data:{...relationships[0].data,relationships}}));
}
