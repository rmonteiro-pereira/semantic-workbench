/** Patches RDF/XML elements in place while preserving unrelated bytes and namespace
 * declarations. */
import { graph, parse } from 'rdflib';
import type { Patch } from '../../../shared/editor/patch';
import { lineEndAfter, lineStart } from '../../../shared/edit/source-text';
import { BASE, RDF, type Term, type Triple } from './terms';
// Collections, reified statements, nested named descriptions and rdf:li can span elements. These
// constructs are refused with a source location so users can edit them in Source.
/** Records an XML attribute's name, value and source span. */
export type Attr = { name: string; value: string; start: number; end: number };
/** Records an XML element's hierarchy, attributes and source spans. */
export type El = {
  name: string;
  attrs: Attr[];
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  selfClosing: boolean;
  children: El[];
  parent: El | null;
  text: string;
};
const decode = (text: string) =>
  text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, entity: string) =>
    entity[0] === '#'
      ? String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10))
      : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[entity.toLowerCase()],
  );
/** Escapes XML text or attribute content. */
export const escapeXml = (text: string, attr = false) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(attr ? /"/g : /$^/, '&quot;');
/** Scans XML elements while retaining their source locations. */
export function scanXml(src: string): El {
  const root: El = {
    name: '#document',
    attrs: [],
    start: 0,
    openEnd: 0,
    closeStart: src.length,
    end: src.length,
    selfClosing: false,
    children: [],
    parent: null,
    text: '',
  };
  let cur = root;
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      cur.text += decode(src.slice(i));
      break;
    }
    cur.text += decode(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      i = src.indexOf('-->', lt) + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      i = src.indexOf('?>', lt) + 2;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const cdataEnd = src.indexOf(']]>', lt);
      cur.text += src.slice(lt + 9, cdataEnd);
      i = cdataEnd + 3;
      continue;
    }
    if (src.startsWith('<!', lt)) throw Error('RDF/XML DTDs and entity declarations are unsupported.');
    const gt = (() => {
      let quote = '';
      let index = lt + 1;
      for (; index < src.length; index++) {
        const char = src[index];
        if (quote) {
          if (char === quote) quote = '';
        } else if (char === '"' || char === "'") quote = char;
        else if (char === '>') return index;
      }
      return -1;
    })();
    if (gt < 0) throw Error('Unclosed tag.');
    if (src[lt + 1] === '/') {
      cur.closeStart = lt;
      cur.end = gt + 1;
      cur = cur.parent!;
      i = gt + 1;
      continue;
    }
    const inner = src.slice(lt + 1, gt);
    const selfClosing = inner.endsWith('/');
    const name = /^[^\s/>]+/.exec(inner)![0];
    const attrs: Attr[] = [];
    const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(inner))) {
      if (match.index < name.length) continue;
      attrs.push({
        name: match[1],
        value: decode(match[3] ?? match[4]),
        start: lt + 1 + match.index,
        end: lt + 1 + match.index + match[0].length,
      });
    }
    const el: El = {
      name,
      attrs,
      start: lt,
      openEnd: gt + 1,
      closeStart: gt + 1,
      end: gt + 1,
      selfClosing,
      children: [],
      parent: cur,
      text: '',
    };
    cur.children.push(el);
    if (!selfClosing) cur = el;
    i = gt + 1;
  }
  return root;
}

/** Collects inherited namespaces, base IRI and language for an XML element. */
export function scope(el: El | null) {
  const ns: Record<string, string> = {};
  const chain: El[] = [];
  for (let e = el; e; e = e.parent) chain.unshift(e);
  let base = BASE;
  let lang = '';
  for (const scopeElement of chain)
    for (const attribute of scopeElement.attrs) {
      if (attribute.name === 'xmlns') ns[''] = attribute.value;
      else if (attribute.name.startsWith('xmlns:')) ns[attribute.name.slice(6)] = attribute.value;
      else if (attribute.name === 'xml:base') base = new URL(attribute.value, base).href;
      else if (attribute.name === 'xml:lang') lang = attribute.value;
    }
  return { ns, base, lang };
}
/** Expands an XML qualified name using the in-scope namespaces. */
export const expandName = (name: string, ns: Record<string, string>) => {
  const k = name.indexOf(':');
  return k < 0 ? (ns[''] ?? '') + name : (ns[name.slice(0, k)] ?? '') + name.slice(k + 1);
};
const attr = (el: El, name: string) => el.attrs.find(a => a.name === name);
const SYNTAX = new Set(['rdf:about', 'rdf:ID', 'rdf:nodeID', 'rdf:resource', 'rdf:datatype', 'rdf:parseType', 'xml:lang', 'xml:base', 'xml:space']);
/** Resolves the RDF subject named by an XML node element. */
export function subjectOf(el: El): string | null {
  const { base } = scope(el);
  const about = attr(el, 'rdf:about');
  const id = attr(el, 'rdf:ID');
  if (about) {
    return new URL(about.value, base).href;
  }
  if (id) {
    return new URL('#' + id.value, base).href;
  }
  return null;
}
/** Finds the RDF root element in a scanned XML document. */
export function rdfRoot(doc: El) {
  return doc.children.find(c => expandName(c.name, scope(c).ns) === RDF + 'RDF') ?? null;
}

/** Lists top-level and nested RDF node elements with their subjects. */
export function nodeElements(root: El) {
  const out: { el: El; subject: string | null; top: boolean }[] = [];
  const visitNode = (el: El, top: boolean) => {
    out.push({ el, subject: subjectOf(el), top });
    for (const node of el.children) for (const grandchild of node.children) if (!attr(node, 'rdf:parseType') || attr(node, 'rdf:parseType')!.value !== 'Literal') visitNode(grandchild, false);
  };
  for (const node of root.children) visitNode(node, true);
  return out;
}
/** Describes an RDF/XML statement and the source construct that expresses it. */
export type XmlPair = {
  kind: 'type' | 'attr' | 'element';
  el: El;
  child?: El;
  attr?: Attr;
  predicate: string;
  object?: Term;
  nested: boolean;
  locked?: string;
  refuse?: string;
};
const lineOf = (src: string, pos: number) => src.slice(0, pos).split('\n').length;

/** Reads the statements an XML node element makes about its subject. */
export function elementPairs(src: string, el: El): XmlPair[] {
  const { ns, lang } = scope(el);
  const out: XmlPair[] = [];
  const typeIri = expandName(el.name, ns);
  if (typeIri !== RDF + 'Description')
    out.push({
      kind: 'type',
      el,
      predicate: RDF + 'type',
      object: { termType: 'NamedNode', value: typeIri },
      nested: false,
      locked: 'The type comes from the element name; change it in Source.',
    });
  for (const attribute of el.attrs) {
    if (attribute.name.startsWith('xmlns') || SYNTAX.has(attribute.name)) continue;
    const predicate = expandName(attribute.name, ns);
    out.push({
      kind: 'attr',
      el,
      attr: attribute,
      predicate,
      object:
        predicate === RDF + 'type'
          ? { termType: 'NamedNode', value: new URL(attribute.value, scope(el).base).href }
          : {
              termType: 'Literal',
              value: attribute.value,
              language: lang || undefined,
              datatype: lang ? undefined : 'http://www.w3.org/2001/XMLSchema#string',
            },
      nested: false,
    });
  }
  for (const child of el.children) {
    const cs = scope(child);
    const predicate = expandName(child.name, cs.ns);
    const line = lineOf(src, child.start);
    const pt = attr(child, 'rdf:parseType')?.value;
    const base = { kind: 'element' as const, el, child, predicate };
    if (predicate === RDF + 'li' || /^_\d+$/.test(predicate.slice(RDF.length)))
      out.push({
        ...base,
        nested: false,
        refuse: `Container items (rdf:li) at line ${line} are edited in Source.`,
      });
    else if (attr(child, 'rdf:ID'))
      out.push({
        ...base,
        nested: false,
        refuse: `The reified statement at line ${line} (rdf:ID on a property) is edited in Source.`,
      });
    else if (pt === 'Collection')
      out.push({
        ...base,
        nested: true,
        refuse: `The parse-type collection at line ${line} is edited in Source.`,
      });
    else if (pt === 'Literal') out.push({ ...base, nested: true, locked: 'XML literal; edit it in Source.' });
    else if (pt === 'Resource' || child.children.length || child.attrs.some(a => !a.name.startsWith('xmlns') && !SYNTAX.has(a.name))) {
      if (child.children.some(n => subjectOf(n) !== null))
        out.push({
          ...base,
          nested: true,
          refuse: `The nested description of a named resource at line ${line} spans two resources; edit it in Source.`,
        });
      else
        out.push({
          ...base,
          nested: true,
          locked: 'Nested description; edit it in Source or remove it.',
        });
    } else if (attr(child, 'rdf:resource'))
      out.push({
        ...base,
        object: {
          termType: 'NamedNode',
          value: new URL(attr(child, 'rdf:resource')!.value, cs.base).href,
        },
        nested: false,
      });
    else if (attr(child, 'rdf:nodeID'))
      out.push({
        ...base,
        object: { termType: 'BlankNode', value: attr(child, 'rdf:nodeID')!.value },
        nested: false,
        locked: 'Blank node reference; edit it in Source.',
      });
    else {
      const dt = attr(child, 'rdf:datatype')?.value;
      const language = attr(child, 'xml:lang')?.value ?? cs.lang;
      let datatype: string | undefined;
      if (dt) {
        datatype = new URL(dt, cs.base).href;
      } else if (!language) {
        datatype = 'http://www.w3.org/2001/XMLSchema#string';
      }
      out.push({
        ...base,
        object: {
          termType: 'Literal',
          value: child.text,
          language: dt ? undefined : language || undefined,
          datatype,
        },
        nested: false,
      });
    }
  }
  return out;
}

/** Parses one property element with the namespaces needed for its description. */
export function isolatedTriples(src: string, element: El, subject: string): Triple[] {
  const { ns, base, lang } = scope(element.parent);
  const decl = Object.entries(ns)
    .map(([p, v]) => (p ? ` xmlns:${p}="${escapeXml(v, true)}"` : ` xmlns="${escapeXml(v, true)}"`))
    .join('');
  const store = graph();
  const rdfNamespace = ns.rdf === RDF ? '' : ` xmlns:rdf="${RDF}"`;
  const langAttribute = lang ? ` xml:lang="${escapeXml(lang, true)}"` : '';
  const root = `<rdf:RDF${decl}${rdfNamespace} xml:base="${escapeXml(base, true)}">`;
  const description = `<rdf:Description rdf:about="${escapeXml(subject, true)}"${langAttribute}>`;
  parse(`${root}${description}${src.slice(element.start, element.end)}</rdf:Description></rdf:RDF>`, store, BASE, 'application/rdf+xml');
  const plain = (parsedTerm: any): Term =>
    parsedTerm.termType === 'Literal'
      ? {
          termType: 'Literal',
          value: parsedTerm.value,
          language: parsedTerm.language || undefined,
          datatype: parsedTerm.language ? undefined : (parsedTerm.datatype?.value ?? 'http://www.w3.org/2001/XMLSchema#string'),
        }
      : { termType: parsedTerm.termType, value: parsedTerm.value };
  return store.statements.map((statement: any) => ({
    s: plain(statement.subject),
    p: plain(statement.predicate),
    o: plain(statement.object),
  }));
}

const NCNAME = /^[A-Za-z_][\w.-]*$/;
/** Returns an XML qualified name and any namespace declaration it requires. */
export function qname(iri: string, ns: Record<string, string>): { name: string; decl: string } {
  const index = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1;
  const space = iri.slice(0, index);
  const local = iri.slice(index);
  if (!NCNAME.test(local)) throw Error(`<${iri}> cannot be written as an RDF/XML element name; edit it in Source.`);
  const prefix = Object.entries(ns).find(([p, v]) => p && v === space)?.[0];
  return prefix ? { name: `${prefix}:${local}`, decl: '' } : { name: `ns1:${local}`, decl: ` xmlns:ns1="${escapeXml(space, true)}"` };
}
/** Serializes an RDF property as an XML element in the supplied scope. */
export function propertyElement(predicate: string, object: Term, ns: Record<string, string>, inheritedLang: string) {
  const { name, decl } = qname(predicate, ns);
  if (object.termType === 'NamedNode') return `<${name}${decl} rdf:resource="${escapeXml(object.value, true)}"/>`;
  if (object.termType !== 'Literal') throw Error('Blank nodes and nested descriptions in RDF/XML are edited in Source.');
  let lang;
  if (object.language) {
    lang = ` xml:lang="${escapeXml(object.language, true)}"`;
  } else if (inheritedLang) {
    lang = ' xml:lang=""';
  } else {
    lang = '';
  }
  const dt = !object.language && object.datatype && object.datatype !== 'http://www.w3.org/2001/XMLSchema#string' ? ` rdf:datatype="${escapeXml(object.datatype, true)}"` : '';
  return `<${name}${decl}${lang}${dt}>${escapeXml(object.value)}</${name}>`;
}
const only = (src: string, from: number, to: number) => /^[ \t]*$/.test(src.slice(from, to));

/** Includes a construct's full line only when nothing else shares it. */
export function lineRange(src: string, from: number, to: number) {
  const start = lineStart(src, from);
  const after = lineEndAfter(src, to);
  return only(src, start, from) && /^[ \t]*(\r\n|\r|\n)?$/.test(src.slice(to, after)) ? { from: start, to: after } : { from, to };
}
const indentOf = (src: string, pos: number) => /^[ \t]*/.exec(src.slice(lineStart(src, pos)))![0];

/** Infers child indentation from siblings or the file's indentation unit. */
export function childIndent(src: string, el: El, root: El) {
  const first = el.children[0];
  if (first && only(src, lineStart(src, first.start), first.start)) return indentOf(src, first.start);
  const top = root.children[0];
  const step = top ? indentOf(src, top.start).slice(indentOf(src, root.start).length) || '    ' : '    ';
  return indentOf(src, el.start) + step;
}
/** Inserts property elements using the parent element's layout and line endings. */
export function addPatch(src: string, el: El, root: El, elements: string[], eol: string): Patch {
  const indent = childIndent(src, el, root);
  if (el.selfClosing) {
    const slash = src.lastIndexOf('/', el.openEnd - 1);
    const ws = /[ \t]*$/.exec(src.slice(el.start, slash))![0].length;
    return {
      from: slash - ws,
      to: el.end,
      insert: `>${eol}${elements.map(e => indent + e).join(eol)}${eol}${indentOf(src, el.start)}</${el.name}>`,
    };
  }
  if (only(src, lineStart(src, el.closeStart), el.closeStart)) {
    const at = lineStart(src, el.closeStart);
    return { from: at, to: at, insert: elements.map(e => indent + e + eol).join('') };
  }
  return { from: el.closeStart, to: el.closeStart, insert: elements.join('') };
}
