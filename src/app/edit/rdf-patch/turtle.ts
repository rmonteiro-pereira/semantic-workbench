/** Patches Turtle and N3 predicate-object lists in their original layout using token source
 * ranges. */
import { lineEndAfter, lineStart } from '../../../shared/edit/source-text';
import type { Patch } from '../../../shared/editor/patch';
import { BASE, WELL_KNOWN, usedPrefixes } from './terms';
// Edits preserve separators and the statement’s inline or multiline layout. Blocks containing N3
// formulae or rules must be edited in Source.
/** Records a Turtle token's kind, text and source offsets. */
export type Tok = {
  t:
    | 'iri'
    | 'pname'
    | 'bnode'
    | 'literal'
    | 'number'
    | 'word'
    | 'punct'
    | 'comment'
    | 'directive'
    | 'n3';
  text: string;
  start: number;
  end: number;
};
const PN = /^(?:[\p{L}_][\p{L}\p{N}_.-]*)?:(?:[\p{L}\p{N}_:%-]|\\[^\s]|\.(?=[\p{L}\p{N}_:%-]))*/u;
/** Scans Turtle tokens while respecting strings, IRIs, comments and nesting. */
export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const push = (t: Tok['t'], end: number) => {
    out.push({ t, text: src.slice(i, end), start: i, end });
    i = end;
  };
  while (i < src.length) {
    const c = src[i];
    const rest = src.slice(i, i + 3);
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '#') {
      let e = i;
      while (e < src.length && src[e] !== '\n' && src[e] !== '\r') e++;
      push('comment', e);
      continue;
    }
    if (c === '<' && src[i + 1] === '=') {
      push('n3', i + 2);
      continue;
    }
    if (c === '<') {
      const e = src.indexOf('>', i);
      if (e < 0) throw Error('Unclosed IRI.');
      push('iri', e + 1);
      continue;
    }
    if (c === '"' || c === "'") {
      let e: number;
      if (rest === c.repeat(3)) {
        e = i + 3;
        while (e < src.length && !(src.startsWith(c.repeat(3), e) && src[e - 1] !== '\\'))
          e += src[e] === '\\' ? 2 : 1;
        e += 3;
      } else {
        e = i + 1;
        while (e < src.length && src[e] !== c) {
          if (src[e] === '\n') throw Error('Unclosed string.');
          e += src[e] === '\\' ? 2 : 1;
        }
        e++;
      }
      if (src[e] === '@') {
        const m = /^@[A-Za-z]+(?:-[A-Za-z0-9]+)*/.exec(src.slice(e));
        if (m) e += m[0].length;
      } else if (src.startsWith('^^', e)) {
        e += 2;
        if (src[e] === '<') e = src.indexOf('>', e) + 1;
        else {
          const m = PN.exec(src.slice(e));
          if (m) e += m[0].length;
        }
      }
      push('literal', e);
      continue;
    }
    if (c === '@') {
      const m = /^@[A-Za-z]+/.exec(src.slice(i))!;
      push(/^@(prefix|base)$/.test(m[0]) ? 'directive' : 'n3', i + m[0].length);
      continue;
    }
    if ('[]();,{}'.includes(c)) {
      push(c === '{' || c === '}' ? 'n3' : 'punct', i + 1);
      continue;
    }
    if (c === '.' && !/[0-9]/.test(src[i + 1] ?? '')) {
      push('punct', i + 1);
      continue;
    }
    if (c === '=') {
      push('n3', i + (src[i + 1] === '>' ? 2 : 1));
      continue;
    }
    if (c === '^' || c === '!') {
      push('n3', i + 1);
      continue;
    }
    if (c === '?') {
      const m = /^\?[\w]+/.exec(src.slice(i));
      push('n3', i + (m ? m[0].length : 1));
      continue;
    }
    if (src.startsWith('_:', i)) {
      const m = /^_:[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*/u.exec(src.slice(i));
      push('bnode', i + (m ? m[0].length : 2));
      continue;
    }
    const num = /^[+-]?(?:\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(
      src.slice(i),
    );
    if (num) {
      push('number', i + num[0].length);
      continue;
    }
    const pn = PN.exec(src.slice(i));
    if (pn && pn[0].includes(':')) {
      push('pname', i + pn[0].length);
      continue;
    }
    const w = /^[A-Za-z][\w-]*/.exec(src.slice(i));
    if (w) {
      push(
        /^(PREFIX|BASE)$/i.test(w[0])
          ? 'directive'
          : ['is', 'of', 'has'].includes(w[0])
            ? 'n3'
            : 'word',
        i + w[0].length,
      );
      continue;
    }
    throw Error(`Unexpected character "${c}".`);
  }
  return out;
}
/** Records the source range and text of a Turtle object. */
export type ObjectSpan = { start: number; end: number; text: string };
/** Records a predicate and its objects within a Turtle statement. */
export type Segment = {
  verb: Tok;
  verbIri: string;
  objects: ObjectSpan[];
  start: number;
  end: number;
};
/** Records a subject's Turtle statement and predicate segments. */
export type Statement = {
  start: number;
  end: number;
  subject: string | null;
  subjectText: string;
  segments: Segment[];
  n3: boolean;
  comments: Tok[];
  directive: boolean;
  parsed: boolean;
};
/** Collects parsed Turtle statements, prefixes and source-layout information. */
export type Document = {
  statements: Statement[];
  prefixes: Record<string, string>;
  base: string;
  directiveEnd: number;
  sparqlStyle: boolean;
};
const resolve = (iri: string, base: string) => {
  try {
    return new URL(iri, base).href;
  } catch {
    return iri;
  }
};
/** Reads Turtle statements and source spans for in-place editing. */
export function readDocument(src: string): Document {
  const toks = tokenize(src);
  const statements: Statement[] = [];
  const prefixes: Record<string, string> = {};
  let base = BASE;
  let directiveEnd = 0;
  let sparqlStyle = false;
  const expand = (t: Tok): string | null =>
    t.t === 'iri'
      ? resolve(t.text.slice(1, -1), base)
      : t.t === 'pname'
        ? (() => {
            const k = t.text.indexOf(':');
            const p = t.text.slice(0, k);
            return p in prefixes ? prefixes[p] + t.text.slice(k + 1).replace(/\\(.)/g, '$1') : null;
          })()
        : t.t === 'word' && t.text === 'a'
          ? 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
          : null;
  let i = 0;
  while (i < toks.length) {
    const comments: Tok[] = [];
    while (i < toks.length && toks[i].t === 'comment') i++;
    if (i >= toks.length) break;
    const first = toks[i];
    if (first.t === 'directive') {
      const lower = first.text.toLowerCase();
      const sparql = !first.text.startsWith('@');
      if (lower.endsWith('prefix')) {
        const p = toks[i + 1];
        const iri = toks[i + 2];
        prefixes[p.text.slice(0, -1)] = resolve(iri.text.slice(1, -1), base);
        i += 3;
      } else {
        base = resolve(toks[i + 1].text.slice(1, -1), base);
        i += 2;
      }
      if (!sparql && toks[i]?.text === '.') i++;
      sparqlStyle = sparql;
      directiveEnd = toks[i - 1].end;
      statements.push({
        start: first.start,
        end: toks[i - 1].end,
        subject: null,
        subjectText: '',
        segments: [],
        n3: false,
        comments,
        directive: true,
        parsed: true,
      });
      continue;
    }
    // One statement: tokens up to the '.' outside brackets.
    let j = i;
    let depth = 0;
    const body: Tok[] = [];
    while (j < toks.length) {
      const t = toks[j];
      if (t.t === 'comment') {
        comments.push(t);
        j++;
        continue;
      }
      if (t.text === '[' || t.text === '(' || t.text === '{') depth++;
      if (t.text === ']' || t.text === ')' || t.text === '}') depth--;
      if (depth === 0 && t.t === 'punct' && t.text === '.') break;
      body.push(t);
      j++;
    }
    const end = toks[j]?.end ?? body.at(-1)!.end;
    const st: Statement = {
      start: first.start,
      end,
      subject: null,
      subjectText: first.text,
      segments: [],
      n3: body.some(t => t.t === 'n3'),
      comments,
      directive: false,
      parsed: false,
    };
    statements.push(st);
    i = j + 1;
    if (st.n3 || !['iri', 'pname'].includes(first.t)) continue;
    st.subject = expand(first);
    // Predicate-object list
    let k = 1;
    let ok = true;
    const object = (): ObjectSpan | null => {
      const t = body[k];
      if (!t) return null;
      if (t.text === '[' || t.text === '(') {
        let d = 0;
        let e = k;
        for (; e < body.length; e++) {
          if (body[e].text === '[' || body[e].text === '(') d++;
          if (body[e].text === ']' || body[e].text === ')') d--;
          if (d === 0) break;
        }
        if (e >= body.length) return null;
        const span = { start: t.start, end: body[e].end, text: src.slice(t.start, body[e].end) };
        k = e + 1;
        return span;
      }
      if (
        ['iri', 'pname', 'bnode', 'literal', 'number'].includes(t.t) ||
        (t.t === 'word' && (t.text === 'true' || t.text === 'false'))
      ) {
        k++;
        return { start: t.start, end: t.end, text: t.text };
      }
      return null;
    };
    while (k < body.length) {
      const verb = body[k];
      const iri = expand(verb);
      if (!iri || !['iri', 'pname', 'word'].includes(verb.t)) {
        ok = false;
        break;
      }
      k++;
      const objects: ObjectSpan[] = [];
      const o = object();
      if (!o) {
        ok = false;
        break;
      }
      objects.push(o);
      while (body[k]?.text === ',') {
        k++;
        const n = object();
        if (!n) {
          ok = false;
          break;
        }
        objects.push(n);
      }
      if (!ok) break;
      st.segments.push({
        verb,
        verbIri: iri,
        objects,
        start: verb.start,
        end: objects.at(-1)!.end,
      });
      if (k < body.length) {
        if (body[k].text !== ';') {
          ok = false;
          break;
        }
        while (body[k]?.text === ';') k++;
      }
    }
    st.parsed = ok && st.segments.length > 0;
  }
  return { statements, prefixes, base, directiveEnd, sparqlStyle };
}

/** Locates a predicate-object pair by statement, segment and object indexes. */
export type PairRef = { statement: number; segment: number; object: number };
/** Supplies a predicate IRI and source text for a new Turtle pair. */
export type TurtleAdd = { verbIri: string; verbText: string; objectText: string };
const only = (src: string, from: number, to: number) => /^[ \t]*$/.test(src.slice(from, to));
// Separator before a new pair: the block's own (a line break and the indentation of its later
// predicates, or a space when the block is on one line).
function separator(src: string, st: Statement, eol: string) {
  const later = st.segments.slice(1).find(s => only(src, lineStart(src, s.start), s.start));
  return later ? eol + src.slice(lineStart(src, later.start), later.start) : ' ';
}
/** Edits predicate-object lists while preserving surrounding Turtle layout. */
export function turtlePatches(
  src: string,
  doc: Document,
  subject: string,
  removed: Set<string>,
  replaced: Map<string, string>,
  added: TurtleAdd[],
  eol: string,
  subjectText: string,
): { patches: Patch[]; warnings: string[] } {
  const patches: Patch[] = [];
  const warnings: string[] = [];
  const mine = doc.statements
    .map((s, i) => ({ s, i }))
    .filter(x => !x.s.directive && x.s.subject === subject);
  const id = (st: number, sg: number, ob: number) => `${st}:${sg}:${ob}`;
  const warnComments = (from: number, to: number, st: Statement) => {
    for (const c of st.comments)
      if (c.start >= from && c.end <= to)
        warnings.push(
          `The comment "${c.text.slice(0, 80)}" is inside a removed statement and is removed with it.`,
        );
  };
  let pending = [...added];
  mine.forEach(({ s: st, i }, n) => {
    const keptSeg = st.segments.map((sg, g) =>
      sg.objects.some((_, o) => !removed.has(id(i, g, o))),
    );
    const additions = n === 0 ? pending : [];
    if (n === 0) pending = [];
    // Additions to a predicate the block already has go after its last remaining object.
    const rest: TurtleAdd[] = [];
    for (const a of additions) {
      const g = st.segments.findIndex((sg, x) => keptSeg[x] && sg.verbIri === a.verbIri);
      if (g < 0) {
        rest.push(a);
        continue;
      }
      const sg = st.segments[g];
      const last = [...sg.objects.keys()].filter(o => !removed.has(id(i, g, o))).at(-1)!;
      patches.push({
        from: sg.objects[last].end,
        to: sg.objects[last].end,
        insert: ', ' + a.objectText,
      });
    }
    const grouped = new Map<string, TurtleAdd[]>();
    for (const a of rest) grouped.set(a.verbIri, [...(grouped.get(a.verbIri) ?? []), a]);
    const newText = (sep: string) =>
      [...grouped.values()]
        .map(g => `${g[0].verbText} ${g.map(a => a.objectText).join(', ')}`)
        .join(' ;' + sep);
    if (!keptSeg.some(Boolean)) {
      if (grouped.size) {
        const sep = separator(src, st, eol);
        patches.push({
          from: st.segments[0].start,
          to: st.segments.at(-1)!.end,
          insert: newText(sep),
        });
        warnComments(st.segments[0].start, st.segments.at(-1)!.end, st);
      } else {
        const from = only(src, lineStart(src, st.start), st.start)
          ? lineStart(src, st.start)
          : st.start;
        const to =
          only(src, st.end, lineEndAfter(src, st.end)) ||
          /^[ \t]*\r?\n?$/.test(src.slice(st.end, lineEndAfter(src, st.end)))
            ? lineEndAfter(src, st.end)
            : st.end;
        patches.push({ from, to, insert: '' });
        warnComments(from, to, st);
      }
      return;
    }
    // Removed predicates, as runs: a run after a kept one starts at its end (taking the ';' and
    // any comment before the removed predicate); a run at the start goes up to the next kept one.
    for (let g = 0; g < st.segments.length;) {
      if (keptSeg[g]) {
        g++;
        continue;
      }
      let h = g;
      while (h + 1 < st.segments.length && !keptSeg[h + 1]) h++;
      const from = g > 0 ? st.segments[g - 1].end : st.segments[g].start;
      const to = g > 0 ? st.segments[h].end : st.segments[h + 1].start;
      patches.push({ from, to, insert: '' });
      warnComments(from, to, st);
      g = h + 1;
    }
    st.segments.forEach((sg, g) => {
      if (!keptSeg[g]) return;
      const keptObj = sg.objects.map((_, o) => !removed.has(id(i, g, o)));
      for (let o = 0; o < sg.objects.length;) {
        if (keptObj[o]) {
          const r = replaced.get(id(i, g, o));
          if (r !== undefined)
            patches.push({ from: sg.objects[o].start, to: sg.objects[o].end, insert: r });
          o++;
          continue;
        }
        let h = o;
        while (h + 1 < sg.objects.length && !keptObj[h + 1]) h++;
        const from = o > 0 ? sg.objects[o - 1].end : sg.objects[o].start;
        const to = o > 0 ? sg.objects[h].end : sg.objects[h + 1].start;
        patches.push({ from, to, insert: '' });
        o = h + 1;
      }
    });
    if (grouped.size) {
      const last = st.segments[keptSeg.lastIndexOf(true)];
      patches.push({
        from: last.end,
        to: last.end,
        insert: ' ;' + separator(src, st, eol) + newText(separator(src, st, eol)),
      });
    }
  });
  // A resource without statements gets a new one at the end of the file, in the file's layout.
  if (pending.length) {
    const grouped = new Map<string, TurtleAdd[]>();
    for (const a of pending) grouped.set(a.verbIri, [...(grouped.get(a.verbIri) ?? []), a]);
    const multi = doc.statements.some(
      s => !s.directive && s.segments.length > 1 && separator(src, s, eol) !== ' ',
    );
    const indent = (() => {
      const s = doc.statements.find(
        s => !s.directive && s.segments.length > 1 && separator(src, s, eol) !== ' ',
      );
      return s ? separator(src, s, eol).slice(eol.length) : '    ';
    })();
    const body = [...grouped.values()]
      .map(g => `${g[0].verbText} ${g.map(a => a.objectText).join(', ')}`)
      .join(multi ? ` ;${eol}${indent}` : ' ; ');
    const at = src.length;
    const needsBreak = at > 0 && !/[\r\n]$/.test(src);
    patches.push({
      from: at,
      to: at,
      insert: `${needsBreak ? eol : ''}${subjectText} ${body} .${eol}`,
    });
  }
  return { patches, warnings };
}

/** Adds declarations for well-known prefixes used by new text but absent from the file. */
export function prefixPatches(src: string, doc: Document, texts: string[], eol: string): Patch[] {
  const missing = [...new Set(texts.flatMap(usedPrefixes))].filter(
    p => !(p in doc.prefixes) && p in WELL_KNOWN,
  );
  if (!missing.length) return [];
  const at = doc.directiveEnd ? lineEndAfter(src, doc.directiveEnd) : 0;
  return [
    {
      from: at,
      to: at,
      insert:
        missing
          .map(p =>
            doc.sparqlStyle
              ? `PREFIX ${p}: <${WELL_KNOWN[p]}>`
              : `@prefix ${p}: <${WELL_KNOWN[p]}> .`,
          )
          .join(eol) + eol,
    },
  ];
}
