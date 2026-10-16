export function exportDocument(source:string,filename:string){
 const ext=filename.split('.').pop()?.toLowerCase();
 const type=ext==='json'?'application/json':ext==='ttl'||ext==='shacl'?'text/turtle':ext==='nt'?'application/n-triples':ext==='rdf'||ext==='owl'||ext==='xml'?(source.trimStart().startsWith('<')?'application/rdf+xml':'text/turtle'):'application/yaml';
 return {filename,blob:new Blob([source],{type:type+';charset=utf-8'})};
}
