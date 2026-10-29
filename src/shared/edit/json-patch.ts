/** Patches changed JSON values and separators in place, preserving untouched bytes and local
 * layout. */
import { isMap, isSeq, isScalar, parseDocument, type Node, type Pair } from 'yaml';
import { deepEqual, isObject, leadingSpace, textStyle, withEol, type Patch, type TextStyle } from './source-text';
// Only changed values, keys and list entries are replaced, including their separators. New values
// follow the surrounding inline or multiline layout; unrelated bytes stay exact.
type Range = [number, number, number];
const range = (n: any): Range => n.range;
const keyOf = (p: Pair) => String((p.key as any)?.value);
const multiline = (src: string, n: any) => /[\r\n]/.test(src.slice(range(n)[0], range(n)[1]));
type Layout = {
  sep: string;
  indent: string;
  colon: string;
  comma: string;
  compactValues: boolean | null;
  inner: { colon: string; comma: string };
};
// `:` and `,` spacing as written in one collection (", " and ": " when it cannot tell).
function separators(src: string, node: any) {
  const items: any[] = node.items;
  let comma = ', ';
  let colon = ': ';
  if (items.length > 1) {
    const first = isMap(node) ? (items[0].value ?? items[0].key) : items[0];
    const second = isMap(node) ? items[1].key : items[1];
    const between = src.slice(range(first)[1], range(second)[0]);
    const match = /^\s*,([ \t]*)$/.exec(between);
    if (match) comma = ',' + match[1];
  }
  if (isMap(node) && items[0]?.value) {
    const between = src.slice(range(items[0].key)[1], range(items[0].value)[0]);
    const match = /^[ \t]*:([ \t]*)$/.exec(between);
    if (match) colon = ':' + match[1];
  }
  return { colon, comma };
}
// How a container writes its entries: separator between entries, entry indentation, `:` spacing,
// and whether new nested values are written inline (as the existing nested values are).
function layoutOf(src: string, node: any, style: TextStyle, parentIndent: string): Layout {
  const items: any[] = node.items;
  const first = items[0];
  const firstStart = first ? range(isMap(node) ? first.key : first)[0] : range(node)[0];
  const lines = multiline(src, node);
  const indent = first ? (leadingSpace(src, firstStart) ?? '') : parentIndent + style.unit;
  const own = separators(src, node);
  const nested = items.map(i => (isMap(node) ? i.value : i)).filter(v => isMap(v) || isSeq(v));
  let compactValues: boolean | null;
  if (!lines) {
    compactValues = true;
  } else if (nested.length) {
    compactValues = nested.every(v => !multiline(src, v));
  } else {
    compactValues = null;
  }
  const sample = nested.find(v => v.items.length > 1) ?? nested[0];
  return {
    sep: lines ? style.eol + indent : own.comma.slice(1),
    indent: lines ? indent : '',
    colon: own.colon,
    comma: own.comma,
    compactValues,
    inner: sample ? separators(src, sample) : own,
  };
}
const compact = (value: any, colon: string, comma: string): string => {
  if (Array.isArray(value)) {
    return '[' + value.map(x => compact(x, colon, comma)).join(comma) + ']';
  }
  if (isObject(value)) {
    return (
      '{' +
      Object.entries(value)
        .map(([k, x]) => JSON.stringify(k) + colon + compact(x, colon, comma))
        .join(comma) +
      '}'
    );
  }
  return JSON.stringify(value ?? null);
};

/** Whether to keep a collection on one line, and the separators used between keys and entries when it is. */
export type JsonFormat = { inline?: boolean; colon?: string; comma?: string };

/** Renders a JSON value using the requested indentation and inline layout. */
export function renderJson(value: any, indent: string, style: TextStyle, format: JsonFormat = {}) {
  const { inline = false, colon = ': ', comma = ', ' } = format;
  if (inline || !entryCount(value)) return compact(value, colon, comma);
  return withEol(JSON.stringify(value, null, style.unit).replace(/\n/g, '\n' + indent), style.eol);
}
function entryCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isObject(value)) return Object.keys(value).length;
  return 0;
}
const isCollection = (v: unknown) => Array.isArray(v) || isObject(v);
function valueText(value: any, layout: Layout, style: TextStyle) {
  return renderJson(value, layout.indent, style, { inline: isCollection(value) && layout.compactValues === true, colon: layout.inner.colon, comma: layout.inner.comma });
}

/** Computes structural JSON patches while preserving unchanged bytes. */
export function jsonPatches(src: string, node: any, oldV: any, newV: any, style: TextStyle, indent = ''): Patch[] {
  if (deepEqual(oldV, newV)) return [];
  if (isMap(node) && isObject(oldV) && isObject(newV) && node.items.length) return mapPatches(src, node, oldV, newV, style, indent);
  if (isSeq(node) && Array.isArray(oldV) && Array.isArray(newV) && node.items.length) return seqPatches(src, node, oldV, newV, style, indent);
  const [from, to] = range(node);
  const own = leadingSpace(src, from) ?? indent;
  return [
    {
      from,
      to,
      insert: renderJson(newV, own, style, { inline: !multiline(src, node) && isCollection(oldV) && isCollection(newV) }),
    },
  ];
}
function mapPatches(src: string, node: any, oldV: Record<string, any>, newV: Record<string, any>, style: TextStyle, indent: string): Patch[] {
  const pairs: Pair[] = node.items;
  const layout = layoutOf(src, node, style, indent);
  const out: Patch[] = [];
  const kept = pairs.map(p => Object.hasOwn(newV, keyOf(p)));
  if (!kept.some(Boolean))
    return [
      {
        from: range(node)[0],
        to: range(node)[1],
        insert: renderJson(newV, leadingSpace(src, range(node)[0]) ?? indent, style, { inline: !layout.sep.includes('\n') }),
      },
    ];
  out.push(
    ...removeRuns(
      src,
      pairs.map(p => [range(p.key)[0], range(p.value ?? p.key)[1]] as [number, number]),
      kept,
    ),
  );
  pairs.forEach((p, i) => {
    if (kept[i] && p.value) out.push(...jsonPatches(src, p.value, oldV[keyOf(p)], newV[keyOf(p)], style, layout.indent));
  });
  const added = Object.keys(newV).filter(k => !pairs.some(p => keyOf(p) === k));
  if (added.length) {
    const last = pairs[kept.lastIndexOf(true)];
    const at = range(last.value ?? last.key)[1];
    out.push({
      from: at,
      to: at,
      insert: added.map(k => ',' + layout.sep + JSON.stringify(k) + layout.colon + valueText(newV[k], layout, style)).join(''),
    });
  }
  return out;
}
// Removed entries, as runs: a run before a kept entry goes up to that entry; a run at the end
// starts after the previous kept entry (taking its comma).
function removeRuns(src: string, spans: [number, number][], kept: boolean[]): Patch[] {
  const out: Patch[] = [];
  let i = 0;
  while (i < spans.length) {
    if (kept[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < spans.length && !kept[j + 1]) j++;
    if (j + 1 < spans.length) out.push({ from: spans[i][0], to: spans[j + 1][0], insert: '' });
    else out.push({ from: spans[i - 1][1], to: spans[j][1], insert: '' });
    i = j + 1;
  }
  return out;
}
function seqPatches(src: string, node: any, oldV: any[], newV: any[], style: TextStyle, indent: string): Patch[] {
  const items: any[] = node.items;
  const layout = layoutOf(src, node, style, indent);
  let prefixLength = 0;
  while (prefixLength < oldV.length && prefixLength < newV.length && deepEqual(oldV[prefixLength], newV[prefixLength])) prefixLength++;
  let suffixLength = 0;
  while (suffixLength < oldV.length - prefixLength && suffixLength < newV.length - prefixLength && deepEqual(oldV[oldV.length - 1 - suffixLength], newV[newV.length - 1 - suffixLength]))
    suffixLength++;
  const removed = oldV.length - prefixLength - suffixLength;
  const added = newV.slice(prefixLength, newV.length - suffixLength);
  if (removed === added.length) return items.slice(prefixLength, prefixLength + removed).flatMap((n, i) => jsonPatches(src, n, oldV[prefixLength + i], added[i], style, layout.indent));
  if (removed === oldV.length)
    return [
      {
        from: range(node)[0],
        to: range(node)[1],
        insert: renderJson(newV, leadingSpace(src, range(node)[0]) ?? indent, style, { inline: !layout.sep.includes('\n') }),
      },
    ];
  const kept = items.map((_, i) => i < prefixLength || i >= prefixLength + removed);
  const out = removeRuns(
    src,
    items.map(n => [range(n)[0], range(n)[1]] as [number, number]),
    kept,
  );
  if (added.length) {
    const text = added.map(v => valueText(v, layout, style));
    // Before the next kept entry, or after the last one.
    if (suffixLength > 0) {
      const at = range(items[prefixLength + removed])[0];
      out.push({ from: at, to: at, insert: text.map(t => t + ',' + layout.sep).join('') });
    } else {
      const at = range(items[prefixLength - 1])[1];
      out.push({ from: at, to: at, insert: text.map(t => ',' + layout.sep + t).join('') });
    }
  }
  return out;
}

/** Removes an array entry together with its separator. */
export const jsonRemove = (src: string, node: any, index: number) =>
  removeRuns(
    src,
    node.items.map((n: any) => [range(n)[0], range(n)[1]] as [number, number]),
    node.items.map((_: any, i: number) => i !== index),
  );
const sorted = (patches: Patch[]) => patches.sort((a, b) => a.from - b.from || a.to - a.from - (b.to - b.from));

/** Patches a JSON path, removing the value when it is undefined. */
export function jsonTextPatches(text: string, path: (string | number)[], value: any): Patch[] {
  const doc = parseDocument(text);
  if (doc.errors.length) throw Error(`Not valid JSON: ${doc.errors[0].message}`);
  const style = textStyle(text, true);
  if (!path.length) return sorted(jsonPatches(text, doc.contents, doc.toJS(), value, style));
  const parentPath = path.slice(0, -1);
  const parent: any = parentPath.length ? doc.getIn(parentPath, true) : doc.contents;
  const key = path[path.length - 1];
  if (!parent || !(isMap(parent) || isSeq(parent))) throw Error(`No JSON object or array at /${parentPath.join('/')}.`);
  const old: any = parentPath.reduce((v: any, k) => v?.[k], doc.toJS());
  let next: any;
  if (Array.isArray(old)) {
    next = [...old];
    if (value === undefined) next.splice(Number(key), 1);
    else next[Number(key)] = value;
  } else {
    next = { ...old };
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return sorted(jsonPatches(text, parent, old, next, style, leadingSpace(text, (parent as any).range[0]) ?? ''));
}
/** Exports patch ordering for callers that combine JSON edits. */
export { sorted as sortPatches };
/** Checks whether a parsed syntax node is a scalar. */
export const isJsonScalar = (n: unknown): n is Node => isScalar(n);
