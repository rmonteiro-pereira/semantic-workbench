/** Edits RDF resources in place and accepts only the intended changes to the parsed graph. */
import { applyPatches, dominantLineBreak, type Patch } from '../../../shared/editor/patch';
import { lineStart } from '../../../shared/edit/source-text';
import { gate, type Gate } from './isomorphism';
import { BASE, RDF, WELL_KNOWN, formatOf, parseGraph, parseObject, parsePredicate, shortIri, termKey, turtleTerm, isBlank, type RdfFormat, type Term, type Triple } from './terms';
import { readDocument, turtlePatches, prefixPatches, type Document } from './turtle';
import { readLines, ntLine, ntPatches, type Line } from './ntriples';
import { scanXml, rdfRoot, nodeElements, elementPairs, isolatedTriples, propertyElement, addPatch, lineRange, childIndent, qname, escapeXml, scope, type El } from './rdfxml';
// The serialization determines the smallest supported text change. The result must parse as
// exactly the original graph minus removed triples plus added triples.
/** Describes an editable predicate-object pair and its source identity. */
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
/** Collects a resource's editable statements, prefixes and source information. */
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
/** Supplies the requested predicate and object text for an RDF statement. */
export type DesiredPair = { id?: string; predicateText: string; objectText: string };
/** Reports an accepted RDF edit or the reason it cannot be applied safely. */
export type RdfResult = { ok: true; text: string; patches: Patch[]; warnings: string[]; removed: number; added: number } | { ok: false; error: string; line?: number };
const lineOf = (src: string, pos: number) => src.slice(0, pos).split(/\r\n|\r|\n/).length;
const PLACEHOLDER_SUBJECT = 'urn:workbench:s';
const resubject = (triples: Triple[], subject: string) =>
  triples.map(t => (t.s.value === PLACEHOLDER_SUBJECT && t.s.termType === 'NamedNode' ? { ...t, s: { termType: 'NamedNode' as const, value: subject } } : t));
// A blank-node subtree as Turtle `[... ]`, for showing nested RDF/XML descriptions.
function nestedText(term: Term, triples: Triple[], prefixes: Record<string, string>, depth = 0): string {
  if (!isBlank(term) || depth > 8) return turtleTerm(term, prefixes);
  const own = triples.filter(t => termKey(t.s) === termKey(term));
  const statements = own.map(t => {
    const predicate = t.p.value === RDF + 'type' ? 'a' : shortIri(t.p.value, prefixes);
    return `${predicate} ${nestedText(t.o, triples, prefixes, depth + 1)}`;
  });
  return `[ ${statements.join(' ; ')} ]`;
}
// The triples a blank node reaches (its description, nested descriptions, collections).
function subtree(term: Term, all: Triple[]): Triple[] {
  if (!isBlank(term)) return [];
  const out: Triple[] = [];
  const seen = new Set<string>();
  const queue = [termKey(term)];
  while (queue.length) {
    const key = queue.pop()!;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const triple of all)
      if (termKey(triple.s) === key) {
        out.push(triple);
        if (isBlank(triple.o)) queue.push(termKey(triple.o));
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
    const doc = scanXml(src);
    const root = rdfRoot(doc);
    if (!root) throw Error('No rdf:RDF element.');
    return { format, xml: { root, nodes: nodeElements(root) } };
  }
  if (format === 'ntriples') return { format, lines: readLines(src) };
  return { format, turtle: readDocument(src) };
}
function xmlPairs(src: string, parsedSource: Parsed, subject: string) {
  const mine = parsedSource.xml!.nodes.filter(n => n.subject === subject);
  return {
    mine,
    pairs: mine.filter(n => n.top).flatMap((n, e) => elementPairs(src, n.el).map((x, k) => ({ x, id: `${e}:${k}` }))),
  };
}
/** Reads a resource's statements for editing in its original serialization. */
export function readRdfItem(src: string, filename: string, subject: string): RdfItem {
  const format = formatOf(filename, src);
  const parsedSource = parsed(src, format);
  if (format === 'ntriples') {
    const lines = parsedSource.lines!;
    const mine = [...lines.keys()].filter(i => lines[i].triple?.s.termType === 'NamedNode' && lines[i].triple!.s.value === subject);
    const prefixes = WELL_KNOWN;
    // Labelled blank nodes keep their labels (one parse per line), so a statement's blank-node
    // object brings the lines that describe it.
    const all = lines.flatMap(l => (l.triple ? [l.triple] : []));
    const pairs = mine.map(i => {
      const triple = lines[i].triple!;
      return {
        id: String(i),
        predicate: triple.p.value,
        predicateText: shortIri(triple.p.value, prefixes),
        object: triple.o,
        objectText: turtleTerm(triple.o, prefixes),
        nested: false,
        line: lineOf(src, lines[i].start),
        triples: [triple, ...subtree(triple.o, all)],
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
      fragment: mine.length ? { from: lines[mine[0]].start, to: lines[end].start + lines[end].text.length } : null,
      subjectText: `<${subject}>`,
      ranges: mine.map(i => ({ from: lines[i].start, to: lines[i].end })),
    };
  }
  if (format === 'rdfxml') {
    const { ns, base } = scope(parsedSource.xml!.root);
    const prefixes = Object.fromEntries(Object.entries(ns).filter(([k]) => k));
    const { mine, pairs: raw } = xmlPairs(src, parsedSource, subject);
    const nested = mine.find(n => !n.top);
    const refused = raw.find(r => r.x.refuse);
    let refusal;
    if (nested) {
      refusal = {
        reason: `This resource is also described inside another element (line ${lineOf(src, nested.el.start)}); edit it in Source.`,
        line: lineOf(src, nested.el.start),
      };
    } else if (refused) {
      refusal = {
        reason: refused.x.refuse!,
        line: lineOf(src, refused.x.child?.start ?? refused.x.el.start),
      };
    } else {
      refusal = undefined;
    }
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
      let objectText: string;
      if (x.nested && top) {
        objectText = nestedText(top.o, triples, { ...WELL_KNOWN, ...prefixes });
      } else if (x.object) {
        objectText = turtleTerm(x.object, { ...WELL_KNOWN, ...prefixes });
      } else {
        objectText = '';
      }
      return {
        id,
        predicate: x.predicate,
        predicateText: x.predicate === RDF + 'type' ? 'a' : shortIri(x.predicate, { ...WELL_KNOWN, ...prefixes }),
        object: top?.o ?? x.object ?? null,
        objectText,
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
  const doc = parsedSource.turtle!;
  const mine = doc.statements.map((s, i) => ({ s, i })).filter(x => !x.s.directive && x.s.subject === subject);
  const short = shortIri(subject, doc.prefixes);
  const n3 = doc.statements.find(
    statement =>
      statement.n3 &&
      (src.slice(statement.start, statement.end).includes(`<${subject}>`) ||
        (short.startsWith('<') ? false : new RegExp(`(^|[^\\w:])${short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(src.slice(statement.start, statement.end)))),
  );
  const broken = mine.find(x => !x.s.parsed);
  let refusal;
  if (n3) {
    refusal = {
      reason: `This resource appears in an N3 formula or rule (line ${lineOf(src, n3.start)}); N3 formulae and rules are edited in Source.`,
      line: lineOf(src, n3.start),
    };
  } else if (broken) {
    refusal = {
      reason: `The statement at line ${lineOf(src, broken.s.start)} uses a form the item editor does not rewrite; edit it in Source.`,
      line: lineOf(src, broken.s.start),
    };
  } else {
    refusal = undefined;
  }
  const pairs: RdfPair[] = [];
  let whole: Triple[] | null = null;
  const graphOf = () => (whole ??= parseGraph(src, format));
  for (const { s: statement, i } of mine)
    if (statement.parsed)
      statement.segments.forEach((sg, segmentIndex) =>
        sg.objects.forEach((objectSpan, index) => {
          let triples: Triple[] = [];
          let object: Term | null = null;
          let nested = false;
          try {
            const po = parseObject(objectSpan.text, doc.prefixes, doc.base);
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
            if (objectSpan.text.startsWith('_:')) {
              const label = objectSpan.text.slice(2);
              const graphTriples = graphOf();
              const node = graphTriples.find(t => isBlank(t.s) && (t.s.value === label || t.s.value.endsWith('_' + label)))?.s;
              if (node) {
                object = node;
                triples = [{ ...triples[0], o: node }, ...subtree(node, graphTriples)];
              }
            }
          } catch {}
          pairs.push({
            id: `${i}:${segmentIndex}:${index}`,
            predicate: sg.verbIri,
            predicateText: sg.verb.text,
            object,
            objectText: objectSpan.text,
            nested,
            line: lineOf(src, objectSpan.start),
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
  const prefixes = { ...WELL_KNOWN, ...item.prefixes };
  const byId = new Map(item.pairs.map(p => [p.id, p]));
  const out: Plan = { removed: [], replaced: [], added: [], intended: [] };
  const kept = new Set<string>();
  const read = (desiredPair: DesiredPair) => {
    if (!desiredPair.predicateText.trim() || !desiredPair.objectText.trim()) throw Error('Each statement needs a predicate and an object.');
    const predicate = parsePredicate(desiredPair.predicateText, prefixes, item.base);
    const po = parseObject(desiredPair.objectText, prefixes, item.base);
    if (po.nested && item.format !== 'turtle' && item.format !== 'n3')
      throw Error(`Nested descriptions ("${desiredPair.objectText.slice(0, 40)}") are edited in Source in ${item.format === 'ntriples' ? 'N-Triples' : 'RDF/XML'}.`);
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
  for (const desiredPair of desired) {
    const rdfPair = desiredPair.id ? byId.get(desiredPair.id) : undefined;
    if (rdfPair && desiredPair.predicateText === rdfPair.predicateText && desiredPair.objectText === rdfPair.objectText) {
      kept.add(rdfPair.id);
      out.intended.push(...rdfPair.triples);
      continue;
    }
    if (rdfPair?.locked) throw Error(`${rdfPair.predicateText} ${rdfPair.objectText.slice(0, 60)}: ${rdfPair.locked}`);
    const parsedPair = read(desiredPair);
    if (rdfPair && parsedPair.predicate === rdfPair.predicate) {
      kept.add(rdfPair.id);
      out.replaced.push({
        pair: rdfPair,
        predicate: parsedPair.predicate,
        objectText: desiredPair.objectText.trim(),
        object: parsedPair.object,
        triples: parsedPair.triples,
      });
    } else
      out.added.push({
        predicate: parsedPair.predicate,
        predicateText: desiredPair.predicateText.trim(),
        objectText: desiredPair.objectText.trim(),
        object: parsedPair.object,
        triples: parsedPair.triples,
        nested: parsedPair.nested,
      });
    out.intended.push(...parsedPair.triples);
  }
  for (const pair of item.pairs)
    if (!kept.has(pair.id)) {
      if (pair.locked && !pair.nested && !deleting) throw Error(`${pair.predicateText} ${pair.objectText}: ${pair.locked}`);
      out.removed.push(pair);
    }
  return out;
}
// The patches for one resource (no gate).
function patchesFor(src: string, item: RdfItem, pl: Plan, parsedSource: Parsed): { patches: Patch[]; warnings: string[] } {
  const eol = dominantLineBreak(src);
  if (item.format === 'ntriples') {
    const rendered = (predicate: string, o: Term) => ntLine(item.subject, predicate, o);
    // A removed or replaced statement whose object is a labelled blank node takes the lines that
    // describe that node (when nothing else refers to it).
    const lines = parsedSource.lines!;
    const gone = new Set(pl.removed.map(r => Number(r.id)));
    const dropped = [...pl.removed.map(r => r.object), ...pl.replaced.map(r => r.pair.object)].filter((o): o is Term => !!o && isBlank(o));
    for (const term of dropped) {
      const tree = new Set([
        termKey(term),
        ...subtree(
          term,
          lines.flatMap(l => (l.triple ? [l.triple] : [])),
        ).map(t => termKey(t.s)),
      ]);
      const others = lines.some(
        (line, i) => line.triple && !gone.has(i) && !tree.has(termKey(line.triple.s)) && termKey(line.triple.o) === termKey(term) && !pl.replaced.some(r => Number(r.pair.id) === i),
      );
      if (!others)
        lines.forEach((l, i) => {
          if (l.triple && tree.has(termKey(l.triple.s))) gone.add(i);
        });
    }
    return {
      patches: ntPatches(
        src,
        parsedSource.lines!,
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
    const { mine, pairs } = xmlPairs(src, parsedSource, item.subject);
    const find = (id: string) => pairs.find(x => x.id === id)!.x;
    const root = parsedSource.xml!.root;
    const patches: Patch[] = [];
    const top = mine.filter(n => n.top);
    // Every statement removed: the node elements go.
    if (!pl.added.length && !pl.replaced.length && pl.removed.length === item.pairs.length && top.length) {
      for (const topNode of top) {
        const range = lineRange(src, topNode.el.start, topNode.el.end);
        patches.push({ ...range, insert: '' });
      }
      return { patches, warnings: [] };
    }
    const extra: string[] = [];
    for (const rdfPair of pl.removed) {
      const x = find(rdfPair.id);
      if (x.kind === 'element') {
        patches.push({ ...lineRange(src, x.child!.start, x.child!.end), insert: '' });
      } else if (x.kind === 'attr') {
        const ws = /[ \t\r\n]*$/.exec(src.slice(x.el.start, x.attr!.start))![0].length;
        patches.push({ from: x.attr!.start - ws, to: x.attr!.end, insert: '' });
      }
    }
    for (const replacement of pl.replaced) {
      const x = find(replacement.pair.id);
      const { ns, lang } = scope(x.el);
      if (x.kind === 'element')
        patches.push({
          from: x.child!.start,
          to: x.child!.end,
          insert: propertyElement(replacement.predicate, replacement.object, ns, scope(x.child!.parent).lang),
        });
      else if (replacement.object.termType === 'Literal' && !replacement.object.language && (!replacement.object.datatype || replacement.object.datatype.endsWith('#string')) && !lang)
        patches.push({
          from: x.attr!.start,
          to: x.attr!.end,
          insert: `${x.attr!.name}="${escapeXml(replacement.object.value, true)}"`,
        });
      else {
        const ws = /[ \t\r\n]*$/.exec(src.slice(x.el.start, x.attr!.start))![0].length;
        patches.push({ from: x.attr!.start - ws, to: x.attr!.end, insert: '' });
        extra.push(propertyElement(replacement.predicate, replacement.object, ns, lang));
      }
    }
    const target = top[0]?.el;
    if (target) {
      const { ns, lang } = scope(target);
      const els = [...extra, ...pl.added.map(a => propertyElement(a.predicate, a.object, ns, lang))];
      if (els.length) patches.push(addPatch(src, target, root, els, eol));
    } else if (pl.added.length) {
      // A new node element before </rdf:RDF>, typed when its type has a declared prefix.
      const { ns } = scope(root);
      const type = pl.added.find(a => a.predicate === RDF + 'type' && a.object.termType === 'NamedNode');
      let tag = 'rdf:Description';
      let rest = pl.added;
      if (type) {
        try {
          const qualified = qname(type.object.value, ns);
          if (!qualified.decl) {
            tag = qualified.name;
            rest = pl.added.filter(a => a !== type);
          }
        } catch {}
      }
      // One level below the root, and one more for the properties (as the file's other elements).
      const indent = childIndent(src, root, root);
      const sample = root.children.find(c => c.children.length);
      const inner = sample ? childIndent(src, sample, root) : indent + '    ';
      const body = rest.map(a => inner + propertyElement(a.predicate, a.object, ns, '')).join(eol);
      const text = rest.length
        ? `${indent}<${tag} rdf:about="${escapeXml(item.subject, true)}">${eol}${body}${eol}${indent}</${tag}>${eol}`
        : `${indent}<${tag} rdf:about="${escapeXml(item.subject, true)}"/>${eol}`;
      const ownLine = /^[ \t]*$/.test(src.slice(lineStart(src, root.closeStart), root.closeStart));
      const at = ownLine ? lineStart(src, root.closeStart) : root.closeStart;
      patches.push({ from: at, to: at, insert: ownLine ? text : eol + text });
    }
    return { patches, warnings: [] };
  }
  const doc = parsedSource.turtle!;
  const turtleResult = turtlePatches(
    src,
    doc,
    item.subject,
    new Set(pl.removed.map(x => x.id)),
    new Map(pl.replaced.map(x => [x.pair.id, x.objectText])),
    pl.added.map(added => ({
      verbIri: added.predicate,
      verbText: added.predicateText,
      objectText: added.objectText,
    })),
    eol,
    item.subjectText,
  );
  return {
    patches: [...prefixPatches(src, doc, [...pl.added.flatMap(a => [a.predicateText, a.objectText]), ...pl.replaced.map(x => x.objectText)], eol), ...turtleResult.patches],
    warnings: turtleResult.warnings,
  };
}
const order = (ps: Patch[]) => [...ps].sort((a, b) => a.from - b.from || a.to - a.from - (b.to - b.from));
// Apply, re-read and check: the text is accepted only when the gate passes.
function finish(src: string, format: RdfFormat, patches: Patch[], warnings: string[], subjects: string[], intended: Triple[]): RdfResult {
  let text: string;
  try {
    text = applyPatches(src, order(patches));
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  let before: Triple[];
  let after: Triple[];
  try {
    before = parseGraph(src, format);
  } catch (error) {
    return { ok: false, error: `The file does not parse: ${(error as Error).message}` };
  }
  try {
    after = parseGraph(text, format);
  } catch (error) {
    return { ok: false, error: `The edit would not parse: ${(error as Error).message}` };
  }
  const verdict: Gate = gate(before, after, subjects, intended);
  return verdict.ok
    ? {
        ok: true,
        text,
        patches: order(patches),
        warnings,
        removed: verdict.removed,
        added: verdict.added,
      }
    : { ok: false, error: verdict.reason };
}
/** Applies requested pairs and rejects unintended changes to the parsed RDF graph. */
export function editRdfItem(src: string, filename: string, subject: string, desired: DesiredPair[]): RdfResult {
  const format = formatOf(filename, src);
  try {
    const item = readRdfItem(src, filename, subject);
    if (item.refusal) return { ok: false, error: item.refusal.reason, line: item.refusal.line };
    const pl = plan(item, desired);
    const itemPatches = patchesFor(src, item, pl, parsed(src, format));
    return finish(src, format, itemPatches.patches, itemPatches.warnings, [subject], resubject(pl.intended, subject));
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
// Statements elsewhere in the file that name `subject` as their object (top-level pairs only; a
// nested description is removed with its parent pair).
/** Finds top-level statements that refer to the subject as their object. */
export function rdfReferences(src: string, filename: string, subject: string) {
  const format = formatOf(filename, src);
  const triples = parseGraph(src, format);
  const key = `<${subject}>`;
  const owners = new Set<string>();
  const bySubject = new Map<string, Triple[]>();
  for (const triple of triples) {
    const key = termKey(triple.s);
    bySubject.set(key, [...(bySubject.get(key) ?? []), triple]);
  }
  const reaches = (term: Term, seen = new Set<string>()): boolean => {
    if (termKey(term) === key) return true;
    if (!isBlank(term) || seen.has(termKey(term))) return false;
    seen.add(termKey(term));
    return (bySubject.get(termKey(term)) ?? []).some(x => reaches(x.o, seen));
  };
  const blankOwners: string[] = [];
  for (const triple of triples) if (triple.s.termType === 'NamedNode' && triple.s.value !== subject && reaches(triple.o)) owners.add(triple.s.value);
  for (const triple of triples) if (isBlank(triple.s) && termKey(triple.o) === key && !triples.some(x => termKey(x.o) === termKey(triple.s))) blankOwners.push(termKey(triple.s));
  return { owners: [...owners], unowned: blankOwners.length };
}
/** Deletes a resource and selected references behind the RDF graph check. */
export function deleteRdfItem(src: string, filename: string, subject: string, withReferences = true): RdfResult & { dependents?: { subject: string; pairs: string[] }[] } {
  const format = formatOf(filename, src);
  try {
    const parsedSource = parsed(src, format);
    const item = readRdfItem(src, filename, subject);
    if (item.refusal) return { ok: false, error: item.refusal.reason, line: item.refusal.line };
    const patches: Patch[] = [];
    const warnings: string[] = [];
    const intended: Triple[] = [];
    const subjects = [subject];
    const dependents: { subject: string; pairs: string[] }[] = [];
    const own = patchesFor(src, item, plan(item, [], true), parsedSource);
    patches.push(...own.patches);
    warnings.push(...own.warnings);
    if (withReferences)
      for (const owner of rdfReferences(src, filename, subject).owners) {
        const rdfItem = readRdfItem(src, filename, owner);
        if (rdfItem.refusal)
          return {
            ok: false,
            error: `${rdfItem.subjectText} refers to this resource: ${rdfItem.refusal.reason}`,
            line: rdfItem.refusal.line,
          };
        const keep = rdfItem.pairs.filter(x => !x.triples.some(t => t.o.termType === 'NamedNode' && t.o.value === subject));
        const drop = rdfItem.pairs.filter(x => !keep.includes(x));
        const pl = plan(
          rdfItem,
          keep.map(x => ({ id: x.id, predicateText: x.predicateText, objectText: x.objectText })),
        );
        const ownerPatches = patchesFor(src, rdfItem, pl, parsedSource);
        patches.push(...ownerPatches.patches);
        warnings.push(...ownerPatches.warnings);
        intended.push(...resubject(pl.intended, owner));
        subjects.push(owner);
        dependents.push({
          subject: rdfItem.subjectText,
          pairs: drop.map(x => `${x.predicateText} ${x.objectText.length > 80 ? x.objectText.slice(0, 77) + '…' : x.objectText}`),
        });
      }
    return { ...finish(src, format, patches, warnings, subjects, intended), dependents };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
// Source edits may change only this resource’s statements; unrelated triples must stay equal.
/** Accepts a source edit only if statements outside the resource stay unchanged. */
export function checkRdfSource(before: string, after: string, filename: string, subject: string): Gate {
  const format = formatOf(filename, before);
  let beforeTriples: Triple[];
  let afterTriples: Triple[];
  try {
    beforeTriples = parseGraph(before, format);
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
  try {
    afterTriples = parseGraph(after, format);
  } catch (error) {
    return { ok: false, reason: `The edit does not parse: ${(error as Error).message}` };
  }
  return gate(beforeTriples, afterTriples, [subject]);
}
/** Exports RDF format detection for editing callers. */
export { formatOf };
// A new resource: its statements in the file's own layout (refused when it already has some).
/** Adds a new resource in the file's layout, refusing subjects already described. */
export function addRdfItem(src: string, filename: string, subject: string, desired: DesiredPair[]): RdfResult {
  try {
    if (readRdfItem(src, filename, subject).pairs.length)
      return {
        ok: false,
        error: `${subject} already has statements in this file; edit it instead.`,
      };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  return editRdfItem(
    src,
    filename,
    subject,
    desired.map(({ predicateText, objectText }) => ({ predicateText, objectText })),
  );
}

/** Returns file-declared and well-known prefixes available for RDF editing. */
export function rdfPrefixes(src: string, filename: string): Record<string, string> {
  const format = formatOf(filename, src);
  try {
    if (format === 'turtle' || format === 'n3') return { ...WELL_KNOWN, ...readDocument(src).prefixes };
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
/** Checks for an absolute IRI-like identifier, excluding blank-node labels. */
export const isIri = (id: string) => /^[a-z][\w+.-]*:/i.test(id) && !id.startsWith('_:');
