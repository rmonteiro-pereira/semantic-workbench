import{test,expect}from'bun:test';import{walkReducer,emptyWalk,currentStep,canBack,canForward,MAX_STEPS,type Walk,type WalkAction}from'../src/graph/walk';
const step=(center:string,doc='d')=>({doc,center,name:center});
const run=(walk:Walk,...actions:WalkAction[]):Walk=>actions.reduce(walkReducer,walk);
test('push, back and forward move through the trail',()=>{
 let w=run(emptyWalk,{type:'push',step:step('a')},{type:'push',step:step('b')},{type:'push',step:step('c')});
 expect(w.steps.map(s=>s.center)).toEqual(['a','b','c']);expect(currentStep(w).center).toBe('c');
 w=run(w,{type:'back'},{type:'back'});expect(currentStep(w).center).toBe('a');expect(canBack(w)).toBe(false);
 w=run(w,{type:'back'});expect(w.index).toBe(0);
 w=run(w,{type:'forward'});expect(currentStep(w).center).toBe('b');expect(canForward(w)).toBe(true);
 w=run(w,{type:'forward'},{type:'forward'});expect(w.index).toBe(2);
});
test('pushing after going back truncates forward history; the same center is not pushed twice',()=>{
 let w=run(emptyWalk,{type:'push',step:step('a')},{type:'push',step:step('b')},{type:'push',step:step('c')},{type:'back'},{type:'back'},{type:'push',step:step('x')});
 expect(w.steps.map(s=>s.center)).toEqual(['a','x']);expect(canForward(w)).toBe(false);
 expect(run(w,{type:'push',step:step('x')})).toBe(w);
 expect(run(w,{type:'push',step:step('x','other')}).steps).toHaveLength(3);
});
test('jump and reset; the trail is bounded',()=>{
 let w=run(emptyWalk,{type:'push',step:step('a')},{type:'push',step:step('b')},{type:'jump',index:0});expect(currentStep(w).center).toBe('a');expect(run(w,{type:'jump',index:9})).toBe(w);
 expect(run(w,{type:'reset',step:step('z')}).steps.map(s=>s.center)).toEqual(['z']);expect(run(w,{type:'reset'})).toEqual(emptyWalk);
 for(let i=0;i<MAX_STEPS+20;i++)w=walkReducer(w,{type:'push',step:step('s'+i)});expect(w.steps).toHaveLength(MAX_STEPS);expect(w.index).toBe(MAX_STEPS-1);
});
