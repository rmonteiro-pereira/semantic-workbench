/** Shares embedded-language detection between full and viewport YAML parsing. */
import type { SyntaxNode } from '@lezer/common';
// Known SQL key paths use SQL highlighting unless their sibling dialect names a non-SQL language.
// Highlighting uses the incremental syntax tree; lint positions use the exact YAML syntax tree.
const NOT_SQL = new Set(['MDX', 'DAX', 'MAQL', 'TABLEAU', 'SIGMA', 'THOUGHTSPOT', 'HOLISTICS_AQL']);
const MAPPINGS = new Set(['object_mappings', 'referent_mappings', 'link_mappings']);
type Read = (from: number, to: number) => string;
const unquote = (value: string) => value.trim().replace(/^(['"])(.*)\1$/s, '$2');
/** Identifies embedded SQL paths while excluding declared non-SQL dialects. */
export function sqlKeyPath(keys: string[], sibling: (key: string) => string | undefined) {
  const length = keys.length;
  const last = keys[length - 1];
  if (last === 'expression' && keys[length - 2] === 'dialects' && keys[length - 3] === 'expression' && (keys[length - 4] === 'fields' || keys[length - 4] === 'metrics')) {
    const dialect = sibling('dialect');
    return !dialect || !NOT_SQL.has(dialect.toUpperCase());
  }
  if (last === 'expression' && MAPPINGS.has(keys[length - 2]) && keys.includes('concept_mappings')) return true;
  if (last === 'transformLogic' && keys[0] === 'schema' && keys.includes('properties')) return true;
  if (last === 'query' && keys[length - 2] === 'quality' && (keys[0] === 'schema' || keys[0] === 'quality')) return (sibling('type') ?? '').toLowerCase() === 'sql';
  return false;
}
function yamlSibling(owner: SyntaxNode | null, name: string, read: Read): string | undefined {
  if (!owner) return undefined;
  for (let child = owner.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'Pair') continue;
    const key = child.getChild('Key');
    if (!key || unquote(read(key.from, key.to)) !== name) continue;
    const value = child.lastChild;
    if (!value || value.name === 'Key' || value.name === ':') return undefined;
    return unquote(read(value.from, value.to));
  }
  return undefined;
}

/** Checks the enclosing YAML keys and sibling dialect for an SQL value. */
export function yamlSql(value: SyntaxNode, read: Read): boolean {
  const pair = value.name === 'BlockLiteralContent' ? value.parent?.parent : value.parent;
  if (!pair || pair.name !== 'Pair') return false;
  const keys: string[] = [];
  for (let ancestor: SyntaxNode | null = pair; ancestor && keys.length < 24; ancestor = ancestor.parent) {
    if (ancestor.name !== 'Pair') continue;
    const key = ancestor.getChild('Key');
    if (!key) return false;
    keys.unshift(unquote(read(key.from, key.to)));
  }
  return sqlKeyPath(keys, name => yamlSibling(pair.parent, name, read));
}

function jsonString(node: SyntaxNode | null, read: Read): string | undefined {
  if (!node) return undefined;
  try {
    const value: unknown = JSON.parse(read(node.from, node.to));
    return typeof value === 'string' ? value : undefined;
  } catch {
    // Incomplete strings are normal while typing and cannot identify a key or dialect yet.
    return undefined;
  }
}

function jsonSibling(owner: SyntaxNode | null, name: string, read: Read): string | undefined {
  if (!owner) return undefined;
  for (let child = owner.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'Property') continue;
    if (jsonString(child.getChild('PropertyName'), read) !== name) continue;
    const value = child.lastChild;
    return value?.name === 'String' ? jsonString(value, read) : undefined;
  }
  return undefined;
}

/** Checks enclosing JSON properties for an SQL string. */
export function jsonSql(value: SyntaxNode, read: Read): boolean {
  const property = value.parent;
  if (!property || property.name !== 'Property' || value.prevSibling?.name !== ':') return false;
  const keys: string[] = [];
  for (let ancestor: SyntaxNode | null = property; ancestor && keys.length < 24; ancestor = ancestor.parent) {
    if (ancestor.name !== 'Property') continue;
    const key = jsonString(ancestor.getChild('PropertyName'), read);
    if (key === undefined) return false;
    keys.unshift(key);
  }
  return sqlKeyPath(keys, name => jsonSibling(property.parent, name, read));
}

/** Recognizes the immediate prefix of a value that can contain SQL. */
export const SQL_KEY_BEFORE = /(?:expression|query|transformLogic)["']?\s*:\s*(?:[|>][-+0-9]*[ \t]*(?:#[^\n]*)?\n[ \t]*)?['"]?$/;

/** Identifies the embedded language using the same rules in both editor modes. */
export function yamlEmbeddedLanguage(node: SyntaxNode, read: Read): 'sql' | 'json' | null {
  const scalar = ['Literal', 'QuotedLiteral', 'BlockLiteralContent'].includes(node.name);
  if (!scalar) return null;
  const lookbehind = node.name === 'BlockLiteralContent' ? 48 : 24;
  const before = read(Math.max(0, node.from - lookbehind), node.from);
  if (SQL_KEY_BEFORE.test(before) && node.parent?.name !== 'Key' && yamlSql(node, read)) {
    return 'sql';
  }
  if (node.name !== 'BlockLiteralContent') return null;
  const pair = node.parent?.parent;
  const key = pair?.getChild('Key');
  if (!pair || !key || read(key.from, key.to).trim() !== 'data') return null;
  const owner = pair.parent;
  return owner && read(owner.from, owner.to).includes('SEMANTIC_WORKBENCH') ? 'json' : null;
}
