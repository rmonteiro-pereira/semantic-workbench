import { isMap, isScalar, isSeq, parseDocument, type Document } from 'yaml';
import { rdfSyntax } from '../rdf';
import { VENDOR } from '../metrics/extension';
import { itemValue, removePatches, valuePatches, edit } from './yaml-patch';
import type { ItemKind, Path } from './item-model';
import type { Patch } from './source-text';
// References to an item across the project's YAML/JSON files (FR-050, FR-051): what breaks when
// it is deleted (each with the item that would be removed with it) and what still names it after a
// rename (each occurrence rewritten only when the user ticks it). Nothing is rewritten silently.
export type ProjectDoc = { id: string; path: string; filename: string; source: string };
export type Dependent = { path: Path; label: string; binding?: { dataPath: Path; metric: string } };
export type Reference = {
  docId: string;
  file: string;
  path: Path;
  where: string;
  from: number;
  to: number;
  line: number;
  excerpt: string;
  dependent: Dependent | null;
};
export type Target = { kind: ItemKind; name: string; docId: string; path: Path; owner?: string };
type Node = any;
const lineOf = (src: string, pos: number) => src.slice(0, pos).split('\n').length;
const excerpt = (src: string, pos: number) => {
  const a = src.lastIndexOf('\n', pos - 1) + 1,
    b = src.indexOf('\n', pos);
  return src
    .slice(a, b < 0 ? undefined : b)
    .trim()
    .slice(0, 160);
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const startsWith = (path: Path, prefix: Path) =>
  prefix.length <= path.length && prefix.every((k, i) => path[i] === k);
// Every string scalar of a document, with its path, node and the nearest list item paths.
function scalars(doc: Document.Parsed) {
  const out: { path: Path; node: Node; value: string }[] = [];
  const walk = (n: Node, path: Path) => {
    if (isMap(n))
      for (const p of n.items as any[]) {
        if (isScalar(p.key)) walk(p.value, [...path, String(p.key.value)]);
      }
    else if (isSeq(n)) n.items.forEach((x: any, i: number) => walk(x, [...path, i]));
    else if (isScalar(n) && typeof n.value === 'string' && n.range)
      out.push({ path, node: n, value: n.value });
  };
  walk(doc.contents, []);
  return out;
}
const upTo = (path: Path, key: string) => {
  const i = path.lastIndexOf(key);
  return i >= 0 && typeof path[i + 1] === 'number' ? path.slice(0, i + 2) : null;
};
// The text of `name` inside a scalar's source, at each match of `pattern`.
function within(src: string, node: Node, pattern: RegExp) {
  const [a, b] = node.range,
    text = src.slice(a, b),
    out: [number, number][] = [];
  let m;
  pattern.lastIndex = 0;
  while ((m = pattern.exec(text))) {
    const at = a + m.index + (m[1] ? m[0].indexOf(m[1]) : 0);
    out.push([at, at + (m[1] ?? m[0]).length]);
    if (!m[0].length) pattern.lastIndex++;
  }
  return out;
}
function describe(path: Path, data: any) {
  const item = (key: string) => {
    const p = upTo(path, key);
    const v = p && p.reduce((x: any, k) => x?.[k], data);
    return v?.concept ?? v?.name ?? (typeof v?.to === 'string' ? v.to : '');
  };
  if (path.includes('concept_mappings')) return `concept mapping ${item('concept_mappings')}`;
  if (path.includes('metrics')) return `metric ${item('metrics')}`;
  if (path.includes('relationships') && path.includes('ontology'))
    return `relationship ${item('relationships')} of ${item('ontology')}`;
  if (path.includes('extends')) return `extends of ${item('ontology')}`;
  if (path.includes('relationships') && data?.kind === 'DataContract')
    return `foreign key of ${item('properties') || item('schema')}`;
  if (path.includes('relationships')) return `dataset relationship ${item('relationships')}`;
  if (path.includes('fields')) return `field ${item('fields')} of ${item('datasets')}`;
  if (path.includes('identify_by')) return `identifier of ${item('ontology')}`;
  return path.join(' / ');
}
export function findReferences(target: Target, docs: ProjectDoc[]): Reference[] {
  const out: Reference[] = [],
    name = target.name;
  if (!name) return out;
  const quoted = JSON.stringify(name);
  const word = new RegExp(`(?<![\\w$.'"])(${escape(name)})(?![\\w$'"(])`, 'g'),
    qualifier = new RegExp(`(?<![\\w$.'"])(${escape(name)})(?=\\s*\\.)`, 'g');
  const fieldRef = target.owner
    ? new RegExp(`(?<![\\w$'"])${escape(target.owner)}\\s*\\.\\s*(${escape(name)})(?![\\w$])`, 'g')
    : null;
  for (const d of docs) {
    if (rdfSyntax(d.source, d.filename)) continue;
    let doc: Document.Parsed;
    try {
      doc = parseDocument(d.source, { uniqueKeys: false });
      if (doc.errors.length) continue;
    } catch {
      continue;
    }
    const data = doc.toJS(),
      src = d.source,
      self = d.id === target.docId;
    const add = (path: Path, spans: [number, number][], dependent: Dependent | null) => {
      for (const [from, to] of spans)
        out.push({
          docId: d.id,
          file: d.path,
          path,
          where: describe(path, data),
          from,
          to,
          line: lineOf(src, from),
          excerpt: excerpt(src, from),
          dependent,
        });
    };
    const dep = (p: Path | null): Dependent | null =>
      p ? { path: p, label: describe(p, data) } : null;
    for (const s of scalars(doc)) {
      const { path, node, value } = s,
        key = path.at(-1);
      // The item itself (and what it contains) is not a reference to itself.
      if (self && startsWith(path, target.path)) continue;
      // metric bindings and metric extensions: JSON inside a SEMANTIC_WORKBENCH block.
      if (key === 'data' && path.at(-3) === 'custom_extensions') {
        const owner = path.slice(0, -3),
          entry = path.slice(0, -1).reduce((x: any, k) => x?.[k], data);
        if (entry?.vendor_name !== VENDOR) continue;
        let json: any;
        try {
          json = JSON.parse(value);
        } catch {
          continue;
        }
        if (Array.isArray(json?.kpi_bindings))
          for (const b of json.kpi_bindings) {
            const hit =
              target.kind === 'metric'
                ? b.metric === name
                : target.kind === 'concept'
                  ? b.measures === name || b.of === name
                  : false;
            if (!hit) continue;
            const [a, z] = node.range,
              text = src.slice(a, z),
              at =
                text.indexOf(`${JSON.stringify(b.metric)}`) >= 0
                  ? text.indexOf(JSON.stringify(b.metric))
                  : 0;
            const spans: [number, number][] = [];
            let i = text.indexOf(quoted, at);
            const end = text.indexOf('}', at);
            while (i >= 0 && (end < 0 || i < end)) {
              spans.push([a + i + 1, a + i + 1 + name.length]);
              i = text.indexOf(quoted, i + 1);
            }
            add(path, spans.length ? spans : [[a, a]], {
              path: owner,
              label: `metric binding of ${b.metric}`,
              binding: { dataPath: path, metric: b.metric },
            });
          }
        else if (target.kind === 'metric' || target.kind === 'dataset' || target.kind === 'field') {
          const pattern =
            target.kind === 'metric'
              ? new RegExp(`"(${escape(name)})"`, 'g')
              : target.kind === 'dataset'
                ? new RegExp(`"(${escape(name)})\\.`, 'g')
                : new RegExp(`"${escape(target.owner ?? '')}\\.(${escape(name)})"`, 'g');
          const spans = within(src, node, pattern);
          if (spans.length) add(path, spans, dep(upTo(path, 'metrics')));
        }
        continue;
      }
      switch (target.kind) {
        case 'concept':
          if (key === 'concept' && path.at(-3) === 'roles' && value === name)
            add(
              path,
              within(src, node, new RegExp(escape(name), 'g')).slice(0, 1),
              dep(upTo(path, 'relationships')),
            );
          else if (path.at(-2) === 'extends' && value === name)
            add(path, within(src, node, new RegExp(escape(name), 'g')).slice(0, 1), dep(path));
          else if (key === 'concept' && path.includes('concept_mappings') && value === name)
            add(
              path,
              within(src, node, new RegExp(escape(name), 'g')).slice(0, 1),
              dep(upTo(path, 'concept_mappings')),
            );
          break;
        case 'ontology-relationship':
          if (
            path.at(-2) === 'identify_by' &&
            value === name &&
            startsWith(path, target.path.slice(0, -2))
          )
            add(path, within(src, node, new RegExp(escape(name), 'g')).slice(0, 1), dep(path));
          break;
        case 'dataset':
          if (
            (key === 'from' || key === 'to') &&
            path.at(-3) === 'relationships' &&
            data?.kind !== 'DataContract' &&
            value === name
          )
            add(
              path,
              within(src, node, new RegExp(escape(name), 'g')).slice(0, 1),
              dep(upTo(path, 'relationships')),
            );
          else if (key === 'expression') {
            const spans = within(src, node, qualifier);
            if (spans.length)
              add(path, spans, dep(path.includes('metrics') ? upTo(path, 'metrics') : null));
          }
          break;
        case 'field':
          if (key === 'expression' && fieldRef) {
            const spans = within(src, node, fieldRef);
            if (spans.length)
              add(path, spans, dep(path.includes('metrics') ? upTo(path, 'metrics') : null));
          }
          break;
        case 'metric':
          if (key === 'expression') {
            const spans = within(src, node, word);
            if (spans.length)
              add(
                path,
                spans,
                path.includes('metrics')
                  ? dep(upTo(path, 'metrics'))
                  : path.includes('object_mappings')
                    ? dep(upTo(path, 'object_mappings'))
                    : null,
              );
          }
          break;
        case 'odcs-object':
        case 'odcs-property': {
          // Foreign keys name their target as object.property.
          const isRef =
            (key === 'to' ||
              key === 'from' ||
              (typeof key === 'number' && (path.at(-2) === 'to' || path.at(-2) === 'from'))) &&
            path.includes('relationships');
          const offset =
            target.kind === 'odcs-object'
              ? value === name || value.startsWith(name + '.')
                ? 0
                : -1
              : value === `${target.owner}.${name}`
                ? String(target.owner).length + 1
                : -1;
          if (isRef && offset >= 0) {
            const at =
              node.range[0] + src.slice(node.range[0], node.range[1]).indexOf(value) + offset;
            add(path, [[at, at + name.length]], dep(upTo(path, 'relationships')));
          }
          break;
        }
      }
    }
  }
  return out;
}
// Removal of the given dependents, file by file, applied from the last path to the first so list
// positions stay valid; bindings are removed by metric name.
export function removeDependents(
  docs: ProjectDoc[],
  dependents: { docId: string; dependent: Dependent }[],
): { docId: string; source: string }[] {
  const byDoc = new Map<string, Dependent[]>();
  for (const { docId, dependent } of dependents) {
    const list = byDoc.get(docId) ?? [];
    if (
      !list.some(
        x =>
          JSON.stringify(x.path) === JSON.stringify(dependent.path) &&
          x.binding?.metric === dependent.binding?.metric,
      )
    )
      list.push(dependent);
    byDoc.set(docId, list);
  }
  const cmp = (a: Path, b: Path) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) continue;
      return typeof a[i] === 'number' && typeof b[i] === 'number'
        ? (a[i] as number) - (b[i] as number)
        : String(a[i]).localeCompare(String(b[i]));
    }
    return a.length - b.length;
  };
  return [...byDoc].map(([docId, list]) => {
    const d = docs.find(x => x.id === docId)!;
    // A dependent inside another removed dependent goes with it.
    const items = list
      .filter(
        x =>
          x.binding ||
          !list.some(
            y =>
              !y.binding && y !== x && startsWith(x.path, y.path) && y.path.length < x.path.length,
          ),
      )
      .sort((a, b) => cmp(b.binding?.dataPath ?? b.path, a.binding?.dataPath ?? a.path));
    const steps = items.map(x => (text: string): Patch[] => {
      if (!x.binding) return removePatches(text, x.path, d.filename);
      const json = JSON.parse(itemValue(text, x.binding.dataPath));
      return valuePatches(
        text,
        x.binding.dataPath,
        JSON.stringify({
          ...json,
          kpi_bindings: json.kpi_bindings.filter((b: any) => b.metric !== x.binding!.metric),
        }),
        d.filename,
      );
    });
    return { docId, source: edit(d.source, ...steps) };
  });
}
// Rewrite the chosen occurrences of a renamed item (each confirmed by the user).
export function rewriteReferences(
  docs: ProjectDoc[],
  refs: Reference[],
  newName: string,
): { docId: string; source: string }[] {
  const byDoc = new Map<string, Reference[]>();
  for (const r of refs) byDoc.set(r.docId, [...(byDoc.get(r.docId) ?? []), r]);
  return [...byDoc].map(([docId, list]) => {
    const d = docs.find(x => x.id === docId)!;
    let out = '',
      at = 0;
    for (const r of [...list].sort((a, b) => a.from - b.from)) {
      if (r.from < at || r.to === r.from) continue;
      out += d.source.slice(at, r.from) + newName;
      at = r.to;
    }
    return { docId, source: out + d.source.slice(at) };
  });
}
