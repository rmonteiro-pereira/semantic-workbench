/** Finds SQL expression references while excluding literals, comments, functions and type names. */
// The shared tokenizer excludes literals, comments, functions, keywords and type names. Qualified
// references match whole dataset names, so order.x never matches suborder.
/** Identifies a column reference and its optional dataset qualifier. */
export type ExprRef = { table: string | null; column: string };
type Token = { kind: 'ident' | 'quoted' | 'punct' | 'other'; value: string };
const KEYWORDS = new Set([
  'and',
  'or',
  'not',
  'null',
  'is',
  'in',
  'between',
  'like',
  'ilike',
  'case',
  'when',
  'then',
  'else',
  'end',
  'distinct',
  'as',
  'true',
  'false',
  'interval',
  'cast',
  'from',
  'for',
  'over',
  'partition',
  'by',
  'order',
  'asc',
  'desc',
  'nulls',
  'filter',
  'where',
  'exists',
  'all',
  'any',
  'some',
  'escape',
  'similar',
  'to',
  'within',
  'group',
]);
function tokenize(sql: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
      continue;
    }
    if (c === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      out.push({ kind: 'other', value: 'string' });
      continue;
    }
    if (c === '"' || c === '`') {
      const close = c;
      let v = '';
      i++;
      while (i < sql.length) {
        if (sql[i] === close) {
          if (sql[i + 1] === close) {
            v += close;
            i += 2;
            continue;
          }
          i++;
          break;
        }
        v += sql[i++];
      }
      out.push({ kind: 'quoted', value: v });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let v = '';
      while (i < sql.length && /[\w$]/.test(sql[i])) v += sql[i++];
      out.push({ kind: 'ident', value: v });
      continue;
    }
    if (/[0-9]/.test(c)) {
      while (i < sql.length && /[\w.]/.test(sql[i])) i++;
      out.push({ kind: 'other', value: 'number' });
      continue;
    }
    out.push({ kind: 'punct', value: c });
    i++;
  }
  return out;
}
const isName = (t?: Token) => !!t && (t.kind === 'quoted' || t.kind === 'ident');
/** Extracts SQL column references without treating literals or functions as dependencies. */
export function expressionRefs(sql: string): ExprRef[] {
  if (typeof sql !== 'string') return [];
  const tokens = tokenize(sql);
  const refs: ExprRef[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!isName(t)) continue;
    // A name chain a.b.c: the last part is the column, the rest the (dataset) qualifier.
    const start = i;
    const parts = [t.value];
    let j = i;
    while (
      tokens[j + 1]?.value === '.' &&
      tokens[j + 1].kind === 'punct' &&
      isName(tokens[j + 2])
    ) {
      parts.push(tokens[j + 2].value);
      j += 2;
    }
    const previous = tokens[start - 1];
    const next = tokens[j + 1];
    i = j;
    if (next?.kind === 'punct' && next.value === '(') continue;
    if (parts.length === 1 && t.kind === 'ident' && KEYWORDS.has(t.value.toLowerCase())) continue;
    if (previous?.kind === 'ident' && previous.value.toLowerCase() === 'as') continue;
    if (previous?.value === ':' && tokens[start - 2]?.value === ':') continue;
    // EXTRACT(YEAR FROM x) and typed literals such as DATE '2024-01-01' are not references.
    if (
      parts.length === 1 &&
      ((next?.kind === 'ident' && next.value.toLowerCase() === 'from') ||
        (next?.kind === 'other' && next.value === 'string'))
    )
      continue;
    refs.push({
      table: parts.length > 1 ? parts.slice(0, -1).join('.') : null,
      column: parts.at(-1)!,
    });
  }
  return refs;
}
/** Builds a comparable key for a qualified or unqualified expression reference. */
export const refKey = (r: ExprRef) => `${r.table ?? ''}.${r.column}`;

/** Returns unqualified references that name metrics in the model. */
export function metricDependencies(sql: string, metricNames: Set<string>) {
  return [
    ...new Set(
      expressionRefs(sql)
        .filter(r => r.table === null && metricNames.has(r.column))
        .map(r => r.column),
    ),
  ];
}

/** Returns known datasets read through qualified field references. */
export function datasetReferences(sql: string, datasetNames: Set<string>) {
  return [
    ...new Set(
      expressionRefs(sql)
        .filter(r => r.table !== null && datasetNames.has(r.table))
        .map(r => r.table!),
    ),
  ];
}
/** Reads an ANSI SQL expression from a supported expression definition. */
export function ansiExpression(definition: any): string | undefined {
  const dialects = definition?.expression?.dialects;
  if (!Array.isArray(dialects)) return undefined;
  const chosen = dialects.find((d: any) => d?.dialect === 'ANSI_SQL') ?? dialects[0];
  return typeof chosen?.expression === 'string' ? chosen.expression : undefined;
}
