import {LanguageSupport,StreamLanguage,HighlightStyle,syntaxHighlighting} from '@codemirror/language';
import {parseMixed} from '@lezer/common';
import {tags as t} from '@lezer/highlight';
import {yaml,yamlLanguage} from '@codemirror/lang-yaml';
import {json,jsonLanguage} from '@codemirror/lang-json';
import {xml} from '@codemirror/lang-xml';
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
// YAML whose workbench extension blocks contain JSON.
const extensionYaml=yamlLanguage.configure({wrap:parseMixed((node,input)=>{
 if(node.name!=='BlockLiteralContent')return null;
 const pair=node.node.parent?.parent;const key=pair?.getChild('Key');
 if(!pair||!key||input.read(key.from,key.to).trim()!=='data')return null;
 const owner=pair.parent;if(!owner||!input.read(owner.from,owner.to).includes('SEMANTIC_WORKBENCH'))return null;
 return {parser:jsonLanguage.parser};
})});
export function languageFor(syntax:SyntaxName){
 if(syntax==='YAML')return new LanguageSupport(extensionYaml,yaml().support);
 if(syntax==='JSON')return json();
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
