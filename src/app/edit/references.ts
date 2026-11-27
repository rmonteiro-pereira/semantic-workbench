/** Finds broken dependencies and rename occurrences across project files for explicit user
 * review. */
import { ambiguousMappingRelationships, mappingRelationshipTargets } from './relationship-references';
import { isMap, isScalar, isSeq, parseDocument, type Document } from 'yaml';
import { rdfSyntax } from '../../shared/validation/rdf';
import { NONPORTABLE_EXTENSIONS, VENDOR, decodeExtensionData, readKpiBindings, workbenchEntry } from '../../shared/metrics/extension';
import { itemValue, removePatches, valuePatches, edit } from '../../shared/edit/yaml-patch';
import type { ItemKind, Path } from '../../shared/edit/item-model';
import type { Patch } from '../../shared/edit/source-text';
import { IMPORTS_PROPERTY } from '../../shared/tessera/additions/imports';
import { INCLUDES_PROPERTY } from '../../shared/tessera/additions/includes';
import { rewriteConceptReferences } from '../../shared/tessera/qualify';
import { ATTRIBUTE_ORDER_PROPERTY } from '../../shared/tessera/additions/attributes';
// References to an item across the project's YAML/JSON files: what breaks when it is deleted (each
// with the item that would be removed with it) and what still names it after a rename (each
// occurrence rewritten only when the user ticks it). Nothing is rewritten silently.
/** Where a scalar sits inside the object data of a 0.3 draft workbench entry, or null when it is elsewhere. */
type WorkbenchObjectSite = { owner: Path; dataPath: Path; inner: Path };

/**
 * Finds the 0.3 draft workbench entry a scalar belongs to. In that form the attributes and bindings
 * are ordinary YAML under `nonportable_extensions[i].data`, so each value is its own scalar.
 */
function workbenchObjectSite(path: Path, data: any): WorkbenchObjectSite | null {
  const at = path.lastIndexOf(NONPORTABLE_EXTENSIONS.list);
  if (at < 0 || path[at + 2] !== 'data' || typeof path[at + 1] !== 'number') return null;
  const owner = path.slice(0, at);
  const ownerValue = owner.reduce((value: any, part) => value?.[part], data);
  const entry = workbenchEntry(ownerValue);
  if (!entry || entry.form !== NONPORTABLE_EXTENSIONS || entry.index !== path[at + 1]) return null;
  return { owner, dataPath: path.slice(0, at + 3), inner: path.slice(at + 3) };
}

/** Provides document identity and source for cross-file reference analysis. */
export type ProjectDoc = { id: string; path: string; filename: string; source: string };
/** Locates an item or metric binding removed with its dependency. */
export type Dependent = { path: Path; label: string; binding?: { dataPath: Path; metric: string } };
/** Describes an occurrence affected by an item rename or deletion. */
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
/** Identifies the item whose cross-file references are being inspected. */
export type Target = { kind: ItemKind; name: string; docId: string; path: Path; owner?: string };
type Node = any;
const lineOf = (src: string, pos: number) => src.slice(0, pos).split('\n').length;
const excerpt = (src: string, pos: number) => {
  const lineStart = src.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = src.indexOf('\n', pos);
  return src
    .slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
    .trim()
    .slice(0, 160);
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const startsWith = (path: Path, prefix: Path) => prefix.length <= path.length && prefix.every((k, i) => path[i] === k);
// Every string scalar of a document, with its path, node and the nearest list item paths.
function scalars(doc: Document.Parsed) {
  const out: { path: Path; node: Node; value: string }[] = [];
  const walk = (node: Node, path: Path) => {
    if (isMap(node))
      for (const pair of node.items as any[]) {
        if (isScalar(pair.key)) walk(pair.value, [...path, String(pair.key.value)]);
      }
    else if (isSeq(node)) node.items.forEach((x: any, i: number) => walk(x, [...path, i]));
    else if (isScalar(node) && typeof node.value === 'string' && node.range) out.push({ path, node: node, value: node.value });
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
  const [rangeStart, rangeEnd] = node.range;
  const text = src.slice(rangeStart, rangeEnd);
  const out: [number, number][] = [];
  let match;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(text))) {
    const at = rangeStart + match.index + (match[1] ? match[0].indexOf(match[1]) : 0);
    out.push([at, at + (match[1] ?? match[0]).length]);
    if (!match[0].length) pattern.lastIndex++;
  }
  return out;
}
function describe(path: Path, data: any) {
  const item = (key: string) => {
    const itemPath = upTo(path, key);
    const found = itemPath && itemPath.reduce((x: any, k) => x?.[k], data);
    return found?.concept ?? found?.name ?? (typeof found?.to === 'string' ? found.to : '');
  };
  if (path.includes('concept_mappings')) return `concept mapping ${item('concept_mappings')}`;
  if (path.includes('metrics')) return `metric ${item('metrics')}`;
  if (path.includes('relationships') && path.includes('ontology')) return `relationship ${item('relationships')} of ${item('ontology')}`;
  if (path.includes('extends')) return `extends of ${item('ontology')}`;
  if (path.includes('relationships') && data?.kind === 'DataContract') return `foreign key of ${item('properties') || item('schema')}`;
  if (path.includes('relationships')) return `dataset relationship ${item('relationships')}`;
  if (path.includes('fields')) return `field ${item('fields')} of ${item('datasets')}`;
  if (path.includes('identify_by')) return `identifier of ${item('ontology')}`;
  if (path.includes(ATTRIBUTE_ORDER_PROPERTY)) return `attribute order of ${item('ontology')}`;
  return path.join(' / ');
}
/** Mapping references that name the renamed relationship without saying which concept defines it, so no rewrite can be trusted. */
export function unrewritableReferences(target: Target, docs: ProjectDoc[]): { file: string; line: number; excerpt: string }[] {
  const ownSource = docs.find(document => document.id === target.docId)?.source;
  if (target.kind !== 'ontology-relationship' || !ownSource) return [];
  const ontology = parseDocument(ownSource).toJS();
  const owner = target.path.slice(0, -2).reduce((value: any, part) => value?.[part], ontology)?.concept;
  const found: { file: string; line: number; excerpt: string }[] = [];
  for (const projectDoc of docs) {
    if (rdfSyntax(projectDoc.source, projectDoc.filename)) continue;
    const parsedDoc = parseDocument(projectDoc.source, { uniqueKeys: false });
    if (parsedDoc.errors.length) continue;
    for (const ambiguous of ambiguousMappingRelationships(parsedDoc.toJS(), ontology)) {
      if (ambiguous.name !== target.name || !ambiguous.owners.includes(owner)) continue;
      const node: any = parsedDoc.getIn(ambiguous.path, true);
      const at = node?.range?.[0] ?? 0;
      found.push({ file: projectDoc.path, line: lineOf(projectDoc.source, at), excerpt: excerpt(projectDoc.source, at) });
    }
  }
  return found;
}

/** The workbench metric attributes that hold another metric's name. A label or any other text that happens to match is not a reference. */
const METRIC_NAME_ATTRIBUTES = new Set(['numerator', 'denominator', 'inputs', 'replaced_by']);

/**
 * Decides whether one value inside 0.3 draft workbench data names the target, and what is removed
 * with it: a binding goes by its metric name, an attribute with its metric.
 */
function objectSiteReference(site: WorkbenchObjectSite, value: string, target: Target, data: any): { pattern: RegExp; dependent?: Dependent } | null {
  const name = target.name!;
  const [list, index, field] = site.inner;
  if (list === 'kpi_bindings' && typeof index === 'number') {
    const ownerValue = site.owner.reduce((item: any, part) => item?.[part], data);
    const binding = readKpiBindings(ownerValue, '', true).value[index];
    const hit = (target.kind === 'metric' && field === 'metric') || (target.kind === 'concept' && (field === 'measures' || field === 'of'));
    if (!binding || !hit || value !== name) return null;
    return { pattern: new RegExp(escape(name), 'g'), dependent: { path: site.owner, label: `metric binding of ${binding.metric}`, binding: { dataPath: site.dataPath, metric: binding.metric } } };
  }
  if (target.kind === 'metric') return METRIC_NAME_ATTRIBUTES.has(String(list)) && value === name ? { pattern: new RegExp(escape(name), 'g') } : null;
  if (target.kind === 'dataset' && value.startsWith(`${name}.`)) return { pattern: new RegExp(`${escape(name)}(?=\\.)`, 'g') };
  if (target.kind === 'field' && value === `${target.owner ?? ''}.${name}`) return { pattern: new RegExp(`(?<=\\.)${escape(name)}(?![\\w$])`, 'g') };
  return null;
}

/** Finds references affected by renaming or deleting the target item. */
export function findReferences(target: Target, docs: ProjectDoc[]): Reference[] {
  const out: Reference[] = [];
  const name = target.name;
  if (!name) return out;
  const ownSource = docs.find(document => document.id === target.docId)?.source;
  const ownOntology = target.kind === 'ontology-relationship' && ownSource ? parseDocument(ownSource).toJS() : null;
  const owner = target.owner ?? (ownOntology && target.path.slice(0, -2).reduce((value: any, part) => value?.[part], ownOntology)?.concept);
  const quoted = JSON.stringify(name);
  const word = new RegExp(`(?<![\\w$.'"])(${escape(name)})(?![\\w$'"(])`, 'g');
  const qualifier = new RegExp(`(?<![\\w$.'"])(${escape(name)})(?=\\s*\\.)`, 'g');
  const fieldRef = target.owner ? new RegExp(`(?<![\\w$'"])${escape(target.owner)}\\s*\\.\\s*(${escape(name)})(?![\\w$])`, 'g') : null;
  for (const projectDoc of docs) {
    if (rdfSyntax(projectDoc.source, projectDoc.filename)) continue;
    let doc: Document.Parsed;
    try {
      doc = parseDocument(projectDoc.source, { uniqueKeys: false });
      if (doc.errors.length) continue;
    } catch {
      continue;
    }
    const data = doc.toJS();
    const relationshipTargets = ownOntology ? mappingRelationshipTargets(data, ownOntology) : new Map();
    const src = projectDoc.source;
    const self = projectDoc.id === target.docId;
    const add = (path: Path, spans: [number, number][], dependent: Dependent | null) => {
      for (const [from, to] of spans)
        out.push({
          docId: projectDoc.id,
          file: projectDoc.path,
          path,
          where: describe(path, data),
          from,
          to,
          line: lineOf(src, from),
          excerpt: excerpt(src, from),
          dependent,
        });
    };
    const dep = (p: Path | null): Dependent | null => (p ? { path: p, label: describe(p, data) } : null);
    for (const scalar of scalars(doc)) {
      const { path, node, value } = scalar;
      const key = path.at(-1);
      // The item itself (and what it contains) is not a reference to itself.
      if (self && startsWith(path, target.path)) continue;
      // Metric bindings and metric attributes of a 0.3 draft file: YAML values inside a SEMANTIC_WORKBENCH entry.
      const site = workbenchObjectSite(path, data);
      if (site) {
        const found = objectSiteReference(site, String(value), target, data);
        if (found) add(path, within(src, node, found.pattern).slice(0, 1), found.dependent ?? dep(upTo(path, 'metrics')));
        continue;
      }
      // Metric bindings and metric extensions: JSON inside a SEMANTIC_WORKBENCH block.
      if (key === 'data' && path.at(-3) === 'custom_extensions') {
        const owner = path.slice(0, -3);
        const entry = path.slice(0, -1).reduce((x: any, k) => x?.[k], data);
        if (entry?.vendor_name !== VENDOR) continue;
        let json: any;
        try {
          json = JSON.parse(value);
        } catch {
          continue;
        }
        if (Array.isArray(json?.kpi_bindings))
          for (const binding of json.kpi_bindings) {
            let hit;
            if (target.kind === 'metric') {
              hit = binding.metric === name;
            } else if (target.kind === 'concept') {
              hit = binding.measures === name || binding.of === name;
            } else {
              hit = false;
            }
            if (!hit) continue;
            const [rangeStart, rangeEnd] = node.range;
            const text = src.slice(rangeStart, rangeEnd);
            const at = text.indexOf(`${JSON.stringify(binding.metric)}`) >= 0 ? text.indexOf(JSON.stringify(binding.metric)) : 0;
            const spans: [number, number][] = [];
            let i = text.indexOf(quoted, at);
            const end = text.indexOf('}', at);
            while (i >= 0 && (end < 0 || i < end)) {
              spans.push([rangeStart + i + 1, rangeStart + i + 1 + name.length]);
              i = text.indexOf(quoted, i + 1);
            }
            add(path, spans.length ? spans : [[rangeStart, rangeStart]], {
              path: owner,
              label: `metric binding of ${binding.metric}`,
              binding: { dataPath: path, metric: binding.metric },
            });
          }
        else if (target.kind === 'metric' || target.kind === 'dataset' || target.kind === 'field') {
          let pattern;
          if (target.kind === 'metric') {
            pattern = new RegExp(`"(${escape(name)})"`, 'g');
          } else if (target.kind === 'dataset') {
            pattern = new RegExp(`"(${escape(name)})\\.`, 'g');
          } else {
            pattern = new RegExp(`"${escape(target.owner ?? '')}\\.(${escape(name)})"`, 'g');
          }
          const spans = within(src, node, pattern);
          if (spans.length) add(path, spans, dep(upTo(path, 'metrics')));
        }
        continue;
      }
      switch (target.kind) {
        case 'concept':
          if (key === 'concept' && path.at(-3) === 'roles' && value === name) add(path, within(src, node, new RegExp(escape(name), 'g')).slice(0, 1), dep(upTo(path, 'relationships')));
          else if (path.at(-2) === 'extends' && value === name) add(path, within(src, node, new RegExp(escape(name), 'g')).slice(0, 1), dep(path));
          else if (key === 'concept' && path.includes('concept_mappings') && value === name)
            add(path, within(src, node, new RegExp(escape(name), 'g')).slice(0, 1), dep(upTo(path, 'concept_mappings')));
          break;
        case 'ontology-relationship':
          if (self && path.at(-2) === 'identify_by' && value === name && startsWith(path, target.path.slice(0, -2))) add(path, within(src, node, new RegExp(escape(name), 'g')).slice(0, 1), dep(path));
          else if (self && path.at(-2) === ATTRIBUTE_ORDER_PROPERTY && value === name && startsWith(path, target.path.slice(0, -2)))
            add(path, within(src, node, new RegExp(escape(name), 'g')).slice(0, 1), dep(path));
          else if (typeof key === 'number' && (path.at(-2) === 'requires' || path.at(-2) === 'derived_by') && path.includes('ontology')) {
            const qualifiedName = new RegExp(`(?<![\\w$.'"])${escape(String(owner))}\\s*\\.\\s*(${escape(name)})(?![\\w$])`, 'g');
            const ownConcept = self && startsWith(path, target.path.slice(0, -2));
            const spans = [...within(src, node, qualifiedName), ...(ownConcept ? within(src, node, word) : [])];
            if (spans.length)
              add(
                path,
                spans.sort((first, second) => first[0] - second[0]),
                null,
              );
          } else if (key === 'relationship') {
            const resolved = relationshipTargets.get(JSON.stringify(path));
            if (resolved?.owner === owner && resolved.name === name)
              add(path, within(src, node, new RegExp(`(${escape(name)})(?=['"]?$)`, 'g')), dep(upTo(path, 'referent_mappings') ?? upTo(path, 'children')));
          }
          break;
        case 'dataset':
          if ((key === 'from' || key === 'to') && path.at(-3) === 'relationships' && data?.kind !== 'DataContract' && value === name)
            add(path, within(src, node, new RegExp(escape(name), 'g')).slice(0, 1), dep(upTo(path, 'relationships')));
          else if (key === 'expression') {
            const spans = within(src, node, qualifier);
            if (spans.length) add(path, spans, dep(path.includes('metrics') ? upTo(path, 'metrics') : null));
          }
          break;
        case 'field':
          if (key === 'expression' && fieldRef) {
            const spans = within(src, node, fieldRef);
            if (spans.length) add(path, spans, dep(path.includes('metrics') ? upTo(path, 'metrics') : null));
          }
          break;
        case 'metric':
          if (key === 'expression') {
            const spans = within(src, node, word);
            if (spans.length) {
              let dependency: ReturnType<typeof dep> | null = null;
              if (path.includes('metrics')) {
                dependency = dep(upTo(path, 'metrics'));
              } else if (path.includes('object_mappings')) {
                dependency = dep(upTo(path, 'object_mappings'));
              }
              add(path, spans, dependency);
            }
          }
          break;
        case 'odcs-object':
        case 'odcs-property': {
          // Foreign keys name their target as object.property.
          const isRef = (key === 'to' || key === 'from' || (typeof key === 'number' && (path.at(-2) === 'to' || path.at(-2) === 'from'))) && path.includes('relationships');
          let offset;
          if (target.kind === 'odcs-object') {
            if (value === name || value.startsWith(name + '.')) {
              offset = 0;
            } else {
              offset = -1;
            }
          } else if (value === `${target.owner}.${name}`) {
            offset = String(target.owner).length + 1;
          } else {
            offset = -1;
          }
          if (isRef && offset >= 0) {
            const at = node.range[0] + src.slice(node.range[0], node.range[1]).indexOf(value) + offset;
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
/** Removes dependents in reverse path order so list indexes remain valid. */
export function removeDependents(docs: ProjectDoc[], dependents: { docId: string; dependent: Dependent }[]): { docId: string; source: string }[] {
  const byDoc = new Map<string, Dependent[]>();
  for (const { docId, dependent } of dependents) {
    const list = byDoc.get(docId) ?? [];
    if (!list.some(x => JSON.stringify(x.path) === JSON.stringify(dependent.path) && x.binding?.metric === dependent.binding?.metric)) list.push(dependent);
    byDoc.set(docId, list);
  }
  const cmp = (left: Path, right: Path) => {
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      if (left[i] === right[i]) continue;
      return typeof left[i] === 'number' && typeof right[i] === 'number' ? (left[i] as number) - (right[i] as number) : String(left[i]).localeCompare(String(right[i]));
    }
    return left.length - right.length;
  };
  return [...byDoc].map(([docId, list]) => {
    const projectDoc = docs.find(x => x.id === docId)!;
    // A dependent inside another removed dependent goes with it.
    const items = list
      .filter(x => x.binding || !list.some(y => !y.binding && y !== x && startsWith(x.path, y.path) && y.path.length < x.path.length))
      .sort((a, b) => cmp(b.binding?.dataPath ?? b.path, a.binding?.dataPath ?? a.path));
    const steps = items.map(x => (text: string): Patch[] => {
      if (!x.binding) return removePatches(text, x.path, projectDoc.filename);
      const stored = itemValue(text, x.binding.dataPath);
      if (x.binding.dataPath.includes(NONPORTABLE_EXTENSIONS.list)) {
        const value = decodeExtensionData(NONPORTABLE_EXTENSIONS, stored).value ?? {};
        const kept = (value.kpi_bindings ?? []).filter((b: any) => b.metric !== x.binding!.metric);
        return valuePatches(text, x.binding.dataPath, { ...value, kpi_bindings: kept }, projectDoc.filename);
      }
      const json = JSON.parse(stored);
      return valuePatches(
        text,
        x.binding.dataPath,
        JSON.stringify({
          ...json,
          kpi_bindings: json.kpi_bindings.filter((b: any) => b.metric !== x.binding!.metric),
        }),
        projectDoc.filename,
      );
    });
    return { docId, source: edit(projectDoc.source, ...steps) };
  });
}

/** Rewrites only the rename occurrences explicitly selected by the user. */
export function rewriteReferences(docs: ProjectDoc[], refs: Reference[], newName: string): { docId: string; source: string }[] {
  const byDoc = new Map<string, Reference[]>();
  for (const ref of refs) byDoc.set(ref.docId, [...(byDoc.get(ref.docId) ?? []), ref]);
  return [...byDoc].map(([docId, list]) => {
    const projectDoc = docs.find(x => x.id === docId)!;
    let out = '';
    let at = 0;
    for (const reference of [...list].sort((a, b) => a.from - b.from)) {
      if (reference.from < at || reference.to === reference.from) continue;
      out += projectDoc.source.slice(at, reference.from) + newName;
      at = reference.to;
    }
    return { docId, source: out + projectDoc.source.slice(at) };
  });
}

/** Renames an import alias and updates concept references only in that ontology's declared files. */
export function renameUnitAlias(root: ProjectDoc, documents: readonly ProjectDoc[], previous: string, next: string): { docId: string; source: string }[] {
  if (previous === next) return [];
  if (!/^[A-Za-z0-9_]+$/.test(next)) throw new Error('An import alias uses letters, digits and underscores.');
  const data = parseDocument(root.source).toJS();
  const declarations = data?.[IMPORTS_PROPERTY];
  if (!Array.isArray(declarations)) throw new Error('The importing root is unavailable.');
  const index = declarations.findIndex(entry => entry.alias === previous);
  if (index < 0) throw new Error(`Import alias "${previous}" was not found.`);
  if (declarations.some(entry => entry.alias === next)) throw new Error(`Import alias "${next}" already exists.`);
  const names = new Set<string>(declarations[index].concepts.map((concept: string) => `${previous}.${concept}`));
  const rewrite = (reference: string) => (names.has(reference) ? next + reference.slice(previous.length) : reference);
  const parts: string[] = Array.isArray(data[INCLUDES_PROPERTY]) ? data[INCLUDES_PROPERTY].filter((path: unknown) => typeof path === 'string') : [];
  const byPath = new Map(documents.map(document => [document.path, document]));
  return [
    root,
    ...parts.map(path => {
      const document = byPath.get(path);
      if (!document) throw new Error('The ontology set is unavailable.');
      return document;
    }),
  ].flatMap((document, documentIndex) => {
    const steps = unitAliasPatches(document, rewrite);
    if (documentIndex === 0) steps.push(text => valuePatches(text, [IMPORTS_PROPERTY, index, 'alias'], next, document.filename));
    return steps.length ? [{ docId: document.id, source: edit(document.source, ...steps) }] : [];
  });
}

function unitAliasPatches(document: ProjectDoc, rewrite: (reference: string) => string): ((text: string) => Patch[])[] {
  const parsed = parseDocument(document.source);
  const data = parsed.toJS();
  const steps: ((text: string) => Patch[])[] = [];
  const quote = (name: string) =>
    name
      .split('.')
      .map(part => '"' + part.replaceAll('"', '""') + '"')
      .join('.');
  if (!Array.isArray(data?.ontology)) return [];
  const updated = data.ontology.map((concept: Record<string, unknown>) => rewriteConceptReferences(concept, rewrite, quote));
  for (const scalar of scalars(parsed)) {
    if (scalar.path[0] !== 'ontology') continue;
    const replacement = scalar.path.slice(1).reduce<unknown>((value, key) => (value && typeof value === 'object' ? Reflect.get(value, key) : undefined), updated);
    if (typeof replacement !== 'string' || replacement === scalar.value) continue;
    steps.push(text => valuePatches(text, scalar.path, replacement, document.filename));
  }
  return steps;
}
