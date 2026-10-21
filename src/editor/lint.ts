import type {Text} from '@codemirror/state';
import type {Diagnostic} from '@codemirror/lint';
import type {Issue} from '../diagnostics';
// Findings → editor diagnostics (FR-043, FR-044). A finding with a line (and column) becomes a range
// from that position to the end of the token there; one without a reliable location stays
// document-level and is listed above the editor instead of being drawn on a guessed line.
export function issueRange(issue:Issue,doc:Text):{from:number;to:number}|null{
 if(!issue.line||issue.line<1||issue.line>doc.lines)return null;
 const line=doc.line(issue.line),column=Math.max(1,issue.column??1);
 const from=Math.min(line.to,line.from+column-1),rest=doc.sliceString(from,line.to);
 const token=rest.match(/^\s*\S+/)?.[0].length??0;
 return {from,to:token?from+token:line.to};
}
export function toDiagnostics(issues:Issue[],doc:Text){
 const diagnostics:Diagnostic[]=[],documentLevel:Issue[]=[];
 for(const issue of issues){const range=issueRange(issue,doc);if(!range){documentLevel.push(issue);continue;}diagnostics.push({...range,severity:issue.severity,source:issue.code,message:issue.message});}
 return {diagnostics,documentLevel};
}
// Validation runs in a worker (FR-045): one shared worker, requests answered by id; a newer request
// for the same editor supersedes an older one.
type Pending={resolve:(issues:Issue[])=>void};
let worker:Worker|null=null,next=0;const pending=new Map<number,Pending>();
export function validateInWorker(source:string,filename:string):Promise<Issue[]>{
 if(!worker){worker=new Worker(new URL('./lint.worker.ts',import.meta.url),{type:'module'});worker.onmessage=({data})=>{const p=pending.get(data.id);pending.delete(data.id);p?.resolve(data.issues);};}
 const id=++next;return new Promise(resolve=>{pending.set(id,{resolve});worker!.postMessage({id,source,filename});});
}
