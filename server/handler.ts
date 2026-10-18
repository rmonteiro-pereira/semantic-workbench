import {agentCatalog,buildContext,selectContext,planQuery,type StoredDocument} from './agent/runtime';
import {readJson} from './request';
import type { createStore } from './store';
import {InputError,MAX_INPUT_BYTES} from '../src/diagnostics';
export function createHandler(store:ReturnType<typeof createStore>) {
 return async(req:Request)=>{
  const url=new URL(req.url);
  const origin=req.headers.get('origin');
  if(origin&&!['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:4310'].includes(origin))return new Response('Forbidden',{status:403});
  try{
   if(url.pathname==='/api/agent/catalog'&&req.method==='GET')return Response.json(agentCatalog(store.list() as StoredDocument[]));
   if(url.pathname==='/api/agent/context'&&req.method==='GET'){
    const mappingId=url.searchParams.get('mappingId');if(!mappingId)throw Error('mappingId is required. List mappings at /api/agent/catalog.');
    let context=buildContext(store.list() as StoredDocument[],mappingId);
    const concepts=url.searchParams.getAll('concept');if(concepts.length)context=selectContext(context,concepts);
    return Response.json(context);
   }
   if(url.pathname==='/api/agent/plan'&&req.method==='POST'){
    const body=await readJson(req,64_000);
    if(!body||Array.isArray(body)||Object.keys(body).some(k=>!['mappingId','concepts','metrics','dimensions'].includes(k))||typeof body.mappingId!=='string')throw Error('Expected mappingId, optional concepts, metrics and dimensions. Expressions and metric overrides are not accepted.');
    for(const key of ['concepts','metrics','dimensions'])if((key!=='concepts'||body[key]!==undefined)&&(!Array.isArray(body[key])||body[key].length>100||body[key].some((id:any)=>typeof id!=='string'||!id.trim()||id.length>4096)))throw Error(`${key} must be an array of at most 100 non-empty ids.`);
    return Response.json(planQuery(buildContext(store.list() as StoredDocument[],body.mappingId),body));
   }
   const groupingPath=url.pathname.match(/^\/api\/documents\/([^/]+)\/grouping$/);
   if(groupingPath){
    const id=decodeURIComponent(groupingPath[1]);
    if(req.method==='GET')return Response.json(store.grouping(id));
    if(req.method==='PUT'){
     const value=await readJson(req,256_000);
     if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['mode','assignments','names'].includes(k))||!['auto','declared','suggested','types','example'].includes(value.mode??'auto'))throw Error('Invalid grouping view.');
     for(const key of ['assignments','names'])if(value[key]!==undefined&&(typeof value[key]!=='object'||!value[key]||Array.isArray(value[key])||Object.keys(value[key]).length>10000||Object.entries(value[key]).some(([k,v])=>k.length>4096||typeof v!=='string'||!v.trim()||v.length>4096)))throw Error('Invalid grouping corrections.');
     return Response.json(store.saveGrouping(id,value));
    }
   }
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
