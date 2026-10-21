import {LanguageSupport,StreamLanguage,HighlightStyle,syntaxHighlighting} from '@codemirror/language';
import {parseMixed} from '@lezer/common';
import {tags as t} from '@lezer/highlight';
import {yaml,yamlLanguage} from '@codemirror/lang-yaml';
import {json,jsonLanguage} from '@codemirror/lang-json';
import {xml} from '@codemirror/lang-xml';
import {StandardSQL} from '@codemirror/lang-sql';
import type {SyntaxNode} from '@lezer/common';
import {rdfSyntax} from '../rdf';
// Syntax per serialization (FR-042): YAML, JSON, XML for RDF/XML, the Turtle mode for Turtle and N3,
// N-Triples, and plain text for `.gitignore` and anything unknown. In YAML, the JSON text of a
// SEMANTIC_WORKBENCH extension block (`data: |`) is parsed and colored as JSON (research R1).
export type SyntaxName='YAML'|'JSON'|'RDF/XML'|'Turtle'|'N3'|'N-Triples'|'Plain text';
export function syntaxFor(filename:string,source:string):SyntaxName{
 const name=filename.toLowerCase(),ext=name.includes('.')?name.split('.').pop()!:'';
 if(name==='.gitignore'||name.endsWith('/.gitignore')||ext==='txt')return 'Plain text';
 if(ext==='nt')return 'N-Triples';
 if(ext==='n3')return 'N3';
 if(ext==='json')return 'JSON';
 if(ext==='yaml'||ext==='yml')return 'YAML';
 const rdf=rdfSyntax(source,filename);
 if(rdf==='application/rdf+xml')return 'RDF/XML';
 if(rdf==='text/turtle')return 'Turtle';
 if(/^\s*[{[]/.test(source))return 'JSON';
 return 'YAML';
}
// Turtle, N3 and N-Triples share one tokenizer (the legacy Turtle mode colors local names by their
// first letter and numbers as keywords): IRIs, prefixed names (prefix and local part), literals with
// language tags and datatypes, numbers, booleans, blank nodes, N3 variables and rules, directives.
type RdfState={long:string|null;local:boolean};
const rdfMode={name:'rdf',startState:():RdfState=>({long:null,local:false}),token(stream:any,state:RdfState):string|null{
 if(state.long){while(!stream.eol()){if(stream.match(state.long)){state.long=null;return 'string';}if(stream.next()==='\\')stream.next();}return 'string';}
 // The local part right after a prefix (`ex:` + `Customer`).
 if(state.local){state.local=false;if(stream.match(/^(?:[\w%-]|\.(?=[\w%-]))+/))return 'variableName';}
 if(stream.eatSpace())return null;
 if(stream.match(/^#.*/))return 'comment';
 if(stream.match(/^<[^\s<>"{}|^`\\]*>/))return 'url';
 if(stream.match('"""')||stream.match("'''")){state.long=stream.current();while(!stream.eol()){if(stream.match(state.long)){state.long=null;break;}if(stream.next()==='\\')stream.next();}return 'string';}
 if(stream.match(/^"(?:[^"\\]|\\.)*"?/)||stream.match(/^'(?:[^'\\]|\\.)*'?/))return 'string';
 if(stream.match(/^@(prefix|base|forAll|forSome|keywords)\b/i)||stream.match(/^(PREFIX|BASE)\b/i))return 'keyword';
 if(stream.match(/^@[a-zA-Z]+(-[a-zA-Z0-9]+)*/))return 'attributeName';
 if(stream.match('^^'))return 'operator';
 if(stream.match(/^_:[\w.-]*\w/))return 'labelName';
 if(stream.match(/^\?[\w]+/))return 'variableName.special';
 if(stream.match(/^[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)/))return 'number';
 if(stream.match(/^(true|false)\b/))return 'bool';
 if(stream.match(/^a\b(?![:\w])/))return 'keyword';
 if(stream.match(/^(=>|<=|=)/))return 'operator';
 if(stream.match(/^(?:[A-Za-z][\w.-]*)?:/)){state.local=true;return 'namespace';}
 if(stream.match(/^[.;,[\](){}]/))return 'punctuation';
 stream.next();return null;
}};
const rdfLanguage=StreamLanguage.define(rdfMode);
// SQL inside definitions (FR-050, FR-051, contracts/sql-regions.md): the value of a key path the
// region table names is parsed as SQL, unless its sibling `dialect` is not SQL (DAX, MDX, …). The
// key path is read from the syntax tree (cheap, incremental); the lint uses the exact YAML CST.
const NOT_SQL=new Set(['MDX','DAX','MAQL','TABLEAU','SIGMA','THOUGHTSPOT','HOLISTICS_AQL']);
const MAPPINGS=new Set(['object_mappings','referent_mappings','link_mappings']);
type Read=(from:number,to:number)=>string;
const unquote=(s:string)=>s.trim().replace(/^(['"])(.*)\1$/s,'$2');
export function sqlKeyPath(keys:string[],sibling:(key:string)=>string|undefined){
 const n=keys.length,last=keys[n-1];
 if(last==='expression'&&keys[n-2]==='dialects'&&keys[n-3]==='expression'&&(keys[n-4]==='fields'||keys[n-4]==='metrics')){const d=sibling('dialect');return !d||!NOT_SQL.has(d.toUpperCase());}
 if(last==='expression'&&MAPPINGS.has(keys[n-2])&&keys.includes('concept_mappings'))return true;
 if(last==='transformLogic'&&keys[0]==='schema'&&keys.includes('properties'))return true;
 if(last==='query'&&keys[n-2]==='quality'&&(keys[0]==='schema'||keys[0]==='quality'))return (sibling('type')??'').toLowerCase()==='sql';
 return false;
}
// YAML: Pair > Key, value. Keys of every enclosing pair, outermost first.
function yamlSql(value:SyntaxNode,read:Read):boolean{
 const pair=value.name==='BlockLiteralContent'?value.parent?.parent:value.parent;
 if(!pair||pair.name!=='Pair')return false;
 const keys:string[]=[];for(let p:SyntaxNode|null=pair;p&&keys.length<24;p=p.parent)if(p.name==='Pair'){const k=p.getChild('Key');if(!k)return false;keys.unshift(unquote(read(k.from,k.to)));}
 const owner=pair.parent;
 const sibling=(key:string)=>{if(!owner)return undefined;for(let c=owner.firstChild;c;c=c.nextSibling)if(c.name==='Pair'){const k=c.getChild('Key');if(k&&unquote(read(k.from,k.to))===key){const v=c.lastChild;return v&&v.name!=='Key'&&v.name!==':'?unquote(read(v.from,v.to)):undefined;}}return undefined;};
 return sqlKeyPath(keys,sibling);
}
// JSON: Property > PropertyName, value.
function jsonSql(value:SyntaxNode,read:Read):boolean{
 const prop=value.parent;if(!prop||prop.name!=='Property'||value.prevSibling?.name!==':')return false;
 const keys:string[]=[];for(let p:SyntaxNode|null=prop;p&&keys.length<24;p=p.parent)if(p.name==='Property'){const k=p.getChild('PropertyName');if(!k)return false;try{keys.unshift(JSON.parse(read(k.from,k.to)));}catch{return false;}}
 const owner=prop.parent;
 const sibling=(key:string)=>{if(!owner)return undefined;for(let c=owner.firstChild;c;c=c.nextSibling)if(c.name==='Property'){const k=c.getChild('PropertyName');let name='';try{name=k?JSON.parse(read(k.from,k.to)):'';}catch{}if(name===key){const v=c.lastChild;try{return v&&v.name==='String'?JSON.parse(read(v.from,v.to)):undefined;}catch{return undefined;}}}return undefined;};
 return sqlKeyPath(keys,sibling);
}
const sqlParser=StandardSQL.language.parser;
const SQL_KEY_BEFORE=/(?:expression|query|transformLogic)["']?\s*:\s*(?:[|>][-+0-9]*[ \t]*(?:#[^\n]*)?\n[ \t]*)?['"]?$/;
// YAML whose workbench extension blocks contain JSON, and whose SQL locations contain SQL.
const extensionYaml=yamlLanguage.configure({wrap:parseMixed((node,input)=>{
 const read:Read=(a,b)=>input.read(a,b);
 if(node.name==='Literal'||node.name==='QuotedLiteral'||node.name==='BlockLiteralContent'){
  // Cheap filter first: the value must follow one of the keys that hold SQL.
  const before=read(Math.max(0,node.from-(node.name==='BlockLiteralContent'?48:24)),node.from);
  if(SQL_KEY_BEFORE.test(before)&&node.node.parent?.name!=='Key'&&yamlSql(node.node,read)){
   if(node.name==='QuotedLiteral')return node.to-node.from>2?{parser:sqlParser,overlay:[{from:node.from+1,to:node.to-1}]}:null;
   return {parser:sqlParser};
  }
 }
 if(node.name!=='BlockLiteralContent')return null;
 const pair=node.node.parent?.parent;const key=pair?.getChild('Key');
 if(!pair||!key||input.read(key.from,key.to).trim()!=='data')return null;
 const owner=pair.parent;if(!owner||!input.read(owner.from,owner.to).includes('SEMANTIC_WORKBENCH'))return null;
 return {parser:jsonLanguage.parser};
})});
const sqlJson=jsonLanguage.configure({wrap:parseMixed((node,input)=>{
 if(node.name!=='String'||node.to-node.from<=2)return null;
 return jsonSql(node.node,(a,b)=>input.read(a,b))?{parser:sqlParser,overlay:[{from:node.from+1,to:node.to-1}]}:null;
})});
export function languageFor(syntax:SyntaxName){
 if(syntax==='YAML')return new LanguageSupport(extensionYaml,yaml().support);
 if(syntax==='JSON')return new LanguageSupport(sqlJson,json().support);
 if(syntax==='RDF/XML')return xml();
 if(syntax==='Turtle'||syntax==='N3'||syntax==='N-Triples')return new LanguageSupport(rdfLanguage);
 return [];
}
// Colors after VS Code's Light+ theme: YAML keys and XML tags dark red, YAML values and keywords
// blue, JSON keys dark blue, strings red-brown, numbers green, comments green, IRIs teal.
export const lightHighlight=HighlightStyle.define([
 {tag:t.propertyName,color:'#0451a5'},
 {tag:t.definition(t.propertyName),color:'#800000'},
 {tag:[t.tagName],color:'#800000'},
 {tag:[t.attributeName],color:'#e50000'},
 {tag:[t.attributeValue],color:'#0000ff'},
 {tag:[t.string,t.special(t.string)],color:'#a31515'},
 {tag:[t.number,t.integer,t.float],color:'#098658'},
 {tag:[t.bool,t.null,t.keyword,t.atom,t.literal],color:'#0000ff'},
 {tag:[t.comment,t.lineComment,t.blockComment],color:'#008000',fontStyle:'italic'},
 {tag:[t.meta,t.processingInstruction,t.documentMeta],color:'#795e26'},
 {tag:[t.url,t.link],color:'#267f99'},
 {tag:t.namespace,color:'#267f99'},
 {tag:t.variableName,color:'#001080'},
 {tag:[t.typeName,t.className],color:'#267f99'},
 {tag:[t.operator,t.punctuation,t.separator,t.bracket],color:'#3b3b3b'},
 {tag:[t.labelName,t.special(t.variableName)],color:'#af00db'},
 {tag:t.invalid,color:'#cd3131',textDecoration:'underline wavy'},
]);
// Plain YAML values are blue as in VS Code; elsewhere (XML text) content keeps the default color.
const yamlValues=HighlightStyle.define([{tag:t.content,color:'#0000ff'}],{scope:extensionYaml});
export const highlighting=[syntaxHighlighting(yamlValues),syntaxHighlighting(lightHighlight)];
