/** Maps editor changes to original file offsets so untouched bytes remain exact. */
import type { ChangeSet, Text } from '@codemirror/state';
// CodeMirror normalizes line endings, so edits map back to the original file offsets. Untouched
// line endings, tabs and the trailing newline stay exact. New line breaks use the file’s dominant
// style.
/** Replaces an original source range with supplied text. */
export type Patch = { from: number; to: number; insert: string };
// Start offset of every line in the original text; a line break is \r\n, \n or a lone \r (as in
// CodeMirror's own line splitting).
/** Returns line-start offsets recognizing CRLF, LF and lone CR breaks. */
export function lineStarts(text: string) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) i++;
      starts.push(i + 1);
    } else if (c === 10) starts.push(i + 1);
  }
  return starts;
}
/** Chooses the original file's most common line-ending sequence. */
export function dominantLineBreak(text: string): '\r\n' | '\n' | '\r' {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        crlf++;
        i++;
      } else cr++;
    } else if (c === 10) lf++;
  }
  return crlf > lf && crlf >= cr ? '\r\n' : cr > lf && cr > crlf ? '\r' : '\n';
}

/** Converts source line endings to the editor's LF representation. */
export const normalize = (text: string) => text.replace(/\r\n?/g, '\n');

/** Maps a normalized editor position back to its original source offset. */
export function originalOffset(doc: Text, starts: number[], pos: number) {
  const line = doc.lineAt(pos);
  return starts[line.number - 1] + (pos - line.from);
}
/** Maps editor changes to original bytes and uses the file's line endings for inserts. */
export function changesToPatches(
  original: string,
  doc: Text,
  changes: ChangeSet,
  starts = lineStarts(original),
): Patch[] {
  const eol = dominantLineBreak(original);
  const patches: Patch[] = [];
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    patches.push({
      from: originalOffset(doc, starts, fromA),
      to: originalOffset(doc, starts, toA),
      insert: inserted.toString().replace(/\n/g, eol),
    });
  });
  return patches;
}
/** Applies source replacements while preserving every untouched byte. */
export function applyPatches(text: string, patches: Patch[]) {
  let out = '';
  let at = 0;
  for (const p of [...patches].sort((a, b) => a.from - b.from)) {
    if (p.from < at || p.to < p.from || p.to > text.length)
      throw Error('Patches must be ordered, non-overlapping and inside the text.');
    out += text.slice(at, p.from) + p.insert;
    at = p.to;
  }
  return out + text.slice(at);
}

/** Returns the smallest single replacement without splitting CRLF or surrogate pairs. */
export function diffPatches(base: string, next: string): Patch[] {
  if (base === next) return [];
  let start = 0;
  const max = Math.min(base.length, next.length);
  while (start < max && base.charCodeAt(start) === next.charCodeAt(start)) start++;
  let end = 0;
  while (
    end < max - start &&
    base.charCodeAt(base.length - 1 - end) === next.charCodeAt(next.length - 1 - end)
  )
    end++;
  // Never split a \r\n pair or a surrogate pair between the kept and replaced parts.
  const splits = (s: string, i: number) =>
    i > 0 &&
    i < s.length &&
    ((s.charCodeAt(i - 1) === 13 && s.charCodeAt(i) === 10) ||
      (s.charCodeAt(i - 1) >= 0xd800 && s.charCodeAt(i - 1) <= 0xdbff));
  while (start > 0 && (splits(base, start) || splits(next, start))) start--;
  while (end > 0 && (splits(base, base.length - end) || splits(next, next.length - end))) end--;
  return [{ from: start, to: base.length - end, insert: next.slice(start, next.length - end) }];
}
