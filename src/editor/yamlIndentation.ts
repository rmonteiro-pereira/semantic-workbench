/** Indexes indentation on persistent text branches so edits reuse unchanged summaries. */
import type { Text } from '@codemirror/state';

type Summary = { indentation: number; metadata: number };
const summaries = new WeakMap<Text, Summary>();
const metadataKey = /^\s*["']?(?:dialect|type|vendor_name)["']?\s*:/;

/** Returns indentation for nonempty YAML lines, ignoring comments and blank lines. */
export function yamlIndentation(line: string): number {
  if (/^\s*(?:#.*)?$/.test(line)) return Infinity;
  return line.search(/\S/);
}

function summarize(text: Text): Summary {
  const cached = summaries.get(text);
  if (cached) return cached;
  const summary = { indentation: Infinity, metadata: Infinity };
  if (text.children) {
    for (const child of text.children) {
      const childSummary = summarize(child);
      summary.indentation = Math.min(summary.indentation, childSummary.indentation);
      summary.metadata = Math.min(summary.metadata, childSummary.metadata);
    }
  } else {
    for (const line of text.iterLines()) {
      const indentation = yamlIndentation(line);
      summary.indentation = Math.min(summary.indentation, indentation);
      if (metadataKey.test(line)) summary.metadata = Math.min(summary.metadata, indentation);
    }
  }
  summaries.set(text, summary);
  return summary;
}

type Search = {
  from: number;
  to: number;
  indentation: number;
  backwards?: boolean;
  metadata?: boolean;
};

/** Finds a boundary or metadata line without walking intervening deeper blocks. */
export function findYamlLine(text: Text, search: Search, firstLine = 1): number | null {
  if (firstLine > search.to || firstLine + text.lines <= search.from) return null;
  const summary = summarize(text);
  const minimum = search.metadata ? summary.metadata : summary.indentation;
  if (minimum > search.indentation) return null;
  if (!text.children) return findLeafLine(text, search, firstLine);
  const children = text.children.map(child => {
    const entry = { child, firstLine };
    firstLine += child.lines;
    return entry;
  });
  if (search.backwards) children.reverse();
  for (const entry of children) {
    const found = findYamlLine(entry.child, search, entry.firstLine);
    if (found !== null) return found;
  }
  return null;
}

function findLeafLine(text: Text, search: Search, firstLine: number): number | null {
  const from = Math.max(1, search.from - firstLine + 1);
  const to = Math.min(text.lines, search.to - firstLine + 1);
  for (let index = 0; index <= to - from; index++) {
    const number = search.backwards ? to - index : from + index;
    const line = text.line(number).text;
    if (yamlIndentation(line) > search.indentation) continue;
    if (search.metadata && !metadataKey.test(line)) continue;
    return firstLine + number - 1;
  }
  return null;
}

/** Folds a YAML header through its last deeper-indented nonblank line. */
export function foldYamlBlock(doc: Text, lineStart: number): { from: number; to: number } | null {
  const line = doc.lineAt(lineStart);
  const indentation = yamlIndentation(line.text);
  if (!Number.isFinite(indentation)) return null;
  const boundary = findYamlLine(doc, {
    from: line.number + 1,
    to: doc.lines,
    indentation,
  });
  const last = findYamlLine(doc, {
    from: line.number + 1,
    to: (boundary ?? doc.lines + 1) - 1,
    indentation: Number.MAX_SAFE_INTEGER,
    backwards: true,
  });
  return last === null ? null : { from: line.to, to: doc.line(last).to };
}
