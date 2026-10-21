import { Parser } from 'n3';
import type { Patch } from '../../editor/patch';
import { BASE, ntTerm, type Term, type Triple } from './terms';
// N-Triples (FR-055): one triple per line, so an edit replaces, adds or removes whole lines and
// every other line keeps its bytes (spacing, comments, line endings).
export type Line = { start: number; end: number; text: string; triple: Triple | null };
const plain = (t: any): Term =>
  t.termType === 'Literal'
    ? {
        termType: 'Literal',
        value: t.value,
        language: t.language || undefined,
        datatype: t.language ? undefined : t.datatype?.value,
      }
    : { termType: t.termType, value: t.value };
export function readLines(src: string): Line[] {
  const out: Line[] = [];
  const re = /[^\r\n]*(\r\n|\r|\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && m[0].length) {
    const text = m[0].replace(/\r?\n$|\r$/, ''),
      start = m.index;
    let triple: Triple | null = null;
    if (text.trim() && !text.trim().startsWith('#')) {
      const q = new Parser({ format: 'N-Triples', baseIRI: BASE, blankNodePrefix: '' }).parse(text);
      if (q.length === 1)
        triple = { s: plain(q[0].subject), p: plain(q[0].predicate), o: plain(q[0].object) };
    }
    out.push({ start, end: start + m[0].length, text, triple });
  }
  return out;
}
// A triple as one N-Triples line, without its line break.
export const ntLine = (s: string, p: string, o: Term) => `<${s}> <${p}> ${ntTerm(o)} .`;
export function ntPatches(
  src: string,
  lines: Line[],
  subject: string,
  removed: Set<number>,
  replaced: Map<number, string>,
  added: string[],
  eol: string,
): Patch[] {
  const patches: Patch[] = [];
  lines.forEach((l, i) => {
    if (removed.has(i)) patches.push({ from: l.start, to: l.end, insert: '' });
    else if (replaced.has(i))
      patches.push({ from: l.start, to: l.start + l.text.length, insert: replaced.get(i)! });
  });
  if (added.length) {
    // After the subject's last line, or at the end of the file.
    const last = [...lines.keys()]
      .filter(
        i => lines[i].triple?.s.value === subject && lines[i].triple?.s.termType === 'NamedNode',
      )
      .at(-1);
    const at = last !== undefined ? lines[last].end : src.length,
      needsBreak = at > 0 && !/[\r\n]$/.test(src.slice(0, at));
    patches.push({
      from: at,
      to: at,
      insert: needsBreak ? eol + added.join(eol) : added.map(l => l + eol).join(''),
    });
  }
  return patches;
}
