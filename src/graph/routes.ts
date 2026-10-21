import type {Link} from '../layout';
// Orthogonal routes with rounded corners (FR-040). Every edge has its own route: short forward
// edges bend at their own x inside the gap between columns; long and backward edges travel on their
// own lane above or below the neighborhood, with their own stubs, and carry their label on that
// lane; a self-relationship loops over its node. Corners turn the way the path actually travels.
// Every vertical segment has its own x: outX/inX/bendX/laneX are absolute positions allocated per
// gap between columns. dyOut/dyIn spread the edges that leave or enter one side of a node.
export type EdgeRoute=({route:'short';bendX:number}|{route:'side';laneX:number;endX:number;endY:number}|{route:'lane';laneY:number;outX:number;inX:number}|{route:'loop';outX:number;inX:number;top:number})&{dyOut?:number;dyIn?:number};
export function orthogonalPath(points:[number,number][],radius=10){
 const p=points.filter((pt,i)=>i===0||pt[0]!==points[i-1][0]||pt[1]!==points[i-1][1]);
 let d=`M ${p[0][0]},${p[0][1]}`;
 for(let i=1;i<p.length;i++){
  const [x,y]=p[i];if(i===p.length-1){d+=` L ${x},${y}`;break;}
  const [px,py]=p[i-1],[nx,ny]=p[i+1];
  const r=Math.min(radius,Math.hypot(x-px,y-py)/2,Math.hypot(nx-x,ny-y)/2);
  const ax=x-Math.sign(x-px)*r,ay=y-Math.sign(y-py)*r,bx=x+Math.sign(nx-x)*r,by=y+Math.sign(ny-y)*r;
  d+=` L ${ax},${ay} Q ${x},${y} ${bx},${by}`;
 }
 return d;
}
export function routePoints(sx:number,sy0:number,tx:number,ty0:number,r:EdgeRoute):{points:[number,number][];label:[number,number]}{
 const sy=sy0+(r.dyOut??0),ty=ty0+(r.dyIn??0);
 // Between two nodes of one column: out of the source's right side, along the column, into the
 // target's right side.
 if(r.route==='side'){const ey=r.endY+(r.dyIn??0);return {points:[[sx,sy],[r.laneX,sy],[r.laneX,ey],[r.endX,ey]],label:[r.laneX,(sy+ey)/2]};}
 if(r.route==='short')return {points:[[sx,sy],[r.bendX,sy],[r.bendX,ty],[tx,ty]],label:[r.bendX,(sy+ty)/2]};
 const lane=r.route==='loop'?r.top:r.laneY;
 return {points:[[sx,sy],[r.outX,sy],[r.outX,lane],[r.inX,lane],[r.inX,ty],[tx,ty]],label:[(r.outX+r.inX)/2,lane]};
}
// Routes for a set of edges between laid-out nodes. Boxes are the node rectangles; handles sit on
// the right (source) and left (target) edges at mid height.
export type Box={x:number;y:number;width:number;height:number};
export function assignRoutes(edges:(Link&{id:string})[],boxes:Map<string,Box>):Map<string,EdgeRoute>{
 const routes=new Map<string,EdgeRoute>();
 const all=[...boxes.values()];if(!all.length)return routes;
 const top=Math.min(...all.map(b=>b.y)),bottom=Math.max(...all.map(b=>b.y+b.height));
 // The free gap right of x (next column's left edge) and left of x (previous column's right edge).
 const rightOf=(x:number)=>{const n=all.filter(b=>b.x>x+1).map(b=>b.x);return [x,n.length?Math.min(...n):x+110] as const;};
 const leftOf=(x:number)=>{const n=all.filter(b=>b.x+b.width<x-1).map(b=>b.x+b.width);return [n.length?Math.max(...n):x-110,x] as const;};
 type Need={edge:string;slot:'bendX'|'laneX'|'outX'|'inX';order:number};const gaps=new Map<string,{range:readonly [number,number];needs:Need[]}>();
 const need=(range:readonly [number,number],n:Need)=>{const k=range.map(Math.round).join(':');const g=gaps.get(k)??{range,needs:[]};g.needs.push(n);gaps.set(k,g);};
 let above=0,below=0;
 for(const e of [...edges].sort((a,b)=>a.id.localeCompare(b.id))){
  const s=boxes.get(e.source),t=boxes.get(e.target);if(!s||!t)continue;
  const sx=s.x+s.width,sy=s.y+s.height/2,tx=t.x,ty=t.y+t.height/2;
  if(e.source===e.target){routes.set(e.id,{route:'loop',outX:0,inX:0,top:s.y-14-(above++)*0});need(rightOf(sx),{edge:e.id,slot:'outX',order:sy});need(leftOf(tx),{edge:e.id,slot:'inX',order:ty});continue;}
  // Same column: a lane of its own just right of the column.
  if(Math.abs(s.x-t.x)<4){routes.set(e.id,{route:'side',laneX:0,endX:t.x+t.width,endY:ty});need(rightOf(Math.max(sx,t.x+t.width)),{edge:e.id,slot:'laneX',order:(sy+ty)/2});continue;}
  // Forward to the next column only: bend in the gap. Anything else gets a lane of its own.
  if(tx-sx>24&&!all.some(b=>b!==s&&b!==t&&b.x>sx&&b.x+b.width<tx)){routes.set(e.id,{route:'short',bendX:0});need([sx,tx],{edge:e.id,slot:'bendX',order:sy+ty});continue;}
  const backward=tx<=sx;
  routes.set(e.id,{route:'lane',laneY:backward?bottom+22+(below++)*16:top-22-(above++)*16,outX:0,inX:0});
  need(rightOf(sx),{edge:e.id,slot:'outX',order:sy});need(leftOf(tx),{edge:e.id,slot:'inX',order:ty});
 }
 // Loops climb just above their node, each at its own height.
 const loopHeights=new Map<string,number>();for(const e of edges)if(e.source===e.target&&routes.get(e.id)?.route==='loop'){const n=loopHeights.get(e.source)??0;loopHeights.set(e.source,n+1);(routes.get(e.id) as any).top=boxes.get(e.source)!.y-14-n*10;}
 // Spread every vertical segment of a gap evenly across it, ordered to limit crossings.
 for(const {range,needs}of gaps.values()){
  needs.sort((a,b)=>a.order-b.order||a.edge.localeCompare(b.edge));
  const [l,r]=range,inner=Math.max(4,r-l-24),step=needs.length>1?Math.min(12,inner/(needs.length-1)):0,start=(l+r)/2-step*(needs.length-1)/2;
  needs.forEach((n,i)=>{(routes.get(n.edge) as any)[n.slot]=start+i*step;});
 }
 // Spread edge ends along each node side, ordered by the other end's height, so no two edges share
 // a start or end segment.
 const spread=(key:'dyOut'|'dyIn',ends:Map<string,{id:string;other:number}[]>)=>{for(const [node,list]of ends){const box=boxes.get(node)!,usable=Math.max(0,box.height/2-14);list.sort((a,b)=>a.other-b.other||a.id.localeCompare(b.id));const step=list.length>1?Math.min(14,2*usable/(list.length-1)):0;list.forEach((e,i)=>{const r=routes.get(e.id);if(r)r[key]=(i-(list.length-1)/2)*step;});}};
 const outs=new Map<string,{id:string;other:number}[]>(),ins=new Map<string,{id:string;other:number}[]>();
 for(const e of edges){const s=boxes.get(e.source),t=boxes.get(e.target);if(!s||!t||!routes.has(e.id))continue;const r=routes.get(e.id)!;outs.set(e.source,[...(outs.get(e.source)??[]),{id:e.id,other:t.y}]);(r.route==='side'?outs:ins).set(r.route==='side'?e.target+'#right':e.target,[...((r.route==='side'?outs:ins).get(r.route==='side'?e.target+'#right':e.target)??[]),{id:e.id,other:s.y}]);}
 // Ends on a node's right side (outgoing and same-column arrivals) share one spread.
 for(const [k,list]of [...outs])if(k.endsWith('#right')){const node=k.slice(0,-6);outs.set(node,[...(outs.get(node)??[]),...list.map(x=>({...x,id:x.id+'#in'}))]);outs.delete(k);}
 const sideIn=new Map<string,number>();
 for(const [node,list]of outs){const box=boxes.get(node)!,usable=Math.max(0,box.height/2-14);list.sort((a,b)=>a.other-b.other||a.id.localeCompare(b.id));const step=list.length>1?Math.min(14,2*usable/(list.length-1)):0;list.forEach((e,i)=>{const dy=(i-(list.length-1)/2)*step;if(e.id.endsWith('#in'))sideIn.set(e.id.slice(0,-3),dy);else{const r=routes.get(e.id);if(r)r.dyOut=dy;}});}
 for(const [id,dy]of sideIn){const r=routes.get(id);if(r)r.dyIn=dy;}
 spread('dyIn',ins);
 return routes;
}
// Label positions that do not overlap each other or the nodes: each label tries the middle of each
// segment of its route (longest first), then the same points shifted up and down; widths are
// estimated from the text (10 px labels).
export function placeLabels(items:{id:string;text:string;points:[number,number][]}[],boxes:Box[]){
 const placed:Box[]=[],out=new Map<string,[number,number]>();
 const hits=(a:Box,b:Box)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
 for(const item of items){
  const w=item.text.length*7+16,h=18;
  const mids=item.points.slice(1).map((p,i)=>{const q=item.points[i];return {at:[(p[0]+q[0])/2,(p[1]+q[1])/2] as [number,number],len:Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1])};}).sort((a,b)=>b.len-a.len).map(m=>m.at);
  const candidates=[...mids,...[18,-18,36,-36,54,-54].flatMap(dy=>mids.map(m=>[m[0],m[1]+dy] as [number,number]))];
  const box=(c:[number,number]):Box=>({x:c[0]-w/2,y:c[1]-h/2,width:w,height:h});
  const free=candidates.find(c=>!placed.some(b=>hits(b,box(c)))&&!boxes.some(b=>hits(b,box(c))))??candidates.find(c=>!placed.some(b=>hits(b,box(c))))??mids[0];
  placed.push(box(free));out.set(item.id,free);
 }
 return out;
}
