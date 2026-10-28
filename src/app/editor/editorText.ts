/** Maps normalized editor changes onto the original file text. */
import { Annotation, type ChangeSet, type Transaction } from '@codemirror/state';
import {
  applyPatches,
  changesToPatches,
  dominantLineBreak,
  lineStarts,
} from '../../shared/editor/patch';

// External replacements must not trigger another onChange notification.
export const external = Annotation.define<boolean>();

/** Describes the file's line endings and the style used for newly inserted lines. */
export function lineEndingLabel(text: string) {
  const hasCrLf = /\r\n/.test(text);
  const hasLf = /(^|[^\r])\n/.test(text);
  const hasCr = /\r(?!\n)/.test(text);
  if ([hasCrLf, hasLf, hasCr].filter(Boolean).length > 1) {
    const labels = { '\r\n': 'CRLF', '\n': 'LF', '\r': 'CR' } as const;
    return `Mixed line endings · new lines ${labels[dominantLineBreak(text)]}`;
  }
  if (hasCrLf) return 'CRLF';
  if (hasCr) return 'CR';
  return 'LF';
}

function applyNormalizedChanges(text: string, changes: ChangeSet) {
  const parts: string[] = [];
  let offset = 0;
  changes.iterChanges((from, to, _newFrom, _newTo, inserted) => {
    parts.push(text.slice(offset, from), inserted.toString());
    offset = to;
  });
  parts.push(text.slice(offset));
  return parts.join('');
}

/** Applies transactions as patches, preserving every untouched byte of the file. */
export function applyEditorTransactions(
  originalText: string,
  transactions: readonly Transaction[],
  hasCarriageReturn: boolean,
) {
  let text = originalText;
  for (const transaction of transactions) {
    if (!transaction.docChanged) continue;
    // Without carriage returns, editor offsets already match the original text.
    if (!hasCarriageReturn) {
      text = applyNormalizedChanges(text, transaction.changes);
      continue;
    }
    // Patching original bytes preserves untouched line endings, tabs and the trailing newline.
    const patches = changesToPatches(
      text,
      transaction.startState.doc,
      transaction.changes,
      lineStarts(text),
    );
    text = applyPatches(text, patches);
  }
  return text;
}

/** Replaces only the differing span so external updates preserve surrounding editor positions. */
export function replacementChange(current: string, next: string) {
  let prefixLength = 0;
  while (
    prefixLength < next.length &&
    prefixLength < current.length &&
    next[prefixLength] === current[prefixLength]
  ) {
    prefixLength++;
  }
  let suffixLength = 0;
  while (
    suffixLength < next.length - prefixLength &&
    suffixLength < current.length - prefixLength &&
    next[next.length - 1 - suffixLength] === current[current.length - 1 - suffixLength]
  ) {
    suffixLength++;
  }
  return {
    from: prefixLength,
    to: current.length - suffixLength,
    insert: next.slice(prefixLength, next.length - suffixLength),
  };
}
