// Neighborhood walk history (FR-037): each step is a center in a document, reached optionally through
// a relationship. `push` truncates forward history like a browser; pushing the current center again
// is a no-op so re-selecting does not grow the trail.
export type WalkStep={doc:string;center:string;name:string;via?:{id:string;label:string}};
export type Walk={steps:WalkStep[];index:number};
export type WalkAction={type:'push';step:WalkStep}|{type:'back'}|{type:'forward'}|{type:'jump';index:number}|{type:'reset';step?:WalkStep};
export const emptyWalk:Walk={steps:[],index:-1};
export const MAX_STEPS=100;
export function walkReducer(walk:Walk,action:WalkAction):Walk{
 if(action.type==='back')return walk.index>0?{...walk,index:walk.index-1}:walk;
 if(action.type==='forward')return walk.index<walk.steps.length-1?{...walk,index:walk.index+1}:walk;
 if(action.type==='jump')return action.index>=0&&action.index<walk.steps.length?{...walk,index:action.index}:walk;
 if(action.type==='reset')return action.step?{steps:[action.step],index:0}:emptyWalk;
 const current=walk.steps[walk.index];
 if(current&&current.doc===action.step.doc&&current.center===action.step.center)return walk;
 const steps=[...walk.steps.slice(0,walk.index+1),action.step].slice(-MAX_STEPS);
 return {steps,index:steps.length-1};
}
export const currentStep=(walk:Walk)=>walk.steps[walk.index];
export const canBack=(walk:Walk)=>walk.index>0,canForward=(walk:Walk)=>walk.index<walk.steps.length-1;
