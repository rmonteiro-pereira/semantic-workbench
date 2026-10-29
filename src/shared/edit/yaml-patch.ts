/** Patches YAML values in place while preserving untouched comments, anchors, quoting and
 * layout. */
import { Document, isMap, isPair, isScalar, isSeq, parseDocument, stringify, visit } from 'yaml';
import { applyPatches } from '../editor/patch';
import { jsonPatches, jsonRemove, jsonTextPatches, sortPatches } from './json-patch';
import { columnOf, deepEqual, isObject, leadingSpace, lineEndAfter, lineStart, textStyle, withEol, type Patch, type TextStyle } from './source-text';
// New entries follow sibling indentation and flow or block style. JSON documents and JSON inside
// extension blocks use the JSON patcher, preserving unchanged lines when a single metric attribute
// changes.
type Ctx = TextStyle & { src: string; indentSeq: boolean; flowKeys: Set<string>; flowPad: boolean };
const range = (n: any): [number, number, number] => n.range;
const isCollection = (v: unknown) => Array.isArray(v) || isObject(v);
const kindOf = (value: unknown) => {
  if (Array.isArray(value)) {
    return 'seq';
  }
  if (isObject(value)) {
    return 'map';
  }
  return 'scalar';
};
// `key: []` in a block document: filled, it becomes a block list (the pair is rewritten).
const emptyFlow = (n: any) => (isSeq(n) || isMap(n)) && (n as any).flow && !n.items.length;
// A block collection emptied: written as `key: []` on the key's line.
const emptied = (v: unknown) => (Array.isArray(v) ? !v.length : isObject(v) && !Object.keys(v).length);
let cache: { src: string; doc: Document.Parsed } | null = null;
/** Parses source while retaining tokens needed for byte-preserving patches. */
export function parseSource(src: string) {
  if (cache?.src === src) return cache.doc;
  const doc = parseDocument(src, { uniqueKeys: false });
  if (doc.errors.length) throw Error(`The file does not parse: ${doc.errors[0].message}`);
  cache = { src, doc };
  return doc;
}
/** Identifies JSON source by filename or leading syntax. */
export const isJsonSource = (src: string, filename = '') => /\.json$/i.test(filename) || /^\s*[{[]/.test(src);
function context(src: string, doc: Document.Parsed, json: boolean): Ctx {
  // Block lists written at their key's indentation ("key:\n- a") or indented under it.
  const indentSeq = !/(?:^|\n)([ ]*)[^\s#-][^\n]*:[ \t]*\r?\n\1- /.test(src);
  const flowKeys = new Set<string>();
  let flowPad = false;
  if (!json)
    visit(doc, {
      Pair(_, pair) {
        const value: any = pair.value;
        if ((isSeq(value) || isMap(value)) && value.flow && value.items.length && isScalar(pair.key)) {
          flowKeys.add(String(pair.key.value));
          if (/^[[{] /.test(src.slice(range(value)[0], range(value)[1]))) flowPad = true;
        }
      },
    });
  return { ...textStyle(src, json), src, indentSeq, flowKeys, flowPad };
}
function nodeAt(doc: Document.Parsed, path: (string | number)[]) {
  const node: any = path.length ? doc.getIn(path, true) : doc.contents;
  if (!node) throw Error(`Nothing at /${path.join('/')}.`);
  return node;
}

function blockText(value: any, ctx: Ctx) {
  const blockDoc = new Document(value);
  visit(blockDoc, {
    Pair(_, pair) {
      if (isScalar(pair.key) && ctx.flowKeys.has(String(pair.key.value)) && (isSeq(pair.value) || isMap(pair.value))) (pair.value as any).flow = true;
    },
  });
  return blockDoc
    .toString({
      indent: ctx.unit.length || 2,
      indentSeq: ctx.indentSeq,
      lineWidth: 0,
      minContentWidth: 0,
      flowCollectionPadding: ctx.flowPad,
    })
    .replace(/\n$/, '');
}
const prefixLines = (text: string, first: string, rest: string) =>
  text
    .split('\n')
    .map((l, i) => (l ? (i ? rest : first) + l : l))
    .join('\n');
/** Indentation for block scalar content, and the text after the value on its line (a comment keeps it from becoming a block). */
type ScalarSurroundings = { contentIndent: string; after: string };
// A scalar in the style it had: quoted stays quoted, a block literal stays a block literal.
function scalarText(value: any, old: any, ctx: Ctx, surroundings: ScalarSurroundings) {
  const { contentIndent, after } = surroundings;
  if (typeof value !== 'string') return value === null || value === undefined ? 'null' : String(value);
  const type = old?.type;
  const hasComment = /\S/.test(after);
  if (type === 'BLOCK_LITERAL' || type === 'BLOCK_FOLDED' || (value.includes('\n') && !hasComment)) {
    const body = value.endsWith('\n') ? value.slice(0, -1) : value;
    let chomp;
    if (value.endsWith('\n')) {
      if (value.endsWith('\n\n')) {
        chomp = '+';
      } else {
        chomp = '';
      }
    } else {
      chomp = '-';
    }
    return (
      '|' +
      chomp +
      '\n' +
      body
        .split('\n')
        .map(l => (l ? contentIndent + l : ''))
        .join('\n') +
      (type?.startsWith('BLOCK') ? '\n' : '')
    );
  }
  if (type === 'QUOTE_DOUBLE') return JSON.stringify(value);
  if (type === 'QUOTE_SINGLE' && !value.includes('\n')) return `'${value.replace(/'/g, "''")}'`;
  return stringify(value, { lineWidth: 0 }).replace(/\n$/, '');
}
function flowText(value: any, old: any, ctx: Ctx): string {
  const text = old ? ctx.src.slice(range(old)[0], range(old)[1]) : '';
  const pad = /^[[{] /.test(text) ? ' ' : '';
  const item = (x: any): string => (isCollection(x) ? flowText(x, null, ctx) : scalarText(x, null, ctx, { contentIndent: '', after: '' }).replace(/^\|.*$/s, JSON.stringify(x)));
  if (Array.isArray(value)) return value.length ? `[${pad}${value.map(item).join(', ')}${pad}]` : '[]';
  const entries = Object.entries(value ?? {});
  return entries.length ? `{${pad}${entries.map(([k, x]) => `${item(k)}: ${item(x)}`).join(', ')}${pad}}` : '{}';
}

function diff(ctx: Ctx, node: any, oldV: any, newV: any, keyIndent: string): Patch[] {
  if (deepEqual(oldV, newV)) return [];
  if (ctx.json) return jsonPatches(ctx.src, node, oldV, newV, ctx, keyIndent);
  if ((isMap(node) || isSeq(node)) && (node as any).flow) return [{ from: range(node)[0], to: range(node)[1], insert: flowText(newV, node, ctx) }];
  if (isMap(node) && isObject(oldV) && isObject(newV) && node.items.length) return mapDiff(ctx, node, oldV, newV);
  if (isSeq(node) && Array.isArray(oldV) && Array.isArray(newV) && node.items.length) return seqDiff(ctx, node, oldV, newV);
  if (isScalar(node) && String((node as any).type).startsWith('BLOCK') && typeof oldV === 'string' && typeof newV === 'string') {
    const inner = blockJsonPatches(ctx, node, oldV, newV);
    if (inner) return inner;
  }
  if (isScalar(node) && !isCollection(newV)) return [scalarPatch(ctx, node, newV, keyIndent)];
  // A block collection replaced by another value: written from the node's column.
  const [from, to] = range(node);
  const col = ' '.repeat(columnOf(ctx.src, from));
  if (isCollection(newV) && (Array.isArray(newV) ? newV.length : Object.keys(newV).length) && !isScalar(node))
    return [
      {
        from,
        to,
        insert: withEol(prefixLines(blockText(newV, ctx), '', col), ctx.eol) + (/[\r\n]$/.test(ctx.src.slice(from, to)) ? ctx.eol : ''),
      },
    ];
  return [
    {
      from,
      to,
      insert: flowText(newV, null, ctx) + (/[\r\n]$/.test(ctx.src.slice(from, to)) ? ctx.eol : ''),
    },
  ];
}
function scalarPatch(ctx: Ctx, node: any, value: any, keyIndent: string): Patch {
  const [from, to] = range(node);
  const after = ctx.src.slice(to, lineEndAfter(ctx.src, to));
  // Content of an existing block scalar keeps its indentation.
  const own = node.type?.startsWith('BLOCK') ? /\n([ \t]+)\S/.exec(ctx.src.slice(from, to))?.[1] : undefined;
  let text = withEol(scalarText(value, node, ctx, { contentIndent: own ?? keyIndent + ctx.unit, after }), ctx.eol);
  // `key:` with no value: the new value needs a space after the colon.
  if (from === to && ctx.src[from - 1] === ':') text = ' ' + text;
  return { from, to, insert: text };
}
// Where a pair's text ends: after the line break that ends its value.
const pairEnd = (ctx: Ctx, pair: any) =>
  lineEndAfter(ctx.src, range(pair.value ?? pair.key)[1] > range(pair.key)[1] ? Math.max(range(pair.key)[1], range(pair.value ?? pair.key)[1]) : range(pair.key)[1]);
const pairText = (ctx: Ctx, key: string, v: any, keyIndent: string) => prefixLines(blockText({ [key]: v }, ctx), keyIndent, keyIndent);
function mapDiff(ctx: Ctx, node: any, oldV: Record<string, any>, newV: Record<string, any>): Patch[] {
  const pairs: any[] = node.items;
  const out: Patch[] = [];
  const key = (p: any) => String(p.key?.value);
  const first = pairs[0];
  const firstOnDash = leadingSpace(ctx.src, range(first.key)[0]) === null;
  const keyIndent = firstOnDash ? ' '.repeat(columnOf(ctx.src, range(first.key)[0])) : leadingSpace(ctx.src, range(first.key)[0])!;
  const kept = pairs.map(p => Object.hasOwn(newV, key(p)));
  if (!kept.some(Boolean)) {
    const from = range(node)[0];
    const to = range(node)[1];
    return [
      {
        from,
        to,
        insert: withEol(prefixLines(blockText(newV, ctx), '', keyIndent), ctx.eol) + (/[\r\n]$/.test(ctx.src.slice(from, to)) ? ctx.eol : ''),
      },
    ];
  }
  let i = 0;
  // The first key shares its line with "- ": removing it pulls the next kept key onto that line.
  if (firstOnDash && !kept[0]) {
    let index = 0;
    while (!kept[index]) index++;
    out.push({ from: range(first.key)[0], to: range(pairs[index].key)[0], insert: '' });
    i = index;
  }
  for (; i < pairs.length; i++) {
    const pair = pairs[i];
    const pairKey = key(pair);
    if (!kept[i]) {
      out.push({
        from: lineStart(ctx.src, range(pair.key)[0]),
        to: pairEnd(ctx, pair),
        insert: '',
      });
      continue;
    }
    const oldChild = oldV[pairKey];
    const newChild = newV[pairKey];
    if (deepEqual(oldChild, newChild)) continue;
    if (pair.value && kindOf(oldChild) === kindOf(newChild) && !(isScalar(pair.value) && isCollection(newChild)) && !emptyFlow(pair.value) && !emptied(newChild))
      out.push(...diff(ctx, pair.value, oldChild, newChild, keyIndent));
    else {
      const onDash = i === 0 && firstOnDash;
      const from = onDash ? range(pair.key)[0] : lineStart(ctx.src, range(pair.key)[0]);
      out.push({
        from,
        to: pairEnd(ctx, pair),
        insert: withEol(prefixLines(blockText({ [pairKey]: newChild }, ctx), onDash ? '' : keyIndent, keyIndent) + '\n', ctx.eol),
      });
    }
  }
  const added = Object.keys(newV).filter(k => !pairs.some(p => key(p) === k));
  if (added.length) {
    const at = pairEnd(ctx, pairs[pairs.length - 1]);
    const needsBreak = at === ctx.src.length && !/[\r\n]$/.test(ctx.src);
    out.push({
      from: at,
      to: at,
      insert: (needsBreak ? ctx.eol : '') + withEol(added.map(k => pairText(ctx, k, newV[k], keyIndent)).join('\n') + (needsBreak ? '' : '\n'), ctx.eol),
    });
  }
  return out;
}
function seqDiff(ctx: Ctx, node: any, oldV: any[], newV: any[]): Patch[] {
  const items: any[] = node.items;
  const dash = lineStart(ctx.src, range(items[0])[0]);
  const dashIndent = /^[ \t]*/.exec(ctx.src.slice(dash))![0];
  const itemIndent = dashIndent + '  ';
  let prefixLength = 0;
  while (prefixLength < oldV.length && prefixLength < newV.length && deepEqual(oldV[prefixLength], newV[prefixLength])) prefixLength++;
  let suffixLength = 0;
  while (suffixLength < oldV.length - prefixLength && suffixLength < newV.length - prefixLength && deepEqual(oldV[oldV.length - 1 - suffixLength], newV[newV.length - 1 - suffixLength]))
    suffixLength++;
  const removed = oldV.length - prefixLength - suffixLength;
  const added = newV.slice(prefixLength, newV.length - suffixLength);
  const out: Patch[] = [];
  const entry = (value: any) =>
    withEol(
      isCollection(value)
        ? prefixLines(blockText(value, ctx), dashIndent + '- ', itemIndent).replace(new RegExp(`^${dashIndent}- `), dashIndent + '- ')
        : dashIndent + '- ' + scalarText(value, null, ctx, { contentIndent: itemIndent, after: '' }),
      ctx.eol,
    );
  const itemEnd = (n: any) => lineEndAfter(ctx.src, range(n)[1]);
  if (removed === added.length) {
    items.slice(prefixLength, prefixLength + removed).forEach((item, i) => {
      const oldChild = oldV[prefixLength + i];
      const newChild = added[i];
      if (kindOf(oldChild) === kindOf(newChild) && !(isScalar(item) && isCollection(newChild))) out.push(...diff(ctx, item, oldChild, newChild, itemIndent));
      else
        out.push({
          from: lineStart(ctx.src, range(item)[0]),
          to: itemEnd(item),
          insert: entry(newChild) + ctx.eol,
        });
    });
    return out;
  }
  for (let i = prefixLength; i < prefixLength + removed; i++) out.push({ from: lineStart(ctx.src, range(items[i])[0]), to: itemEnd(items[i]), insert: '' });
  if (added.length) {
    if (suffixLength > 0) {
      const at = lineStart(ctx.src, range(items[prefixLength + removed])[0]);
      out.push({ from: at, to: at, insert: added.map(v => entry(v) + ctx.eol).join('') });
    } else {
      const at = itemEnd(items[items.length - 1]);
      const needsBreak = at === ctx.src.length && !/[\r\n]$/.test(ctx.src);
      out.push({
        from: at,
        to: at,
        insert: (needsBreak ? ctx.eol : '') + added.map(v => entry(v)).join(ctx.eol) + (needsBreak ? '' : ctx.eol),
      });
    }
  }
  return out;
}
// The JSON text of a block scalar, with each line's indentation; patches inside it map back to the
// file.
function blockJsonPatches(ctx: Ctx, node: any, oldV: string, newV: string): Patch[] | null {
  let oldJson: any;
  let newJson: any;
  try {
    oldJson = JSON.parse(oldV);
    newJson = JSON.parse(newV);
  } catch {
    return null;
  }
  if (!isObject(oldJson) || !isObject(newJson)) return null;
  const [from, to] = range(node);
  const raw = ctx.src.slice(from, to);
  const body = raw.indexOf('\n') + 1;
  if (!body) return null;
  const indent = /^[ \t]*/.exec(raw.slice(body))![0];
  const lines = raw.slice(body).split('\n');
  if (!indent || lines.some(l => l.replace(/\r$/, '').trim() && !l.startsWith(indent))) return null;
  const text = lines.map(l => (l.startsWith(indent) ? l.slice(indent.length) : l)).join('\n');
  if (text.replace(/\r\n/g, '\n').replace(/\n+$/, '') !== oldV.replace(/\n+$/, '')) return null;
  const starts: number[] = [];
  let at = from + body;
  for (const line of lines) {
    starts.push(at);
    at += line.length + 1;
  }
  const map = (off: number) => {
    let line = 0;
    let acc = 0;
    while (line < lines.length - 1 && acc + lines[line].length - (lines[line].startsWith(indent) ? indent.length : 0) + 1 <= off) {
      acc += lines[line].length - (lines[line].startsWith(indent) ? indent.length : 0) + 1;
      line++;
    }
    return starts[line] + (lines[line].startsWith(indent) ? indent.length : 0) + (off - acc);
  };
  return jsonTextPatches(text, [], newJson).map(patch => ({
    from: map(patch.from),
    to: map(patch.to),
    insert: patch.insert.replace(/\r?\n/g, '\n' + indent).replace(/\n/g, ctx.eol === '\n' ? '\n' : ctx.eol),
  }));
}

/** Patches the value at a document path while preserving unchanged source bytes. */
export function valuePatches(src: string, path: (string | number)[], value: any, filename = ''): Patch[] {
  const doc = parseSource(src);
  const json = isJsonSource(src, filename);
  const ctx = context(src, doc, json);
  if (!path.length) return sortPatches(diff(ctx, doc.contents, doc.toJS(), value, ''));
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(doc, parentPath);
  const key = path[path.length - 1];
  const old = doc.getIn(path, false);
  const node: any = doc.getIn(path, true);
  // Extension JSON in a block scalar: patched as JSON.
  if (!json && isScalar(node) && String(node.type).startsWith('BLOCK') && typeof old === 'string' && typeof value === 'string') {
    const inner = blockJsonPatches(ctx, node, old, value);
    if (inner) return sortPatches(inner);
  }
  const parentValue = toJs(doc, parentPath);
  // Removing one list entry: exactly that entry, even when a neighbour has the same content.
  if (value === undefined && isSeq(parent) && Array.isArray(parentValue)) {
    const i = Number(key);
    const items: any[] = parent.items;
    if (items.length === 1 || (!json && (parent as any).flow))
      return valuePatches(
        src,
        parentPath,
        parentValue.filter((_, j) => j !== i),
        filename,
      );
    if (json) return jsonRemove(src, parent, i);
    return [
      {
        from: lineStart(src, range(items[i])[0]),
        to: lineEndAfter(src, range(items[i])[1]),
        insert: '',
      },
    ];
  }
  let next: any;
  if (Array.isArray(parentValue)) {
    next = [...parentValue];
    if (value === undefined) next.splice(Number(key), 1);
    else next[Number(key)] = value;
  } else {
    next = { ...parentValue };
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  // A changed value inside a parent: diff the parent so the key itself, its comment and position
  // stay.
  if (value !== undefined && node && kindOf(old) === kindOf(value) && !(!json && (emptyFlow(node) || emptied(value)))) {
    const indent = isMap(parent) && parent.items.length ? (leadingSpace(src, range((parent.items[0] as any).key)[0]) ?? ' '.repeat(columnOf(src, range((parent.items[0] as any).key)[0]))) : '';
    if (isScalar(node) && !json) return [scalarPatch(ctx, node, value, indent)];
    return sortPatches(diff(ctx, node, old === undefined ? null : toJs(doc, path), value, indent));
  }
  return sortPatches(diff(ctx, parent, parentValue, next, ''));
}
function toJs(doc: Document.Parsed, path: (string | number)[]) {
  const node: any = path.length ? doc.getIn(path, true) : doc.contents;
  return node && typeof node.toJS === 'function' ? node.toJS(doc) : (node?.value ?? node);
}
/** Reads a parsed value at a source document path. */
export const itemValue = (src: string, path: (string | number)[]) => toJs(parseSource(src), path);
// Insert `value` into the list at `listPath` (at `index`, default the end) in the document's
// style.
/** Inserts a list item in the document's layout, appending when no index is supplied. */
export function insertPatches(src: string, listPath: (string | number)[], value: any, index?: number, filename = ''): Patch[] {
  const list = itemValue(src, listPath);
  if (!Array.isArray(list)) throw Error(`/${listPath.join('/')} is not a list.`);
  const next = [...list];
  next.splice(index ?? list.length, 0, value);
  return valuePatches(src, listPath, next, filename);
}
/** Removes the item at a document path without removing equal-valued neighbors. */
export const removePatches = (src: string, path: (string | number)[], filename = '') => valuePatches(src, path, undefined, filename);

/** Applies patch-producing steps sequentially against each preceding result. */
export function edit(src: string, ...steps: ((text: string) => Patch[])[]) {
  return steps.reduce((text, step) => applyPatches(text, step(text)), src);
}
/** Exports the YAML pair guard used by source patchers. */
export { isPair };
