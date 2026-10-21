import {validateInput} from '../input';
import {isGitignore} from '../scm/gitignore';
// Shared validation rules off the main thread: typing never waits for a parse (FR-045).
self.onmessage=(event:MessageEvent<{id:number;source:string;filename:string}>)=>{
 const {id,source,filename}=event.data;
 let issues;try{issues=isGitignore(filename)?[]:validateInput(source,filename).issues;}catch(e){issues=[{severity:'error',code:'parse',path:'/',message:(e as Error).message}];}
 (self as any).postMessage({id,issues});
};
