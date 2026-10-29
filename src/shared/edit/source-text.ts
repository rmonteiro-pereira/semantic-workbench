/** Preserves source indentation and line endings when extracting and replacing item fragments. */
import { dominantLineBreak, type Patch } from '../editor/patch';
// Text helpers shared by the YAML and JSON item patchers: line positions, the document's own
// indentation and line-break style, and the dedented item fragment the item editor shows, whose
// edits are put back with the original indentation byte for byte.
/** Exports the source replacement type used by item patchers. */
export type { Patch };
/** Checks for a non-null mapping value rather than an array. */
export const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Compares structured values recursively without depending on object key order. */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}
/** Returns the start offset of the line containing a source position. */
export const lineStart = (src: string, pos: number) => {
  let i = pos;
  while (i > 0 && src[i - 1] !== '\n' && src[i - 1] !== '\r') i--;
  return i;
};

/** Returns the offset after the containing line's break, or the end of the text. */
export function lineEndAfter(src: string, pos: number) {
  if (pos > 0 && (src[pos - 1] === '\n' || (src[pos - 1] === '\r' && src[pos] !== '\n'))) return pos;
  for (let i = pos; i < src.length; i++) {
    if (src[i] === '\n') return i + 1;
    if (src[i] === '\r') return src[i + 1] === '\n' ? i + 2 : i + 1;
  }
  return src.length;
}
/** Returns a source position's zero-based column offset. */
export const columnOf = (src: string, pos: number) => pos - lineStart(src, pos);

/** Returns indentation before a position, or null if non-whitespace precedes it. */
export function leadingSpace(src: string, pos: number) {
  const s = src.slice(lineStart(src, pos), pos);
  return /^[ \t]*$/.test(s) ? s : null;
}
/** Describes a source document's line ending, indentation unit and JSON mode. */
export type TextStyle = { eol: string; unit: string; json: boolean };

/** Detects line endings and indentation from the original text. */
export function textStyle(src: string, json: boolean): TextStyle {
  const m = /(?:^|\n)([ \t]+)\S/.exec(src);
  return { eol: dominantLineBreak(src), unit: m ? m[1] : json ? '  ' : '  ', json };
}
/** Converts line endings to the requested source style. */
export const withEol = (text: string, eol: string) => (eol === '\n' ? text : text.replace(/\n/g, eol));
const splitLines = (text: string) => text.split(/(\r\n|\r|\n)/);
// Item fragment: the item's lines without their common indentation. `reindent(dedent(x))===x`
// whenever every line with content starts with the prefix; otherwise nothing is removed.
/** Removes a shared prefix only when every nonempty line has it, allowing exact restoration. */
export function dedent(text: string, prefix: string) {
  const parts = splitLines(text);
  const ok = !prefix || parts.every((p, i) => i % 2 === 1 || !p.trim() || p.startsWith(prefix));
  if (!ok || !prefix) return { text, prefix: '' };
  return {
    text: parts.map((p, i) => (i % 2 === 1 || !p.trim() ? p : p.slice(prefix.length))).join(''),
    prefix,
  };
}
/** Restores a common indentation prefix to fragment lines. */
export const reindent = (text: string, prefix: string) =>
  prefix
    ? splitLines(text)
        .map((p, i) => (i % 2 === 1 || !p.trim() ? p : prefix + p))
        .join('')
    : text;
// Where an item sits in its file: its full lines (from the line start, so a list item's "- " is
// included) up to the end of its last line, without the final line break.
/** Returns an item's full-line span without the final line break. */
export function itemSpan(src: string, from: number, to: number) {
  const start = leadingSpace(src, from) !== null || /^[ \t]*-[ \t]+$/.test(src.slice(lineStart(src, from), from)) ? lineStart(src, from) : from;
  let end = to;
  while (end > start && (src[end - 1] === '\n' || src[end - 1] === '\r')) end--;
  const prefix = start === from ? '' : /^[ \t]*/.exec(src.slice(start, from))![0];
  return { from: start, to: end, prefix };
}
