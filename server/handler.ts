import type { createStore } from './store';
import {InputError,MAX_INPUT_BYTES} from '../src/diagnostics';
export function createHandler(store:ReturnType<typeof createStore>) {
 return async(req:Request)=>{
  const url=new URL(req.url);
  const origin=req.headers.get('origin');
  if(origin&&!['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:4310'].includes(origin))return new Response('Forbidden',{status:403});
  try{
   if(url.pathname==='/api/documents'&&req.method==='GET')return Response.json(store.list());
   if(url.pathname==='/api/documents'&&req.method==='POST'){
    // Bound the request stream before parsing; JSON escaping can expand a 2 MB source.
    const reader=req.body?.getReader();let bytes=0;const chunks:Uint8Array[]=[];
    if(!reader)throw Error('Expected a JSON document request.');
    while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_INPUT_BYTES*6+4096){await reader.cancel();return Response.json({error:'Request too large.'},{status:413});}chunks.push(value);}
    const raw=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
    let body:any;try{body=JSON.parse(new TextDecoder().decode(raw));}catch{throw Error('Malformed JSON request.');}
    if(!body||Array.isArray(body)||typeof body.filename!=='string'||typeof body.source!=='string')throw Error('Expected filename and source strings.');
    if(body.id!==undefined&&(typeof body.id!=='string'||!body.id.trim()||body.id.length>255))throw Error('Invalid document id.');
    if(body.revision!==undefined&&(!Number.isSafeInteger(body.revision)||body.revision<1))throw Error('Revision must be a positive integer.');
    return Response.json(store.save(body.filename,body.source,body.id,body.revision));
   }
   return new Response('Not found',{status:404});
  }catch(e){return Response.json({error:(e as Error).message,...(e instanceof InputError?{issues:e.issues}:{})},{status:400});}
 };
}
