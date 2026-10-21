// Full pierce in the lineage and mapping canvases (FR-023, research R5): from a column (or every
// column of a card) follow lines upstream, downstream or both (ancestors plus descendants, never
// siblings), and open the cards they reach in breadth-first order, cut at a card budget. Runs in
// lineage-pierce.worker.ts; pure so it is unit- and mutation-tested.
export type LineagePierceInput={edges:[string,string][];owners:Record<string,string>;start:string[];direction:'out'|'in'|'both';budget:number};
export type LineagePierceResult={cards:string[];total:number;hidden:number;steps:Record<string,number>};
export function lineagePierce(i:LineagePierceInput):LineagePierceResult{
 const out=new Map<string,string[]>(),inn=new Map<string,string[]>();
 for(const [a,b] of i.edges){(out.get(a)??out.set(a,[]).get(a)!).push(b);(inn.get(b)??inn.set(b,[]).get(b)!).push(a);}
 const owner=(n:string)=>i.owners[n]??n,cardStep=new Map<string,number>();
 const walk=(adj:Map<string,string[]>)=>{const seen=new Map<string,number>(i.start.map(s=>[s,0])),q=[...i.start];
  while(q.length){const n=q.shift()!,d=seen.get(n)!;for(const m of adj.get(n)??[])if(!seen.has(m)){seen.set(m,d+1);q.push(m);}}
  for(const [n,d] of seen){const c=owner(n);cardStep.set(c,Math.min(cardStep.get(c)??Infinity,d));}};
 if(i.direction!=='in')walk(out);if(i.direction!=='out')walk(inn);
 const ordered=[...cardStep].sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0])),cards=ordered.slice(0,Math.max(1,i.budget)).map(([c])=>c);
 return {cards,total:ordered.length,hidden:ordered.length-cards.length,steps:Object.fromEntries(ordered.slice(0,cards.length))};
}
