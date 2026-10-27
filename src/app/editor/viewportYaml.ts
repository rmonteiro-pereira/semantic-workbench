/** Reconstructs just visible YAML and its enclosing keys for embedded-language parsing. */
import type { Text } from '@codemirror/state';
import { yamlLanguage } from '@codemirror/lang-yaml';
import { yamlEmbeddedLanguage } from './embeddedLanguages';
import { findYamlLine, yamlIndentation } from './yamlIndentation';

/** Describes source offsets for an embedded SQL or extension JSON value. */
export type EmbeddedRegion = { from: number; to: number; language: 'sql' | 'json' };

/** Finds embedded values using the same syntax nodes and rules as full YAML parsing. */
export function findYamlRegions(source: string): EmbeddedRegion[] {
  const regions: EmbeddedRegion[] = [];
  const tree = yamlLanguage.parser.parse(source);
  tree.iterate({
    enter(node) {
      const language = yamlEmbeddedLanguage(node.node, (from, to) => source.slice(from, to));
      if (!language) return;
      const quoted = node.name === 'QuotedLiteral';
      const from = node.from + Number(quoted);
      const to = node.to - Number(quoted);
      if (from < to) regions.push({ from, to, language });
      return false;
    },
  });
  return regions;
}

function addMetadata(doc: Text, number: number, selected: Set<number>) {
  const line = doc.line(number);
  const indentation = yamlIndentation(line.text);
  if (!Number.isFinite(indentation)) return;
  const boundary = findYamlLine(doc, {
    from: number + 1,
    to: doc.lines,
    indentation,
  });
  const child = findYamlLine(doc, {
    from: number + 1,
    to: (boundary ?? doc.lines + 1) - 1,
    indentation: Number.MAX_SAFE_INTEGER,
  });
  if (child === null) return;
  const sequencePrefix = /^\s*-\s+/.exec(line.text);
  const childIndentation = sequencePrefix
    ? sequencePrefix[0].length
    : yamlIndentation(doc.line(child).text);
  let from = number + 1;
  while (from < (boundary ?? doc.lines + 1)) {
    const found = findYamlLine(doc, {
      from,
      to: (boundary ?? doc.lines + 1) - 1,
      indentation: childIndentation,
      metadata: true,
    });
    if (found === null) break;
    selected.add(found);
    from = found + 1;
  }
}

function contextLines(doc: Text, first: number, last: number): number[] {
  const selected = new Set<number>();
  for (let number = first; number <= last; number++) selected.add(number);
  let current = first;
  let indentation = Math.min(yamlIndentation(doc.line(first).text), Number.MAX_SAFE_INTEGER);
  while (current > 1 && indentation > 0) {
    const ancestor = findYamlLine(doc, {
      from: 1,
      to: current - 1,
      indentation: indentation - 1,
      backwards: true,
    });
    if (ancestor === null) break;
    selected.add(ancestor);
    current = ancestor;
    indentation = yamlIndentation(doc.line(current).text);
  }
  // Sibling dialects and extension vendors may come after the visible value.
  const structuralLines = [...selected];
  for (const number of structuralLines) addMetadata(doc, number, selected);
  return [...selected].sort((left, right) => left - right);
}

/** Parses visible lines with sparse ancestor context, keeping original source offsets. */
export function visibleYamlRegions(doc: Text, from: number, to: number): EmbeddedRegion[] {
  const numbers = contextLines(doc, doc.lineAt(from).number, doc.lineAt(to).number);
  let offset = 0;
  const lines = numbers.map(number => {
    const line = doc.line(number);
    const entry = { line, offset };
    offset += line.length + 1;
    return entry;
  });
  const source = lines.map(entry => entry.line.text).join('\n');
  const regions = findYamlRegions(source);
  const result: EmbeddedRegion[] = [];
  for (const region of regions) {
    let previous: EmbeddedRegion | undefined;
    for (const entry of lines) {
      const start = Math.max(region.from, entry.offset);
      const end = Math.min(region.to, entry.offset + entry.line.length);
      const originalFrom = Math.max(from, entry.line.from + start - entry.offset);
      const originalTo = Math.min(to, entry.line.from + end - entry.offset);
      if (start > end || originalFrom > originalTo) continue;
      if (previous && originalFrom <= previous.to + 1) {
        previous.to = originalTo;
        continue;
      }
      if (originalFrom === originalTo) continue;
      previous = { from: originalFrom, to: originalTo, language: region.language };
      result.push(previous);
    }
  }
  return result;
}
