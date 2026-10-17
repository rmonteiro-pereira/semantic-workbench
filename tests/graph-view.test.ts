import{test,expect}from'bun:test';import{graphView,groupRelationships}from'../src/graph-view';import{layoutGraph}from'../src/layout';
const nodes=Array.from({length:30},(_,i)=>({id:String(i),name:`Entity ${i}`,kind:'Entity',description:'',fields:[],path:[]}));
const edge=(source:string,target:string,id=source+'-'+target)=>({id,source,target,label:id,data:{path:[],kind:'relationship',definition:{}}});
test('default view bounds the focal neighborhood and excludes lateral links',()=>{const edges=[...nodes.slice(1).map(n=>edge('0',n.id)),edge('1','2')];const v=graphView(nodes,edges,'');expect(v.entities).toHaveLength(8);expect(v.edges.every(e=>e.source==='0'||e.target==='0')).toBe(true);expect(v.edges).toHaveLength(7);expect(graphView(nodes,edges,'',true).entities).toHaveLength(30)});
test('search respects names and IRIs and empty matches do not show unrelated entities',()=>{expect(graphView(nodes,[edge('29','1')],'Entity 29').entities.map(e=>e.id)).toEqual(['1','29']);expect(graphView(nodes,[],'not present').entities).toHaveLength(0);});
test('parallel links group without losing definitions or direction',()=>{const g=groupRelationships([edge('a','b','first'),edge('a','b','second'),edge('b','a','reverse')]);expect(g).toHaveLength(2);expect(g[0].data.relationships.map(e=>e.id)).toEqual(['first','second']);expect(g[1].source).toBe('b')});
test('wrapped layout positions never overlap and broad layers stay short',()=>{const ids=nodes.map(e=>e.id);const layout=layoutGraph(ids,ids.slice(1).map(id=>edge('0',id)));expect(new Set(layout.map(n=>`${n.position.x}/${n.position.y}`)).size).toBe(30);expect(Math.max(...layout.map(n=>n.position.y))).toBeLessThanOrEqual(450)});
test('explicit center outside the initial neighborhood includes incoming and outgoing links',()=>{
 const edges=[edge('0','1'),edge('29','25'),edge('24','29'),edge('24','25')];
 const view=graphView(nodes,edges,'',false,8,'29');
 expect(view.focus).toBe('29');expect(view.entities.map(n=>n.id)).toEqual(['24','25','29']);expect(view.edges.map(e=>e.id)).toEqual(['29-25','24-29']);
});
test('isolated explicit center stays visible and search takes priority',()=>{
 expect(graphView(nodes,[],'',false,8,'29').entities.map(n=>n.id)).toEqual(['29']);
 expect(graphView(nodes,[],'Entity 12',false,8,'29').focus).toBe('12');
});
test('explicit center restricts even small models while default retains all',()=>{
 const small=nodes.slice(0,4),edges=[edge('0','1'),edge('2','3')];
 expect(graphView(small,edges,'').entities).toHaveLength(4);
 expect(graphView(small,edges,'',false,8,'2').entities.map(n=>n.id)).toEqual(['2','3']);
});
test('explicit RDF technical focus bypasses default OWL class projection',()=>{
 const rdf=[{...nodes[0],kind:'OWL class'},{...nodes[1],kind:'OWL property'},{...nodes[2],kind:'RDF resource'}],edges=[edge('1','0'),edge('1','2')];
 expect(graphView(rdf,edges,'').entities.map(n=>n.id)).toEqual(['0']);
 expect(graphView(rdf,edges,'',false,8,'1').entities.map(n=>n.id)).toEqual(['0','1','2']);
});
