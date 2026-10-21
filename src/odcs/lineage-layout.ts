// Layout of the lineage canvas (research R3): ELK `layered`, left to right, one port per visible
// row on each side of a card (FIXED_POS, so lines leave and enter at their rows). Pure geometry
// here; the ELK run happens in ELK's own worker (elk-worker), off the main thread.
export const CARD_W=400,HEADER_H=64,ROW_H=30,PAGER_H=32,MORE_H=28;
export type LayoutCard={id:string;rows:string[];pager:boolean;more:boolean};
export type LayoutEdge={id:string;from:string;to:string;fromCard:string;toCard:string};
export const cardHeight=(c:LayoutCard)=>HEADER_H+c.rows.length*ROW_H+(c.more?MORE_H:0)+(c.pager?PAGER_H:0);
// Port y offsets: rows in order, then the "more" row. A column-less card uses its header.
export function portY(c:LayoutCard,row:string){
 if(row===c.id)return HEADER_H/2;
 const i=c.rows.indexOf(row);if(i>=0)return HEADER_H+i*ROW_H+ROW_H/2;
 return HEADER_H+c.rows.length*ROW_H+MORE_H/2;
}
export function elkGraph(cards:LayoutCard[],edges:LayoutEdge[]){
 return {id:'root',layoutOptions:{'elk.algorithm':'layered','elk.direction':'RIGHT','elk.edgeRouting':'SPLINES','elk.layered.spacing.nodeNodeBetweenLayers':'110','elk.spacing.nodeNode':'34','elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES','elk.layered.crossingMinimization.semiInteractive':'false','elk.separateConnectedComponents':'true','elk.spacing.componentComponent':'60'},
  children:cards.map(c=>({id:c.id,width:CARD_W,height:cardHeight(c),layoutOptions:{'elk.portConstraints':'FIXED_POS'},
   ports:[c.id,...c.rows,...(c.more?[c.id+'/#more']:[])].flatMap(r=>[{id:r+':in',x:0,y:portY(c,r),width:1,height:1,layoutOptions:{'elk.port.side':'WEST'}},{id:r+':out',x:CARD_W-1,y:portY(c,r),width:1,height:1,layoutOptions:{'elk.port.side':'EAST'}}])})),
  edges:edges.map(e=>({id:e.id,sources:[e.from+':out'],targets:[e.to+':in']}))};
}
export type LayoutResult={positions:Record<string,{x:number;y:number}>};
export const positionsOf=(result:any):LayoutResult=>({positions:Object.fromEntries((result.children??[]).map((n:any)=>[n.id,{x:n.x??0,y:n.y??0}]))});
