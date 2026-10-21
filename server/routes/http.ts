import {InputError} from '../../src/diagnostics';
import {PathError} from '../projects/paths';
import {GitError} from '../projects/git';
import {NotFoundError,StaleError,type Workspace} from '../projects/workspace';
export type Route=(ws:Workspace,req:Request,url:URL)=>Promise<Response|null>|Response|null;
// Error shapes of contracts/http-api.md: `{error, issues?}`; stale saves carry the current file.
export function errorResponse(e:unknown){
 if(e instanceof StaleError)return Response.json({error:'stale',currentHash:e.currentHash,currentSource:e.currentSource},{status:409});
 if(e instanceof NotFoundError)return Response.json({error:e.message},{status:404});
 if(e instanceof InputError)return Response.json({error:e.message,issues:e.issues},{status:400});
 if(e instanceof GitError)return Response.json({error:e.message},{status:500});
 if(e instanceof PathError)return Response.json({error:e.message},{status:400});
 return Response.json({error:(e as Error).message},{status:400});
}
// `/a/b%2Fc` → `a/b/c`: each URL segment is decoded, then validated as a project path.
export function decodePath(raw:string){return raw.split('/').map(s=>{try{return decodeURIComponent(s);}catch{throw new PathError('Malformed path encoding.');}}).join('/');}
