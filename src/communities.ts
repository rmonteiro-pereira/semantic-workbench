import type {Entity,Relationship} from './model';
export const isBusinessEntity=(entity:Entity)=>entity.kind==='EntityType'||entity.kind==='OWL class';
export const isInheritance=(edge:Relationship)=>/inheritance|subclass/i.test(edge.data.kind)||/^(extends|subClassOf|rdfs:subClassOf)$/i.test(edge.label);
/** Deterministic bounded modularity local-moving on a simple undirected
 * business backbone. Multiplicity, direction, inheritance and primitive hubs
 * do not affect community weights. This is a suggestion, never a domain claim. */
export function suggestCommunities(entities:Entity[],edges:Relationship[]){
 const business=entities.filter(isBusinessEntity).sort((a,b)=>a.id.localeCompare(b.id));
 const adjacent=new Map(business.map(e=>[e.id,new Set<string>()]));
 for(const edge of edges)if(!isInheritance(edge)&&edge.source!==edge.target&&adjacent.has(edge.source)&&adjacent.has(edge.target)){adjacent.get(edge.source)!.add(edge.target);adjacent.get(edge.target)!.add(edge.source);}
 const membership=new Map(business.map(e=>[e.id,e.id]));const degree=new Map([...adjacent].map(([id,next])=>[id,next.size]));const totals=new Map(degree);const twiceEdges=[...degree.values()].reduce((a,b)=>a+b,0);
 let passes=0;
 if(twiceEdges)for(;passes<20;passes++){
  let changed=false;
  for(const entity of business){const id=entity.id,old=membership.get(id)!,k=degree.get(id)!;if(!k)continue;
   const weights=new Map<string,number>();for(const neighbor of [...adjacent.get(id)!].sort()){const group=membership.get(neighbor)!;weights.set(group,(weights.get(group)??0)+1);}
   totals.set(old,totals.get(old)!-k);
   const score=(group:string)=>(weights.get(group)??0)-k*(totals.get(group)??0)/twiceEdges;
   let best=old,bestScore=score(old);
   for(const candidate of [...weights.keys()].sort()){const value=score(candidate);if(value>bestScore+1e-10){best=candidate;bestScore=value;}}
   membership.set(id,best);totals.set(best,(totals.get(best)??0)+k);if(best!==old)changed=true;
  }
  if(!changed)break;
 }
 const clusters=new Map<string,string[]>();for(const [id,group] of membership){const ids=clusters.get(group)??[];ids.push(id);clusters.set(group,ids);}
 const anchors=new Map<string,string>();for(const ids of clusters.values()){const anchor=ids.slice().sort((a,b)=>(degree.get(b)!-degree.get(a)!)||a.localeCompare(b))[0];for(const id of ids)anchors.set(id,anchor);}
 return {membership:anchors,degree,passes,backboneEdges:twiceEdges/2};
}
