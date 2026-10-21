import { graph, parse } from 'rdflib';
import type { Patch } from '../../editor/patch';
import { lineEndAfter, lineStart } from '../source-text';
import { BASE, RDF, type Term, type Triple } from './terms';
// RDF/XML (FR-055): a resource's node element is edited in place. Property elements are removed,
// replaced or added (at the indentation of their siblings); other elements, namespace declarations
// and comments keep their bytes. Constructs that span more than the element (parse-type
// collections, reified statements, nested descriptions of named resources, rdf:li) are refused,
// with the line to open in Source.
export type Attr = { name: string; value: string; start: number; end: number };
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
const decode = (s: string) =>
  s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e[0] === '#'
      ? String.fromCodePoint(
          e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10),
        )
      : ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" } as Record<string, string>)[
          e.toLowerCase()
        ],
  );
export const escapeXml = (s: string, attr = false) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(attr ? /"/g : /$^/, '&quot;');
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
  let cur = root,
    i = 0;
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
      const e = src.indexOf(']]>', lt);
      cur.text += src.slice(lt + 9, e);
      i = e + 3;
      continue;
    }
    if (src.startsWith('<!', lt))
      throw Error('RDF/XML DTDs and entity declarations are unsupported.');
    const gt = (() => {
      let q = '',
        k = lt + 1;
      for (; k < src.length; k++) {
        const c = src[k];
        if (q) {
          if (c === q) q = '';
        } else if (c === '"' || c === "'") q = c;
        else if (c === '>') return k;
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
    const inner = src.slice(lt + 1, gt),
      selfClosing = inner.endsWith('/'),
      name = /^[^\s/>]+/.exec(inner)![0];
    const attrs: Attr[] = [];
    const re = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner))) {
      if (m.index < name.length) continue;
      attrs.push({
        name: m[1],
        value: decode(m[3] ?? m[4]),
        start: lt + 1 + m.index,
        end: lt + 1 + m.index + m[0].length,
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
// Namespaces, xml:base and xml:lang in scope at an element.
export function scope(el: El | null) {
  const ns: Record<string, string> = {},
    chain: El[] = [];
  for (let e = el; e; e = e.parent) chain.unshift(e);
  let base = BASE,
    lang = '';
  for (const e of chain)
    for (const a of e.attrs) {
      if (a.name === 'xmlns') ns[''] = a.value;
      else if (a.name.startsWith('xmlns:')) ns[a.name.slice(6)] = a.value;
      else if (a.name === 'xml:base') base = new URL(a.value, base).href;
      else if (a.name === 'xml:lang') lang = a.value;
    }
  return { ns, base, lang };
}
export const expandName = (name: string, ns: Record<string, string>) => {
  const k = name.indexOf(':');
  return k < 0 ? (ns[''] ?? '') + name : (ns[name.slice(0, k)] ?? '') + name.slice(k + 1);
};
const attr = (el: El, name: string) => el.attrs.find(a => a.name === name);
const SYNTAX = new Set([
  'rdf:about',
  'rdf:ID',
  'rdf:nodeID',
  'rdf:resource',
  'rdf:datatype',
  'rdf:parseType',
  'xml:lang',
  'xml:base',
  'xml:space',
]);
export function subjectOf(el: El): string | null {
  const { base } = scope(el),
    about = attr(el, 'rdf:about'),
    id = attr(el, 'rdf:ID');
  return about ? new URL(about.value, base).href : id ? new URL('#' + id.value, base).href : null;
}
export function rdfRoot(doc: El) {
  return doc.children.find(c => expandName(c.name, scope(c).ns) === RDF + 'RDF') ?? null;
}
// Every node element (top level and nested) with its subject.
export function nodeElements(root: El) {
  const out: { el: El; subject: string | null; top: boolean }[] = [];
  const visitNode = (el: El, top: boolean) => {
    out.push({ el, subject: subjectOf(el), top });
    for (const p of el.children)
      for (const n of p.children)
        if (!attr(p, 'rdf:parseType') || attr(p, 'rdf:parseType')!.value !== 'Literal')
          visitNode(n, false);
  };
  for (const c of root.children) visitNode(c, true);
  return out;
}
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
// The statements one node element makes about its subject.
export function elementPairs(src: string, el: El): XmlPair[] {
  const { ns, lang } = scope(el),
    out: XmlPair[] = [];
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
  for (const a of el.attrs) {
    if (a.name.startsWith('xmlns') || SYNTAX.has(a.name)) continue;
    const p = expandName(a.name, ns);
    out.push({
      kind: 'attr',
      el,
      attr: a,
      predicate: p,
      object:
        p === RDF + 'type'
          ? { termType: 'NamedNode', value: new URL(a.value, scope(el).base).href }
          : {
              termType: 'Literal',
              value: a.value,
              language: lang || undefined,
              datatype: lang ? undefined : 'http://www.w3.org/2001/XMLSchema#string',
            },
      nested: false,
    });
  }
  for (const c of el.children) {
    const cs = scope(c),
      p = expandName(c.name, cs.ns),
      line = lineOf(src, c.start),
      pt = attr(c, 'rdf:parseType')?.value;
    const base = { kind: 'element' as const, el, child: c, predicate: p };
    if (p === RDF + 'li' || /^_\d+$/.test(p.slice(RDF.length)))
      out.push({
        ...base,
        nested: false,
        refuse: `Container items (rdf:li) at line ${line} are edited in Source.`,
      });
    else if (attr(c, 'rdf:ID'))
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
    else if (pt === 'Literal')
      out.push({ ...base, nested: true, locked: 'XML literal; edit it in Source.' });
    else if (
      pt === 'Resource' ||
      c.children.length ||
      c.attrs.some(a => !a.name.startsWith('xmlns') && !SYNTAX.has(a.name))
    ) {
      if (c.children.some(n => subjectOf(n) !== null))
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
    } else if (attr(c, 'rdf:resource'))
      out.push({
        ...base,
        object: {
          termType: 'NamedNode',
          value: new URL(attr(c, 'rdf:resource')!.value, cs.base).href,
        },
        nested: false,
      });
    else if (attr(c, 'rdf:nodeID'))
      out.push({
        ...base,
        object: { termType: 'BlankNode', value: attr(c, 'rdf:nodeID')!.value },
        nested: false,
        locked: 'Blank node reference; edit it in Source.',
      });
    else {
      const dt = attr(c, 'rdf:datatype')?.value,
        l = attr(c, 'xml:lang')?.value ?? cs.lang;
      out.push({
        ...base,
        object: {
          termType: 'Literal',
          value: c.text,
          language: dt ? undefined : l || undefined,
          datatype: dt
            ? new URL(dt, cs.base).href
            : l
              ? undefined
              : 'http://www.w3.org/2001/XMLSchema#string',
        },
        nested: false,
      });
    }
  }
  return out;
}
// The triples one property element makes, read on their own (for nested descriptions).
export function isolatedTriples(src: string, c: El, subject: string): Triple[] {
  const { ns, base, lang } = scope(c.parent);
  const decl = Object.entries(ns)
    .map(([p, v]) => (p ? ` xmlns:${p}="${escapeXml(v, true)}"` : ` xmlns="${escapeXml(v, true)}"`))
    .join('');
  const store = graph();
  parse(
    `<rdf:RDF${decl}${ns.rdf === RDF ? '' : ` xmlns:rdf="${RDF}"`} xml:base="${escapeXml(base, true)}"><rdf:Description rdf:about="${escapeXml(subject, true)}"${lang ? ` xml:lang="${escapeXml(lang, true)}"` : ''}>${src.slice(c.start, c.end)}</rdf:Description></rdf:RDF>`,
    store,
    BASE,
    'application/rdf+xml',
  );
  const plain = (t: any): Term =>
    t.termType === 'Literal'
      ? {
          termType: 'Literal',
          value: t.value,
          language: t.language || undefined,
          datatype: t.language
            ? undefined
            : (t.datatype?.value ?? 'http://www.w3.org/2001/XMLSchema#string'),
        }
      : { termType: t.termType, value: t.value };
  return store.statements.map((s: any) => ({
    s: plain(s.subject),
    p: plain(s.predicate),
    o: plain(s.object),
  }));
}
// --- writing ---------------------------------------------------------------------------------------
const NCNAME = /^[A-Za-z_][\w.-]*$/;
export function qname(iri: string, ns: Record<string, string>): { name: string; decl: string } {
  const k = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1,
    space = iri.slice(0, k),
    local = iri.slice(k);
  if (!NCNAME.test(local))
    throw Error(`<${iri}> cannot be written as an RDF/XML element name; edit it in Source.`);
  const prefix = Object.entries(ns).find(([p, v]) => p && v === space)?.[0];
  return prefix
    ? { name: `${prefix}:${local}`, decl: '' }
    : { name: `ns1:${local}`, decl: ` xmlns:ns1="${escapeXml(space, true)}"` };
}
export function propertyElement(
  predicate: string,
  object: Term,
  ns: Record<string, string>,
  inheritedLang: string,
) {
  const { name, decl } = qname(predicate, ns);
  if (object.termType === 'NamedNode')
    return `<${name}${decl} rdf:resource="${escapeXml(object.value, true)}"/>`;
  if (object.termType !== 'Literal')
    throw Error('Blank nodes and nested descriptions in RDF/XML are edited in Source.');
  const lang = object.language
    ? ` xml:lang="${escapeXml(object.language, true)}"`
    : inheritedLang
      ? ' xml:lang=""'
      : '';
  const dt =
    !object.language &&
    object.datatype &&
    object.datatype !== 'http://www.w3.org/2001/XMLSchema#string'
      ? ` rdf:datatype="${escapeXml(object.datatype, true)}"`
      : '';
  return `<${name}${decl}${lang}${dt}>${escapeXml(object.value)}</${name}>`;
}
const only = (src: string, from: number, to: number) => /^[ \t]*$/.test(src.slice(from, to));
// A range with its whole line when nothing else shares the line.
export function lineRange(src: string, from: number, to: number) {
  const a = lineStart(src, from),
    b = lineEndAfter(src, to);
  return only(src, a, from) && /^[ \t]*(\r\n|\r|\n)?$/.test(src.slice(to, b))
    ? { from: a, to: b }
    : { from, to };
}
const indentOf = (src: string, pos: number) => /^[ \t]*/.exec(src.slice(lineStart(src, pos)))![0];
// The indentation one level below an element (from its children, or the file's step).
export function childIndent(src: string, el: El, root: El) {
  const first = el.children[0];
  if (first && only(src, lineStart(src, first.start), first.start))
    return indentOf(src, first.start);
  const top = root.children[0],
    step = top
      ? indentOf(src, top.start).slice(indentOf(src, root.start).length) || '    '
      : '    ';
  return indentOf(src, el.start) + step;
}
export function addPatch(src: string, el: El, root: El, elements: string[], eol: string): Patch {
  const indent = childIndent(src, el, root);
  if (el.selfClosing) {
    const slash = src.lastIndexOf('/', el.openEnd - 1),
      ws = /[ \t]*$/.exec(src.slice(el.start, slash))![0].length;
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
