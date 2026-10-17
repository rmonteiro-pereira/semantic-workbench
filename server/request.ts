export async function readJson(req:Request,maxBytes:number){
 const reader=req.body?.getReader();if(!reader)throw Error('Expected a JSON request.');const chunks:Uint8Array[]=[];let bytes=0;
 while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes){await reader.cancel();throw Error('Request too large.');}chunks.push(value);}
 const raw=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(raw));}catch{throw Error('Malformed JSON request.');}
}
