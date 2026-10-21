import {readJson} from '../request';
import type {Route} from './http';
const IMPORT_LIMIT=64_000_000;
// Projects (contracts/http-api.md): list, create, rename, one project per import batch, examples.
export const projectRoutes:Route=async(ws,req,url)=>{
 const p=url.pathname;
 if(p==='/api/status'&&req.method==='GET')return Response.json({gitAvailable:ws.gitAvailable,identityConfigured:ws.identityConfigured,dataRoot:ws.layout.root,migration:ws.migration,recovery:ws.recovery});
 if(p==='/api/projects'&&req.method==='GET')return Response.json(await ws.listProjects());
 if(p==='/api/projects'&&req.method==='POST'){const body=await readJson(req,16_000);const project=await ws.createProject(body?.name);return Response.json({slug:project.slug,name:project.name});}
 const one=p.match(/^\/api\/projects\/([^/]+)$/);
 if(one&&req.method==='PATCH'){const body=await readJson(req,16_000);if(!body||typeof body!=='object'||Object.keys(body).some(k=>k!=='name'))throw Error('Expected {name}.');return Response.json(await ws.renameProject(decodeURIComponent(one[1]),body.name));}
 if(p==='/api/import'&&req.method==='POST'){
  const body=await readJson(req,IMPORT_LIMIT);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['name','files'].includes(k)))throw Error('Expected {name?, files: [{path, source}]}.');
  return Response.json(await ws.importBatch(body));
 }
 const example=p.match(/^\/api\/examples\/([a-z0-9-]+)$/);
 if(example&&req.method==='POST')return Response.json(await ws.loadExample(example[1]));
 return null;
};
