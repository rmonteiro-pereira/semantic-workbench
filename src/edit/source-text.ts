import { dominantLineBreak, type Patch } from '../editor/patch';
// Text helpers shared by the YAML and JSON item patchers (FR-053, FR-054): line positions, the
// document's own indentation and line-break style, and the dedented item fragment the item editor
// shows, whose edits are put back with the original indentation byte for byte.
export type { Patch };
export const isObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const ka = Object.keys(a),
      kb = Object.keys(b);
    return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}
export const lineStart = (src: string, pos: number) => {
  let i = pos;
  while (i > 0 && src[i - 1] !== '\n' && src[i - 1] !== '\r') i--;
  return i;
};
// The offset just after the line break that ends the line containing `pos` (or the text end).
export function lineEndAfter(src: string, pos: number) {
  if (pos > 0 && (src[pos - 1] === '\n' || (src[pos - 1] === '\r' && src[pos] !== '\n')))
    return pos;
  for (let i = pos; i < src.length; i++) {
    if (src[i] === '\n') return i + 1;
    if (src[i] === '\r') return src[i + 1] === '\n' ? i + 2 : i + 1;
  }
  return src.length;
}
export const columnOf = (src: string, pos: number) => pos - lineStart(src, pos);
// The whitespace before `pos` on its line when only whitespace precedes it, else null.
export function leadingSpace(src: string, pos: number) {
  const s = src.slice(lineStart(src, pos), pos);
  return /^[ \t]*$/.test(s) ? s : null;
}
export type TextStyle = { eol: string; unit: string; json: boolean };
// The document's indentation step: the leading whitespace of its first indented line.
export function textStyle(src: string, json: boolean): TextStyle {
  const m = /(?:^|\n)([ \t]+)\S/.exec(src);
  return { eol: dominantLineBreak(src), unit: m ? m[1] : json ? '  ' : '  ', json };
}
export const withEol = (text: string, eol: string) =>
  eol === '\n' ? text : text.replace(/\n/g, eol);
const splitLines = (text: string) => text.split(/(\r\n|\r|\n)/);
// Item fragment: the item's lines without their common indentation. `reindent(dedent(x))===x`
// whenever every line with content starts with the prefix; otherwise nothing is removed.
export function dedent(text: string, prefix: string) {
  const parts = splitLines(text);
  const ok = !prefix || parts.every((p, i) => i % 2 === 1 || !p.trim() || p.startsWith(prefix));
  if (!ok || !prefix) return { text, prefix: '' };
  return {
    text: parts.map((p, i) => (i % 2 === 1 || !p.trim() ? p : p.slice(prefix.length))).join(''),
    prefix,
  };
}
export const reindent = (text: string, prefix: string) =>
  prefix
    ? splitLines(text)
        .map((p, i) => (i % 2 === 1 || !p.trim() ? p : prefix + p))
        .join('')
    : text;
// Where an item sits in its file: its full lines (from the line start, so a list item's "- " is
// included) up to the end of its last line, without the final line break.
export function itemSpan(src: string, from: number, to: number) {
  const start =
    leadingSpace(src, from) !== null ||
    /^[ \t]*-[ \t]+$/.test(src.slice(lineStart(src, from), from))
      ? lineStart(src, from)
      : from;
  let end = to;
  while (end > start && (src[end - 1] === '\n' || src[end - 1] === '\r')) end--;
  const prefix = start === from ? '' : /^[ \t]*/.exec(src.slice(start, from))![0];
  return { from: start, to: end, prefix };
}
