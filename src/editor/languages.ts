/** Configures source highlighting, including embedded JSON and SQL in structured definitions. */
import {
  LanguageSupport,
  StreamLanguage,
  HighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { parseMixed } from '@lezer/common';
import { tags as t } from '@lezer/highlight';
import { yaml, yamlLanguage } from '@codemirror/lang-yaml';
import { yaml as yamlStream } from '@codemirror/legacy-modes/mode/yaml';
import { json, jsonLanguage } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { StandardSQL } from '@codemirror/lang-sql';
import { jsonSql, yamlEmbeddedLanguage } from './embeddedLanguages';
import { largeYamlSupport } from './largeYaml';
export { sqlKeyPath } from './embeddedLanguages';
import { rdfSyntax } from '../rdf';
// Unknown files and .gitignore use plain text. Workbench extension data inside YAML is highlighted
// as JSON.
/** Names a source serialization supported by editor highlighting. */
export type SyntaxName = 'YAML' | 'JSON' | 'RDF/XML' | 'Turtle' | 'N3' | 'N-Triples' | 'Plain text';
/** Chooses a syntax from the filename and source text. */
export function syntaxFor(filename: string, source: string): SyntaxName {
  const name = filename.toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop()! : '';
  if (name === '.gitignore' || name.endsWith('/.gitignore') || ext === 'txt') return 'Plain text';
  if (ext === 'nt') return 'N-Triples';
  if (ext === 'n3') return 'N3';
  if (ext === 'json') return 'JSON';
  if (ext === 'yaml' || ext === 'yml') return 'YAML';
  const rdf = rdfSyntax(source, filename);
  if (rdf === 'application/rdf+xml') return 'RDF/XML';
  if (rdf === 'text/turtle') return 'Turtle';
  if (/^\s*[{[]/.test(source)) return 'JSON';
  return 'YAML';
}
// A shared tokenizer distinguishes RDF names, literals, datatypes and N3 rules. The legacy Turtle
// mode misclassifies local names and numbers.
type RdfState = { long: string | null; local: boolean };
const rdfMode = {
  name: 'rdf',
  startState: (): RdfState => ({ long: null, local: false }),
  token(stream: any, state: RdfState): string | null {
    if (state.long) {
      while (!stream.eol()) {
        if (stream.match(state.long)) {
          state.long = null;
          return 'string';
        }
        if (stream.next() === '\\') stream.next();
      }
      return 'string';
    }
    // The local part right after a prefix (`ex:` + `Customer`).
    if (state.local) {
      state.local = false;
      if (stream.match(/^(?:[\w%-]|\.(?=[\w%-]))+/)) return 'variableName';
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^#.*/)) return 'comment';
    if (stream.match(/^<[^\s<>"{}|^`\\]*>/)) return 'url';
    if (stream.match('"""') || stream.match("'''")) {
      state.long = stream.current();
      while (!stream.eol()) {
        if (stream.match(state.long)) {
          state.long = null;
          break;
        }
        if (stream.next() === '\\') stream.next();
      }
      return 'string';
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^'(?:[^'\\]|\\.)*'?/)) return 'string';
    if (
      stream.match(/^@(prefix|base|forAll|forSome|keywords)\b/i) ||
      stream.match(/^(PREFIX|BASE)\b/i)
    )
      return 'keyword';
    if (stream.match(/^@[a-zA-Z]+(-[a-zA-Z0-9]+)*/)) return 'attributeName';
    if (stream.match('^^')) return 'operator';
    if (stream.match(/^_:[\w.-]*\w/)) return 'labelName';
    if (stream.match(/^\?[\w]+/)) return 'variableName.special';
    if (stream.match(/^[+-]?(\d+\.?\d*([eE][+-]?\d+)?|\.\d+([eE][+-]?\d+)?)/)) return 'number';
    if (stream.match(/^(true|false)\b/)) return 'bool';
    if (stream.match(/^a\b(?![:\w])/)) return 'keyword';
    if (stream.match(/^(=>|<=|=)/)) return 'operator';
    if (stream.match(/^(?:[A-Za-z][\w.-]*)?:/)) {
      state.local = true;
      return 'namespace';
    }
    if (stream.match(/^[.;,[\](){}]/)) return 'punctuation';
    stream.next();
    return null;
  },
};
const rdfLanguage = StreamLanguage.define(rdfMode);
// Both modes share the exact key-path and dialect checks.
const sqlParser = StandardSQL.language.parser;
const extensionYaml = yamlLanguage.configure({
  wrap: parseMixed((node, input) => {
    const language = yamlEmbeddedLanguage(node.node, (from, to) => input.read(from, to));
    if (!language) return null;
    const parser = language === 'sql' ? sqlParser : jsonLanguage.parser;
    if (node.name !== 'QuotedLiteral') return { parser };
    if (node.to - node.from <= 2) return null;
    return { parser, overlay: [{ from: node.from + 1, to: node.to - 1 }] };
  }),
});
const sqlJson = jsonLanguage.configure({
  wrap: parseMixed((node, input) => {
    if (node.name !== 'String' || node.to - node.from <= 2) return null;
    return jsonSql(node.node, (a, b) => input.read(a, b))
      ? { parser: sqlParser, overlay: [{ from: node.from + 1, to: node.to - 1 }] }
      : null;
  }),
});
// The tree parser reparses large prefixes after edits; the stream parser stops at the viewport.
const largeYaml = StreamLanguage.define({
  ...yamlStream,
  token(stream, state) {
    const token = yamlStream.token(stream, state);
    if (token === 'atom') return 'yamlKey';
    if (token === 'meta') return 'punctuation';
    if (token === 'def') return 'documentMeta';
    if (token === null && stream.current().trim()) return 'literal';
    return token;
  },
  tokenTable: { yamlKey: t.definition(t.propertyName) },
});

/** Returns the CodeMirror language configuration for a source syntax. */
export function languageFor(syntax: SyntaxName, largeDocument = false) {
  if (syntax === 'YAML' && largeDocument)
    return new LanguageSupport(largeYaml, largeYamlSupport(lightHighlight));
  if (syntax === 'YAML') return new LanguageSupport(extensionYaml, yaml().support);
  if (syntax === 'JSON') return new LanguageSupport(sqlJson, json().support);
  if (syntax === 'RDF/XML') return xml();
  if (syntax === 'Turtle' || syntax === 'N3' || syntax === 'N-Triples')
    return new LanguageSupport(rdfLanguage);
  return [];
}
// Colors after VS Code's Light+ theme: YAML keys and XML tags dark red, YAML values and keywords
// blue, JSON keys dark blue, strings red-brown, numbers green, comments green, IRIs teal.
/** Supplies the shared token colors for syntax trees and viewport decorations. */
export const lightHighlight = HighlightStyle.define([
  { tag: t.propertyName, color: '#0451a5' },
  { tag: t.definition(t.propertyName), color: '#800000' },
  { tag: [t.tagName], color: '#800000' },
  { tag: [t.attributeName], color: '#e50000' },
  { tag: [t.attributeValue], color: '#0000ff' },
  { tag: [t.string, t.special(t.string)], color: '#a31515' },
  { tag: [t.number, t.integer, t.float], color: '#098658' },
  { tag: [t.bool, t.null, t.keyword, t.atom, t.literal], color: '#0000ff' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#008000', fontStyle: 'italic' },
  { tag: [t.meta, t.processingInstruction, t.documentMeta], color: '#795e26' },
  { tag: [t.url, t.link], color: '#267f99' },
  { tag: t.namespace, color: '#267f99' },
  { tag: t.variableName, color: '#001080' },
  { tag: [t.typeName, t.className], color: '#267f99' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: '#3b3b3b' },
  { tag: [t.labelName, t.special(t.variableName)], color: '#af00db' },
  { tag: t.invalid, color: '#cd3131', textDecoration: 'underline wavy' },
]);
// Plain YAML values are blue as in VS Code; elsewhere (XML text) content keeps the default color.
const yamlValues = HighlightStyle.define([{ tag: t.content, color: '#0000ff' }], {
  scope: extensionYaml,
});
/** Installs source token styles. */
export const highlighting = [syntaxHighlighting(yamlValues), syntaxHighlighting(lightHighlight)];
