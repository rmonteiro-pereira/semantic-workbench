import Ajv2019 from 'ajv/dist/2019';import Ajv2020 from 'ajv/dist/2020';import formats from 'ajv-formats';
import odcs from '../schemas/odcs-v3.1.0.json';import ossie from '../schemas/ossie-0.2.0.dev0.json';
const a=new Ajv2019({strict:false,allErrors:true});const b=new Ajv2020({strict:false,allErrors:true});formats(a);formats(b);
const contract=a.compile(odcs),semantic=b.compile(ossie);
export function validateKnownVersion(data:any){const validate=data.kind==='DataContract'&&data.apiVersion==='v3.1.0'?contract:data.version==='0.2.0.dev0'&&Array.isArray(data.datasets)?semantic:null;if(validate&&!validate(data))throw Error(validate.errors?.slice(0,10).map(e=>`${e.instancePath||'/'} ${e.message}`).join('\n'));}
