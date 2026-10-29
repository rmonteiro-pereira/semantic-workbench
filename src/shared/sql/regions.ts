/** Locates embedded SQL and maps decoded characters back to exact file offsets without changing
 * bytes. */
import { parseAllDocuments, isMap, isSeq, isScalar, isPair, type Scalar } from 'yaml';
// SQL regions retain their dialect and a source offset for each decoded character. Undoing
// indentation, folding, quotes and escapes lets parser positions map back to the file. Reading
// regions never changes source bytes.
/** Distinguishes SQL expressions from complete statements. */
export type SqlKind = 'expression' | 'statement';
/** Records embedded SQL, its dialect and decoded-character source offsets. */
export type SqlRegion = {
  pointer: string;
  path: (string | number)[];
  value: string;
  // Offsets[i] is the file offset of value[i]; offsets[value.length] is the end of the scalar.
  offsets: number[];
  start: number;
  end: number;
  dialect: string | null;
  grammar: string | null;
  kind: SqlKind;
  exact: boolean;
};
// Declared dialect → node-sql-parser grammar (null: not checked, an info note instead).
const OSSIE: Record<string, string | null> = {
  ANSI_SQL: 'postgresql',
  OSSIE_SQL_2026: 'postgresql',
  SNOWFLAKE: 'snowflake',
  BIGQUERY: 'bigquery',
  DATABRICKS: 'hive',
  MDX: null,
  DAX: null,
  MAQL: null,
  TABLEAU: null,
  SIGMA: null,
  THOUGHTSPOT: null,
  HOLISTICS_AQL: null,
};
const ODCS: Record<string, string> = {
  postgres: 'postgresql',
  postgresql: 'postgresql',
  snowflake: 'snowflake',
  bigquery: 'bigquery',
  databricks: 'hive',
  mysql: 'mysql',
  sqlserver: 'transactsql',
  trino: 'trino',
  redshift: 'redshift',
  athena: 'athena',
  db2: 'db2',
};
export const GRAMMARS = ['postgresql', 'snowflake', 'bigquery', 'hive', 'mysql', 'transactsql', 'trino', 'redshift', 'athena', 'db2'] as const;
/** Selects the parser grammar for a dialect, or null when it should remain unchecked. */
export function grammarOf(dialect: string | null, odcs = false): string | null {
  if (dialect === null || dialect === '') return 'postgresql';
  if (odcs) return ODCS[dialect.toLowerCase()] ?? 'postgresql';
  const key = dialect.toUpperCase();
  return key in OSSIE ? OSSIE[key] : null;
}
const pointerOf = (path: (string | number)[]) => '/' + path.map(p => String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
const pattern = (path: (string | number)[]) => path.map(p => (typeof p === 'number' ? '*' : p)).join('/');
// Key paths that can contain SQL expressions or statements.
const MODEL = '(?:datasets/\\*/fields/\\*|metrics/\\*)/expression/dialects/\\*/expression';
const OSSIE_MODEL = new RegExp(`^(?:semantic_model(?:/\\*)?/|ontology_mappings/\\*/semantic_model(?:/\\*)?/)?${MODEL}$`);
const OSSIE_MAPPING = /(?:^|\/)concept_mappings\/.*(?:object_mappings|referent_mappings|link_mappings)\/\*\/expression$/;
const PROPS = 'properties/\\*(?:/(?:items/)?properties/\\*)*';
const ODCS_QUERY = new RegExp(`^(?:schema/\\*/(?:${PROPS}/)?)?quality/\\*/query$`);
const ODCS_TRANSFORM = new RegExp(`^schema/\\*/${PROPS}/transformLogic$`);
const isOdcs = (root: any) => !!root && typeof root === 'object' && root.kind === 'DataContract' && typeof root.apiVersion === 'string';
/** Extracts embedded SQL and exact source mappings from a structured definition. */
export function sqlRegions(source: string, filename = ''): SqlRegion[] {
  if (!/\.(ya?ml|json)$/i.test(filename) && filename) return [];
  // Nothing to find without one of the keys that hold SQL (keeps large files cheap).
  if (!/expression|query|transformLogic/.test(source)) return [];
  let docs;
  try {
    docs = parseAllDocuments(source, { keepSourceTokens: false, uniqueKeys: false });
  } catch {
    return [];
  }
  if (!Array.isArray(docs)) return [];
  const out: SqlRegion[] = [];
  for (const doc of docs) {
    if (doc.errors?.length) continue;
    const root = doc.toJS({ maxAliasCount: -1 });
    const odcs = isOdcs(root);
    const server = odcs && Array.isArray(root.servers) ? (root.servers.find((s: any) => s && typeof s.type === 'string')?.type ?? null) : null;
    const visit = (node: any, path: (string | number)[], parent: any) => {
      if (isMap(node)) {
        for (const pair of node.items) if (isPair(pair) && isScalar(pair.key)) visit(pair.value, [...path, String(pair.key.value)], node);
        return;
      }
      if (isSeq(node)) {
        node.items.forEach((item, i) => visit(item, [...path, i], node));
        return;
      }
      if (!isScalar(node) || typeof node.value !== 'string' || !node.range) return;
      const p = pattern(path);
      let kind: SqlKind | null = null;
      let dialect: string | null = null;
      let grammar: string | null = null;
      if (odcs) {
        if (ODCS_QUERY.test(p)) {
          const type = isMap(parent) ? parent.get('type') : undefined;
          if (typeof type === 'string' && type.toLowerCase() === 'sql') kind = 'statement';
        } else if (ODCS_TRANSFORM.test(p)) kind = 'statement';
        if (kind) {
          dialect = server;
          grammar = grammarOf(server, true);
        }
      } else if (OSSIE_MODEL.test(p)) {
        kind = 'expression';
        const d = isMap(parent) ? parent.get('dialect') : undefined;
        dialect = typeof d === 'string' ? d : null;
        grammar = grammarOf(dialect);
      } else if (OSSIE_MAPPING.test(p)) {
        kind = 'expression';
        dialect = null;
        grammar = 'postgresql';
      }
      if (!kind) return;
      const map = offsetMap(source, node as Scalar<string>);
      out.push({
        pointer: pointerOf(path),
        path,
        value: node.value,
        offsets: map.offsets,
        start: node.range[0],
        end: node.range[1],
        dialect,
        grammar,
        kind,
        exact: map.exact,
      });
    };
    visit(doc.contents, [], null);
  }
  return out;
}

type Map_ = { offsets: number[]; exact: boolean };
const ESCAPES: Record<string, string> = {
  '0': '\0',
  a: '\x07',
  b: '\b',
  t: '\t',
  '\t': '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  e: '\x1b',
  ' ': ' ',
  '"': '"',
  '/': '/',
  '\\': '\\',
  N: '\u0085',
  _: '\u00a0',
  L: '\u2028',
  P: '\u2029',
};
// Lines of raw[from,to) with their start offsets.
function lines(src: string, from: number, to: number) {
  const out: { text: string; at: number }[] = [];
  let at = from;
  while (at <= to) {
    let nl = src.indexOf('\n', at);
    if (nl < 0 || nl > to) nl = to;
    let end = nl;
    if (end > at && src[end - 1] === '\r') end--;
    out.push({ text: src.slice(at, end), at });
    if (nl >= to) break;
    at = nl + 1;
  }
  return out;
}
// Continuation lines lose leading whitespace; one break folds to a space and blank lines to
// breaks. An escaped break joins lines. Each decoded character retains its original offset,
// including folded whitespace.
function flow(src: string, from: number, to: number, quote: '"' | "'" | null): { chars: string[]; offsets: number[] } {
  const chars: string[] = [];
  const offsets: number[] = [];
  const ls = lines(src, from, to);
  let empties: number[] = [];
  let breakAt = from;
  let joined = false;
  ls.forEach((line, li) => {
    const last = li === ls.length - 1;
    let text = line.text;
    let base = line.at;
    if (li > 0) {
      const lead = text.length - text.replace(/^[ \t]+/, '').length;
      text = text.slice(lead);
      base += lead;
    }
    const body = last ? text : text.replace(/[ \t]+$/, '');
    if (li > 0) {
      if (!body.length && !last) {
        empties.push(line.at);
        return;
      }
      if (!joined) {
        if (empties.length)
          for (const e of empties) {
            chars.push('\n');
            offsets.push(e);
          }
        else {
          chars.push(' ');
          offsets.push(breakAt);
        }
      }
      empties = [];
      joined = false;
    }
    let i = 0;
    for (; i < body.length; i++) {
      const c = body[i];
      const at = base + i;
      if (quote === "'" && c === "'" && body[i + 1] === "'") {
        chars.push("'");
        offsets.push(at);
        i++;
        continue;
      }
      if (quote === '"' && c === '\\') {
        const n = body[i + 1];
        if (n === undefined) {
          joined = true;
          break;
        }
        if (n === 'x' || n === 'u' || n === 'U') {
          const len = n === 'x' ? 2 : n === 'u' ? 4 : 8;
          for (const ch of String.fromCodePoint(parseInt(body.slice(i + 2, i + 2 + len), 16)).split('')) {
            chars.push(ch);
            offsets.push(at);
          }
          i += 1 + len;
          continue;
        }
        if (n in ESCAPES) {
          chars.push(ESCAPES[n]);
          offsets.push(at);
          i++;
          continue;
        }
      }
      chars.push(c);
      offsets.push(at);
    }
    breakAt = base + body.length;
  });
  return { chars, offsets };
}
// Block indentation is removed according to the header and chomping rules. Literal style keeps
// breaks; folded style joins ordinary adjacent lines with a space. Characters and breaks retain
// their original offsets.
function block(src: string, node: Scalar<string>): { chars: string[]; offsets: number[] } {
  const [start, end] = node.range!;
  const headerEnd = src.indexOf('\n', start);
  if (headerEnd < 0 || headerEnd >= end) return { chars: [], offsets: [] };
  const header = src
    .slice(start, headerEnd)
    .replace(/\s+#.*$/, '')
    .trim();
  const folded = header[0] === '>';
  const indicator = /[1-9]/.exec(header)?.[0];
  const chomp = header.includes('-') ? 'strip' : header.includes('+') ? 'keep' : 'clip';
  let ls = lines(src, headerEnd + 1, end);
  if (ls.length && ls[ls.length - 1].at === end && ls[ls.length - 1].text === '') ls = ls.slice(0, -1);
  let indent: number;
  if (indicator) {
    const lineStart = src.lastIndexOf('\n', start - 1) + 1;
    const keyLine = src.slice(lineStart, start);
    indent = keyLine.length - keyLine.trimStart().length + Number(indicator);
  } else {
    const first = ls.find(l => l.text.trim().length);
    indent = first ? first.text.length - first.text.trimStart().length : 0;
  }
  const breakOf = (l: { text: string; at: number }) => l.at + l.text.length;
  const content = ls.map(l => ({
    text: l.text.trim().length ? l.text.slice(indent) : '',
    at: l.at + indent,
    line: l,
  }));
  let lastContent = content.length - 1;
  while (lastContent >= 0 && !content[lastContent].text.length) lastContent--;
  const chars: string[] = [];
  const offsets: number[] = [];
  let prev = -1;
  let empties: number[] = [];
  for (let i = 0; i <= lastContent; i++) {
    const c = content[i];
    if (!c.text.length) {
      empties.push(i);
      continue;
    }
    const more = /^[ \t]/.test(c.text);
    if (prev < 0)
      for (const e of empties) {
        chars.push('\n');
        offsets.push(breakOf(content[e].line));
      }
    else {
      const prevMore = /^[ \t]/.test(content[prev].text);
      if (folded && !more && !prevMore) {
        if (empties.length)
          for (const e of empties) {
            chars.push('\n');
            offsets.push(breakOf(content[e].line));
          }
        else {
          chars.push(' ');
          offsets.push(breakOf(content[prev].line));
        }
      } else {
        chars.push('\n');
        offsets.push(breakOf(content[prev].line));
        for (const e of empties) {
          chars.push('\n');
          offsets.push(breakOf(content[e].line));
        }
      }
    }
    for (let k = 0; k < c.text.length; k++) {
      chars.push(c.text[k]);
      offsets.push(c.at + k);
    }
    prev = i;
    empties = [];
  }
  if (prev >= 0 && chomp !== 'strip') {
    chars.push('\n');
    offsets.push(breakOf(content[prev].line));
    if (chomp === 'keep')
      for (let i = prev + 1; i < content.length; i++) {
        chars.push('\n');
        offsets.push(breakOf(content[i].line));
      }
  }
  return { chars, offsets };
}
/** Maps decoded scalar characters back to their original source offsets. */
export function offsetMap(src: string, node: Scalar<string>): Map_ {
  const [start, valueEnd] = node.range!;
  const value = node.value;
  let r: { chars: string[]; offsets: number[] };
  try {
    if (node.type === 'BLOCK_LITERAL' || node.type === 'BLOCK_FOLDED') r = block(src, node);
    else if (node.type === 'QUOTE_DOUBLE') r = flow(src, start + 1, valueEnd - 1, '"');
    else if (node.type === 'QUOTE_SINGLE') r = flow(src, start + 1, valueEnd - 1, "'");
    else r = flow(src, start, valueEnd, null);
  } catch {
    r = { chars: [], offsets: [] };
  }
  if (r.chars.join('') === value && r.offsets.length === value.length) return { offsets: [...r.offsets, valueEnd], exact: true };
  // Not reliably mappable: every character goes to the expression's first character.
  const first =
    node.type === 'QUOTE_DOUBLE' || node.type === 'QUOTE_SINGLE'
      ? start + 1
      : node.type?.startsWith('BLOCK')
        ? Math.min(valueEnd, src.indexOf('\n', start) + 1 + (/^[ \t]*/.exec(src.slice(src.indexOf('\n', start) + 1))?.[0].length ?? 0))
        : start;
  return { offsets: Array.from({ length: value.length + 1 }, () => first), exact: false };
}

/** Returns the one-based line and column for a source offset. */
export function lineColumn(src: string, offset: number) {
  let line = 1;
  let last = -1;
  for (let i = 0; i < offset && i < src.length; i++)
    if (src[i] === '\n') {
      line++;
      last = i;
    }
  return { line, column: offset - last };
}
