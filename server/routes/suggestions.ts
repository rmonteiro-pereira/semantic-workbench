import type {Route} from './http';
// Grouping suggestions (FR-019): listed with their evidence; accepting moves the file, rejecting
// is remembered by file hash and target project in data/state/suggestions.json.
export const suggestionRoutes:Route=async(ws,req,url)=>{
 if(url.pathname==='/api/suggestions'&&req.method==='GET')return Response.json(ws.suggestions());
 const m=url.pathname.match(/^\/api\/suggestions\/([0-9a-f]{20})\/(accept|reject)$/);
 if(m&&req.method==='POST'){if(m[2]==='accept')return Response.json(await ws.acceptSuggestion(m[1]));ws.rejectSuggestion(m[1]);return Response.json({rejected:m[1]});}
 return null;
};
