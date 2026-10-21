import { applyPatches, dominantLineBreak, type Patch } from '../../editor/patch';
import { lineStart } from '../source-text';
import { gate, type Gate } from './isomorphism';
import {
  BASE,
  RDF,
  WELL_KNOWN,
  formatOf,
  parseGraph,
  parseObject,
  parsePredicate,
  shortIri,
  termKey,
  turtleTerm,
  isBlank,
  type RdfFormat,
  type Term,
  type Triple,
} from './terms';
import { readDocument, turtlePatches, prefixPatches, type Document } from './turtle';
import { readLines, ntLine, ntPatches, type Line } from './ntriples';
import {
  scanXml,
  rdfRoot,
  nodeElements,
  elementPairs,
  isolatedTriples,
  propertyElement,
  addPatch,
  lineRange,
  childIndent,
  qname,
  escapeXml,
  scope,
  type El,
  type XmlPair,
} from './rdfxml';
// Per-item editing of RDF files (FR-055) behind one interface for Turtle, N-Triples, N3 and
// RDF/XML: read a resource's statements as predicate–object pairs, write the desired pairs back as
// the smallest in-place change the serialization allows, and accept the result only when the
// parsed graph equals the original minus the removed triples plus the added ones.
export type RdfPair = {
  id: string;
  predicate: string;
  predicateText: string;
  object: Term | null;
  objectText: string;
  nested: boolean;
  locked?: string;
  line: number;
  triples: Triple[];
};
export type RdfItem = {
  subject: string;
  format: RdfFormat;
  pairs: RdfPair[];
  prefixes: Record<string, string>;
  base: string;
  line: number;
  refusal?: { reason: string; line: number };
  fragment: { from: number; to: number } | null;
  subjectText: string;
  ranges: { from: number; to: number }[];
};
export type DesiredPair = { id?: string; predicateText: string; objectText: string };
export type RdfResult =
  | { ok: true; text: string; patches: Patch[]; warnings: string[]; removed: number; added: number }
  | { ok: false; error: string; line?: number };
const lineOf = (src: string, pos: number) => src.slice(0, pos).split(/\r\n|\r|\n/).length;
const S = 'urn:workbench:s';
const resubject = (triples: Triple[], subject: string) =>
  triples.map(t =>
    t.s.value === S && t.s.termType === 'NamedNode'
      ? { ...t, s: { termType: 'NamedNode' as const, value: subject } }
      : t,
  );
// A blank-node subtree as Turtle `[ ... ]`, for showing nested RDF/XML descriptions.
function nestedText(
  o: Term,
  triples: Triple[],
  prefixes: Record<string, string>,
  depth = 0,
): string {
  if (!isBlank(o) || depth > 8) return turtleTerm(o, prefixes);
  const own = triples.filter(t => termKey(t.s) === termKey(o));
  return `[ ${own.map(t => `${t.p.value === RDF + 'type' ? 'a' : shortIri(t.p.value, prefixes)} ${nestedText(t.o, triples, prefixes, depth + 1)}`).join(' ; ')} ]`;
}
// The triples a blank node reaches (its description, nested descriptions, collections).
function subtree(o: Term, all: Triple[]): Triple[] {
  if (!isBlank(o)) return [];
  const out: Triple[] = [],
    seen = new Set<string>(),
    queue = [termKey(o)];
  while (queue.length) {
    const k = queue.pop()!;
    if (seen.has(k)) continue;
    seen.add(k);
    for (const t of all)
      if (termKey(t.s) === k) {
        out.push(t);
        if (isBlank(t.o)) queue.push(termKey(t.o));
      }
  }
  return out;
}
type Parsed = {
  format: RdfFormat;
  turtle?: Document;
  lines?: Line[];
  xml?: { root: El; nodes: ReturnType<typeof nodeElements> };
};
function parsed(src: string, format: RdfFormat): Parsed {
  if (format === 'rdfxml') {
    const doc = scanXml(src),
      root = rdfRoot(doc);
    if (!root) throw Error('No rdf:RDF element.');
    return { format, xml: { root, nodes: nodeElements(root) } };
  }
  if (format === 'ntriples') return { format, lines: readLines(src) };
  return { format, turtle: readDocument(src) };
}
function xmlPairs(src: string, p: Parsed, subject: string) {
  const mine = p.xml!.nodes.filter(n => n.subject === subject);
  return {
    mine,
    pairs: mine
      .filter(n => n.top)
      .flatMap((n, e) => elementPairs(src, n.el).map((x, k) => ({ x, id: `${e}:${k}` }))),
  };
}
export function readRdfItem(src: string, filename: string, subject: string): RdfItem {
  const format = formatOf(filename, src),
    p = parsed(src, format);
  if (format === 'ntriples') {
    const lines = p.lines!,
      mine = [...lines.keys()].filter(
        i => lines[i].triple?.s.termType === 'NamedNode' && lines[i].triple!.s.value === subject,
      );
    const prefixes = WELL_KNOWN;
    // Labelled blank nodes keep their labels (one parse per line), so a statement's blank-node
    // object brings the lines that describe it.
    const all = lines.flatMap(l => (l.triple ? [l.triple] : []));
    const pairs = mine.map(i => {
      const t = lines[i].triple!;
      return {
        id: String(i),
        predicate: t.p.value,
        predicateText: shortIri(t.p.value, prefixes),
        object: t.o,
        objectText: turtleTerm(t.o, prefixes),
        nested: false,
        line: lineOf(src, lines[i].start),
        triples: [t, ...subtree(t.o, all)],
      };
    });
    let end = mine[0];
    while (end !== undefined && mine.includes(end + 1)) end++;
    return {
      subject,
      format,
      pairs,
      prefixes,
      base: BASE,
      line: pairs[0]?.line ?? 0,
      fragment: mine.length
        ? { from: lines[mine[0]].start, to: lines[end].start + lines[end].text.length }
        : null,
      subjectText: `<${subject}>`,
      ranges: mine.map(i => ({ from: lines[i].start, to: lines[i].end })),
    };
  }
  if (format === 'rdfxml') {
    const { ns, base } = scope(p.xml!.root),
      prefixes = Object.fromEntries(Object.entries(ns).filter(([k]) => k));
    const { mine, pairs: raw } = xmlPairs(src, p, subject);
    const nested = mine.find(n => !n.top),
      refused = raw.find(r => r.x.refuse);
    const refusal = nested
      ? {
          reason: `This resource is also described inside another element (line ${lineOf(src, nested.el.start)}); edit it in Source.`,
          line: lineOf(src, nested.el.start),
        }
      : refused
        ? {
            reason: refused.x.refuse!,
            line: lineOf(src, refused.x.child?.start ?? refused.x.el.start),
          }
        : undefined;
    const pairs = raw.map(({ x, id }) => {
      const triples =
        x.kind === 'element'
          ? isolatedTriples(src, x.child!, subject)
          : [
              {
                s: { termType: 'NamedNode' as const, value: subject },
                p: { termType: 'NamedNode' as const, value: x.predicate },
                o: x.object!,
              },
            ];
      const top = triples.find(t => t.s.value === subject && t.p.value === x.predicate);
      return {
        id,
        predicate: x.predicate,
        predicateText:
          x.predicate === RDF + 'type'
            ? 'a'
            : shortIri(x.predicate, { ...WELL_KNOWN, ...prefixes }),
        object: top?.o ?? x.object ?? null,
        objectText:
          x.nested && top
            ? nestedText(top.o, triples, { ...WELL_KNOWN, ...prefixes })
            : x.object
              ? turtleTerm(x.object, { ...WELL_KNOWN, ...prefixes })
              : '',
        nested: x.nested,
        locked: x.locked,
        line: lineOf(src, x.child?.start ?? x.attr?.start ?? x.el.start),
        triples,
      };
    });
    const first = mine.find(n => n.top);
    return {
      subject,
      format,
      pairs,
      prefixes,
      base,
      line: first ? lineOf(src, first.el.start) : 0,
      refusal,
      fragment: first ? lineRange(src, first.el.start, first.el.end) : null,
      subjectText: subject,
      ranges: mine.filter(n => n.top).map(n => lineRange(src, n.el.start, n.el.end)),
    };
  }
  const doc = p.turtle!,
    mine = doc.statements
      .map((s, i) => ({ s, i }))
      .filter(x => !x.s.directive && x.s.subject === subject);
  const short = shortIri(subject, doc.prefixes);
  const n3 = doc.statements.find(
    s =>
      s.n3 &&
      (src.slice(s.start, s.end).includes(`<${subject}>`) ||
        (short.startsWith('<')
          ? false
          : new RegExp(`(^|[^\\w:])${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(
              src.slice(s.start, s.end),
            ))),
  );
  const broken = mine.find(x => !x.s.parsed);
  const refusal = n3
    ? {
        reason: `This resource appears in an N3 formula or rule (line ${lineOf(src, n3.start)}); N3 formulae and rules are edited in Source.`,
        line: lineOf(src, n3.start),
      }
    : broken
      ? {
          reason: `The statement at line ${lineOf(src, broken.s.start)} uses a form the item editor does not rewrite; edit it in Source.`,
          line: lineOf(src, broken.s.start),
        }
      : undefined;
  const pairs: RdfPair[] = [];
  let whole: Triple[] | null = null;
  const graphOf = () => (whole ??= parseGraph(src, format));
  for (const { s, i } of mine)
    if (s.parsed)
      s.segments.forEach((sg, g) =>
        sg.objects.forEach((o, k) => {
          let triples: Triple[] = [],
            object: Term | null = null,
            nested = false;
          try {
            const po = parseObject(o.text, doc.prefixes, doc.base);
            object = po.term;
            nested = po.nested;
            triples = [
              {
                s: { termType: 'NamedNode', value: subject },
                p: { termType: 'NamedNode', value: sg.verbIri },
                o: po.term,
              },
              ...po.triples,
            ];
            // A labelled blank node (_:x) is described by other statements of the file.
            if (/^_:/.test(o.text)) {
              const label = o.text.slice(2),
                g = graphOf(),
                node = g.find(
                  t => isBlank(t.s) && (t.s.value === label || t.s.value.endsWith('_' + label)),
                )?.s;
              if (node) {
                object = node;
                triples = [{ ...triples[0], o: node }, ...subtree(node, g)];
              }
            }
          } catch {}
          pairs.push({
            id: `${i}:${g}:${k}`,
            predicate: sg.verbIri,
            predicateText: sg.verb.text,
            object,
            objectText: o.text,
            nested,
            line: lineOf(src, o.start),
            triples,
          });
        }),
      );
  const first = mine[0]?.s;
  return {
    subject,
    format,
    pairs,
    prefixes: doc.prefixes,
    base: doc.base,
    line: first ? lineOf(src, first.start) : 0,
    refusal,
    fragment: first ? { from: lineStart(src, first.start), to: first.end } : null,
    subjectText: short,
    ranges: mine.map(x => ({ from: lineStart(src, x.s.start), to: x.s.end })),
  };
}
type Plan = {
  removed: RdfPair[];
  replaced: {
    pair: RdfPair;
    predicate: string;
    objectText: string;
    object: Term;
    triples: Triple[];
  }[];
  added: {
    predicate: string;
    predicateText: string;
    objectText: string;
    object: Term;
    triples: Triple[];
    nested: boolean;
  }[];
  intended: Triple[];
};
function plan(item: RdfItem, desired: DesiredPair[], deleting = false): Plan {
  const prefixes = { ...WELL_KNOWN, ...item.prefixes },
    byId = new Map(item.pairs.map(p => [p.id, p])),
    out: Plan = { removed: [], replaced: [], added: [], intended: [] };
  const kept = new Set<string>();
  const read = (d: DesiredPair) => {
    if (!d.predicateText.trim() || !d.objectText.trim())
      throw Error('Each statement needs a predicate and an object.');
    const predicate = parsePredicate(d.predicateText, prefixes, item.base),
      po = parseObject(d.objectText, prefixes, item.base);
    if (po.nested && item.format !== 'turtle' && item.format !== 'n3')
      throw Error(
        `Nested descriptions ("${d.objectText.slice(0, 40)}") are edited in Source in ${item.format === 'ntriples' ? 'N-Triples' : 'RDF/XML'}.`,
      );
    return {
      predicate,
      object: po.term,
      nested: po.nested,
      triples: [
        {
          s: { termType: 'NamedNode' as const, value: item.subject },
          p: { termType: 'NamedNode' as const, value: predicate },
          o: po.term,
        },
        ...po.triples,
      ],
    };
  };
  for (const d of desired) {
    const p = d.id ? byId.get(d.id) : undefined;
    if (p && d.predicateText === p.predicateText && d.objectText === p.objectText) {
      kept.add(p.id);
      out.intended.push(...p.triples);
      continue;
    }
    if (p?.locked) throw Error(`${p.predicateText} ${p.objectText.slice(0, 60)}: ${p.locked}`);
    const r = read(d);
    if (p && r.predicate === p.predicate) {
      kept.add(p.id);
      out.replaced.push({
        pair: p,
        predicate: r.predicate,
        objectText: d.objectText.trim(),
        object: r.object,
        triples: r.triples,
      });
    } else
      out.added.push({
        predicate: r.predicate,
        predicateText: d.predicateText.trim(),
        objectText: d.objectText.trim(),
        object: r.object,
        triples: r.triples,
        nested: r.nested,
      });
    out.intended.push(...r.triples);
  }
  for (const p of item.pairs)
    if (!kept.has(p.id)) {
      if (p.locked && !p.nested && !deleting)
        throw Error(`${p.predicateText} ${p.objectText}: ${p.locked}`);
      out.removed.push(p);
    }
  return out;
}
// The patches for one resource (no gate).
function patchesFor(
  src: string,
  filename: string,
  item: RdfItem,
  pl: Plan,
  p: Parsed,
): { patches: Patch[]; warnings: string[] } {
  const eol = dominantLineBreak(src);
  if (item.format === 'ntriples') {
    const rendered = (predicate: string, o: Term) => ntLine(item.subject, predicate, o);
    // A removed or replaced statement whose object is a labelled blank node takes the lines that
    // describe that node (when nothing else refers to it).
    const lines = p.lines!,
      gone = new Set(pl.removed.map(r => Number(r.id)));
    const dropped = [
      ...pl.removed.map(r => r.object),
      ...pl.replaced.map(r => r.pair.object),
    ].filter((o): o is Term => !!o && isBlank(o));
    for (const o of dropped) {
      const tree = new Set([
        termKey(o),
        ...subtree(
          o,
          lines.flatMap(l => (l.triple ? [l.triple] : [])),
        ).map(t => termKey(t.s)),
      ]);
      const others = lines.some(
        (l, i) =>
          l.triple &&
          !gone.has(i) &&
          !tree.has(termKey(l.triple.s)) &&
          termKey(l.triple.o) === termKey(o) &&
          !pl.replaced.some(r => Number(r.pair.id) === i),
      );
      if (!others)
        lines.forEach((l, i) => {
          if (l.triple && tree.has(termKey(l.triple.s))) gone.add(i);
        });
    }
    return {
      patches: ntPatches(
        src,
        p.lines!,
        item.subject,
        gone,
        new Map(pl.replaced.map(r => [Number(r.pair.id), rendered(r.predicate, r.object)])),
        pl.added.map(a => rendered(a.predicate, a.object)),
        eol,
      ),
      warnings: [],
    };
  }
  if (item.format === 'rdfxml') {
    const { mine, pairs } = xmlPairs(src, p, item.subject),
      find = (id: string) => pairs.find(x => x.id === id)!.x;
    const root = p.xml!.root,
      patches: Patch[] = [];
    const top = mine.filter(n => n.top);
    // Every statement removed: the node elements go.
    if (
      !pl.added.length &&
      !pl.replaced.length &&
      pl.removed.length === item.pairs.length &&
      top.length
    ) {
      for (const n of top) {
        const r = lineRange(src, n.el.start, n.el.end);
        patches.push({ ...r, insert: '' });
      }
      return { patches, warnings: [] };
    }
    const extra: string[] = [];
    for (const r of pl.removed) {
      const x = find(r.id);
      if (x.kind === 'element') {
        patches.push({ ...lineRange(src, x.child!.start, x.child!.end), insert: '' });
      } else if (x.kind === 'attr') {
        const ws = /[ \t\r\n]*$/.exec(src.slice(x.el.start, x.attr!.start))![0].length;
        patches.push({ from: x.attr!.start - ws, to: x.attr!.end, insert: '' });
      }
    }
    for (const r of pl.replaced) {
      const x = find(r.pair.id),
        { ns, lang } = scope(x.el);
      if (x.kind === 'element')
        patches.push({
          from: x.child!.start,
          to: x.child!.end,
          insert: propertyElement(r.predicate, r.object, ns, scope(x.child!.parent).lang),
        });
      else if (
        r.object.termType === 'Literal' &&
        !r.object.language &&
        (!r.object.datatype || r.object.datatype.endsWith('#string')) &&
        !lang
      )
        patches.push({
          from: x.attr!.start,
          to: x.attr!.end,
          insert: `${x.attr!.name}="${escapeXml(r.object.value, true)}"`,
        });
      else {
        const ws = /[ \t\r\n]*$/.exec(src.slice(x.el.start, x.attr!.start))![0].length;
        patches.push({ from: x.attr!.start - ws, to: x.attr!.end, insert: '' });
        extra.push(propertyElement(r.predicate, r.object, ns, lang));
      }
    }
    const target = top[0]?.el;
    if (target) {
      const { ns, lang } = scope(target);
      const els = [
        ...extra,
        ...pl.added.map(a => propertyElement(a.predicate, a.object, ns, lang)),
      ];
      if (els.length) patches.push(addPatch(src, target, root, els, eol));
    } else if (pl.added.length) {
      // A new node element before </rdf:RDF>, typed when its type has a declared prefix.
      const { ns } = scope(root),
        type = pl.added.find(
          a => a.predicate === RDF + 'type' && a.object.termType === 'NamedNode',
        );
      let tag = 'rdf:Description',
        rest = pl.added;
      if (type) {
        try {
          const q = qname(type.object.value, ns);
          if (!q.decl) {
            tag = q.name;
            rest = pl.added.filter(a => a !== type);
          }
        } catch {}
      }
      // One level below the root, and one more for the properties (as the file's other elements).
      const indent = childIndent(src, root, root),
        sample = root.children.find(c => c.children.length),
        inner = sample ? childIndent(src, sample, root) : indent + '    ';
      const body = rest.map(a => inner + propertyElement(a.predicate, a.object, ns, '')).join(eol);
      const text = rest.length
        ? `${indent}<${tag} rdf:about="${escapeXml(item.subject, true)}">${eol}${body}${eol}${indent}</${tag}>${eol}`
        : `${indent}<${tag} rdf:about="${escapeXml(item.subject, true)}"/>${eol}`;
      const ownLine = /^[ \t]*$/.test(src.slice(lineStart(src, root.closeStart), root.closeStart)),
        at = ownLine ? lineStart(src, root.closeStart) : root.closeStart;
      patches.push({ from: at, to: at, insert: ownLine ? text : eol + text });
    }
    return { patches, warnings: [] };
  }
  const doc = p.turtle!;
  const r = turtlePatches(
    src,
    doc,
    item.subject,
    new Set(pl.removed.map(x => x.id)),
    new Map(pl.replaced.map(x => [x.pair.id, x.objectText])),
    pl.added.map(a => ({
      verbIri: a.predicate,
      verbText: a.predicateText,
      objectText: a.objectText,
    })),
    eol,
    item.subjectText,
  );
  return {
    patches: [
      ...prefixPatches(
        src,
        doc,
        [
          ...pl.added.flatMap(a => [a.predicateText, a.objectText]),
          ...pl.replaced.map(x => x.objectText),
        ],
        eol,
      ),
      ...r.patches,
    ],
    warnings: r.warnings,
  };
}
const order = (ps: Patch[]) =>
  [...ps].sort((a, b) => a.from - b.from || a.to - a.from - (b.to - b.from));
// Apply, re-read and check: the text is accepted only when the gate passes.
function finish(
  src: string,
  format: RdfFormat,
  patches: Patch[],
  warnings: string[],
  subjects: string[],
  intended: Triple[],
): RdfResult {
  let text: string;
  try {
    text = applyPatches(src, order(patches));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  let before: Triple[], after: Triple[];
  try {
    before = parseGraph(src, format);
  } catch (e) {
    return { ok: false, error: `The file does not parse: ${(e as Error).message}` };
  }
  try {
    after = parseGraph(text, format);
  } catch (e) {
    return { ok: false, error: `The edit would not parse: ${(e as Error).message}` };
  }
  const g: Gate = gate(before, after, subjects, intended);
  return g.ok
    ? { ok: true, text, patches: order(patches), warnings, removed: g.removed, added: g.added }
    : { ok: false, error: g.reason };
}
export function editRdfItem(
  src: string,
  filename: string,
  subject: string,
  desired: DesiredPair[],
): RdfResult {
  const format = formatOf(filename, src);
  try {
    const item = readRdfItem(src, filename, subject);
    if (item.refusal) return { ok: false, error: item.refusal.reason, line: item.refusal.line };
    const pl = plan(item, desired),
      r = patchesFor(src, filename, item, pl, parsed(src, format));
    return finish(src, format, r.patches, r.warnings, [subject], resubject(pl.intended, subject));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
// Statements elsewhere in the file that name `subject` as their object (top-level pairs only; a
// nested description is removed with its parent pair).
export function rdfReferences(src: string, filename: string, subject: string) {
  const format = formatOf(filename, src),
    triples = parseGraph(src, format),
    key = `<${subject}>`;
  const owners = new Set<string>(),
    bySubject = new Map<string, Triple[]>();
  for (const t of triples) {
    const k = termKey(t.s);
    bySubject.set(k, [...(bySubject.get(k) ?? []), t]);
  }
  const reaches = (t: Term, seen = new Set<string>()): boolean => {
    if (termKey(t) === key) return true;
    if (!isBlank(t) || seen.has(termKey(t))) return false;
    seen.add(termKey(t));
    return (bySubject.get(termKey(t)) ?? []).some(x => reaches(x.o, seen));
  };
  const blankOwners: string[] = [];
  for (const t of triples)
    if (t.s.termType === 'NamedNode' && t.s.value !== subject && reaches(t.o))
      owners.add(t.s.value);
  for (const t of triples)
    if (isBlank(t.s) && termKey(t.o) === key && !triples.some(x => termKey(x.o) === termKey(t.s)))
      blankOwners.push(termKey(t.s));
  return { owners: [...owners], unowned: blankOwners.length };
}
export function deleteRdfItem(
  src: string,
  filename: string,
  subject: string,
  withReferences = true,
): RdfResult & { dependents?: { subject: string; pairs: string[] }[] } {
  const format = formatOf(filename, src);
  try {
    const p = parsed(src, format),
      item = readRdfItem(src, filename, subject);
    if (item.refusal) return { ok: false, error: item.refusal.reason, line: item.refusal.line };
    const patches: Patch[] = [],
      warnings: string[] = [],
      intended: Triple[] = [],
      subjects = [subject],
      dependents: { subject: string; pairs: string[] }[] = [];
    const own = patchesFor(src, filename, item, plan(item, [], true), p);
    patches.push(...own.patches);
    warnings.push(...own.warnings);
    if (withReferences)
      for (const owner of rdfReferences(src, filename, subject).owners) {
        const o = readRdfItem(src, filename, owner);
        if (o.refusal)
          return {
            ok: false,
            error: `${o.subjectText} refers to this resource: ${o.refusal.reason}`,
            line: o.refusal.line,
          };
        const keep = o.pairs.filter(
            x => !x.triples.some(t => t.o.termType === 'NamedNode' && t.o.value === subject),
          ),
          drop = o.pairs.filter(x => !keep.includes(x));
        const pl = plan(
          o,
          keep.map(x => ({ id: x.id, predicateText: x.predicateText, objectText: x.objectText })),
        );
        const r = patchesFor(src, filename, o, pl, p);
        patches.push(...r.patches);
        warnings.push(...r.warnings);
        intended.push(...resubject(pl.intended, owner));
        subjects.push(owner);
        dependents.push({
          subject: o.subjectText,
          pairs: drop.map(
            x =>
              `${x.predicateText} ${x.objectText.length > 80 ? x.objectText.slice(0, 77) + '…' : x.objectText}`,
          ),
        });
      }
    return { ...finish(src, format, patches, warnings, subjects, intended), dependents };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
// A Source edit of the item's own text: only this resource's statements may change.
export function checkRdfSource(
  before: string,
  after: string,
  filename: string,
  subject: string,
): Gate {
  const format = formatOf(filename, before);
  let a: Triple[], b: Triple[];
  try {
    a = parseGraph(before, format);
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
  try {
    b = parseGraph(after, format);
  } catch (e) {
    return { ok: false, reason: `The edit does not parse: ${(e as Error).message}` };
  }
  return gate(a, b, [subject]);
}
export { formatOf };
// A new resource: its statements in the file's own layout (refused when it already has some).
export function addRdfItem(
  src: string,
  filename: string,
  subject: string,
  desired: DesiredPair[],
): RdfResult {
  try {
    if (readRdfItem(src, filename, subject).pairs.length)
      return {
        ok: false,
        error: `${subject} already has statements in this file; edit it instead.`,
      };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  return editRdfItem(
    src,
    filename,
    subject,
    desired.map(({ predicateText, objectText }) => ({ predicateText, objectText })),
  );
}
// The prefixes a user may type in this file: its own and the well-known ones.
export function rdfPrefixes(src: string, filename: string): Record<string, string> {
  const format = formatOf(filename, src);
  try {
    if (format === 'turtle' || format === 'n3')
      return { ...WELL_KNOWN, ...readDocument(src).prefixes };
    if (format === 'rdfxml') {
      const root = rdfRoot(scanXml(src));
      return {
        ...WELL_KNOWN,
        ...(root ? Object.fromEntries(Object.entries(scope(root).ns).filter(([k]) => k)) : {}),
      };
    }
  } catch {}
  return { ...WELL_KNOWN };
}
export const isIri = (id: string) => /^[a-z][\w+.-]*:/i.test(id) && !id.startsWith('_:');
