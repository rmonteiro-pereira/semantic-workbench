/** Patches N-Triples by whole lines so unrelated spacing, comments and line endings keep their
 * bytes. */
import { Parser } from 'n3';
import type { Patch } from '../../../shared/editor/patch';
import { BASE, ntTerm, type Term, type Triple } from './terms';
// N-Triples: one triple per line, so an edit replaces, adds or removes whole lines and every other
// line keeps its bytes (spacing, comments, line endings).
/** Records an N-Triples source line and its optional parsed triple. */
export type Line = { start: number; end: number; text: string; triple: Triple | null };
const plain = (parsedTerm: any): Term =>
  parsedTerm.termType === 'Literal'
    ? {
        termType: 'Literal',
        value: parsedTerm.value,
        language: parsedTerm.language || undefined,
        datatype: parsedTerm.language ? undefined : parsedTerm.datatype?.value,
      }
    : { termType: parsedTerm.termType, value: parsedTerm.value };
/** Reads N-Triples lines with exact source offsets. */
export function readLines(src: string): Line[] {
  const out: Line[] = [];
  const re = /[^\r\n]*(\r\n|\r|\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) && match[0].length) {
    const text = match[0].replace(/\r?\n$|\r$/, '');
    const start = match.index;
    let triple: Triple | null = null;
    if (text.trim() && !text.trim().startsWith('#')) {
      const quads = new Parser({ format: 'N-Triples', baseIRI: BASE, blankNodePrefix: '' }).parse(text);
      if (quads.length === 1)
        triple = {
          s: plain(quads[0].subject),
          p: plain(quads[0].predicate),
          o: plain(quads[0].object),
        };
    }
    out.push({ start, end: start + match[0].length, text, triple });
  }
  return out;
}

/** Serializes one triple without a trailing line break. */
export const ntLine = (s: string, p: string, o: Term) => `<${s}> <${p}> ${ntTerm(o)} .`;
/** Adds, removes or replaces triple lines while preserving unrelated bytes. */
export function ntPatches(src: string, lines: Line[], subject: string, removed: Set<number>, replaced: Map<number, string>, added: string[], eol: string): Patch[] {
  const patches: Patch[] = [];
  lines.forEach((line, i) => {
    if (removed.has(i)) patches.push({ from: line.start, to: line.end, insert: '' });
    else if (replaced.has(i))
      patches.push({
        from: line.start,
        to: line.start + line.text.length,
        insert: replaced.get(i)!,
      });
  });
  if (added.length) {
    // After the subject's last line, or at the end of the file.
    const last = [...lines.keys()].filter(i => lines[i].triple?.s.value === subject && lines[i].triple?.s.termType === 'NamedNode').at(-1);
    const at = last !== undefined ? lines[last].end : src.length;
    const needsBreak = at > 0 && !/[\r\n]$/.test(src.slice(0, at));
    patches.push({
      from: at,
      to: at,
      insert: needsBreak ? eol + added.join(eol) : added.map(l => l + eol).join(''),
    });
  }
  return patches;
}
