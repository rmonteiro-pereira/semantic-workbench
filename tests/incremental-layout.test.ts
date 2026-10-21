import {test,expect} from 'bun:test';
import {placeNew,placeLayers,placeBoxes} from '../src/graph/incremental-layout';
// Incremental placement (T040; SC-011).
const g={column:360,row:130};
test('placed nodes never move; new nodes go beside their origin, left for incoming and right for outgoing',()=>{
 const before=new Map([['C',{x:0,y:0}],['A',{x:360,y:0}],['B',{x:360,y:130}]]);
 const after=placeNew(before,'A',[{id:'X',side:1},{id:'P',side:-1}],g);
 for(const [id,p] of before)expect(after.get(id)).toEqual(p);
 expect(after.get('X')).toEqual({x:720,y:0});
 // left of A is the centre's column, occupied at row 0: the nearest free row
 expect(after.get('P')!.x).toBe(0);expect(after.get('P')!.y).toBe(130);
 expect(before.has('X')).toBe(false);
});
test('the nearest free row alternates below and above, and nothing overlaps',()=>{
 const pos=new Map([['O',{x:0,y:0}]]);
 const out=placeNew(pos,'O',['a','b','c','d','e'].map(id=>({id,side:1 as const})),g);
 expect(['a','b','c','d','e'].map(id=>out.get(id)!.y)).toEqual([0,130,-130,260,-260]);
 const keys=[...out.values()].map(p=>`${p.x},${p.y}`);expect(new Set(keys).size).toBe(keys.length);
});
test('step distance places pierce layers further out; an already placed id is left alone',()=>{
 const pos=new Map([['O',{x:0,y:0}],['k',{x:-50,y:999}]]);
 const out=placeNew(pos,'O',[{id:'s2',side:1,step:2},{id:'k',side:1}],g);
 expect(out.get('s2')).toEqual({x:720,y:0});expect(out.get('k')).toEqual({x:-50,y:999});
});
test('deterministic for the same input',()=>{
 const pos=new Map([['O',{x:0,y:0}],['n',{x:360,y:0}]]);const items=['a','b','c'].map(id=>({id,side:1 as const}));
 expect([...placeNew(pos,'O',items,g)]).toEqual([...placeNew(pos,'O',items,g)]);
});
test('pierce layers: steps go further out, each step wraps into columns of at most 8, nothing placed moves or overlaps',()=>{
 const pos=new Map([['O',{x:0,y:0}],['P',{x:360,y:0}]]);
 const items=[...Array.from({length:10},(_,i)=>({id:'a'+i,side:1 as const,step:1})),...Array.from({length:3},(_,i)=>({id:'b'+i,side:1 as const,step:2})),{id:'L',side:-1 as const,step:1}];
 const out=placeLayers(pos,'O',items,g);
 expect(out.get('P')).toEqual({x:360,y:0});
 const xs=(p:string)=>items.filter(i=>i.id.startsWith(p)).map(i=>out.get(i.id)!.x);
 expect(Math.max(...xs('a'))).toBe(720);expect(Math.min(...xs('b'))).toBe(1080);expect(out.get('L')!.x).toBe(-360);
 expect(xs('a').filter(x=>x===360).length).toBe(8);expect(xs('a').filter(x=>x===720).length).toBe(2);
 const keys=[...out.values()].map(p=>`${p.x},${p.y}`);expect(new Set(keys).size).toBe(keys.length);
});
test('cards of different heights: placed beside the origin without overlapping any card; placed cards keep their place',()=>{
 const boxes=new Map([['O',{x:0,y:0,w:400,h:300}],['R',{x:510,y:0,w:400,h:200}]]);
 const out=placeBoxes(boxes,'O',[{id:'a',side:1,w:400,h:100},{id:'b',side:-1,w:400,h:100}]);
 expect(out.get('R')).toEqual({x:510,y:0,w:400,h:200});expect(out.get('a')!.x).toBe(510);expect(out.get('b')!.x).toBe(-510);
 const ov=(p:any,q:any)=>p.x<q.x+q.w&&p.x+p.w>q.x&&p.y<q.y+q.h&&p.y+p.h>q.y;
 const all=[...out.values()];for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)expect(ov(all[i],all[j])).toBe(false);
});
