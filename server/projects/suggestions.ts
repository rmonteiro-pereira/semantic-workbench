// Suggests project moves from exact references, shared IRIs, and matching physical sources. Files
// move only after the user accepts a suggestion.
import { posix } from 'node:path';
import { validateInput } from '../../src/input';
import { isMapping } from '../../src/mapping-schema';
import { documentKeys } from '../../src/references';
import { sha256 } from './atomic';
/** Names, references, IRIs, and physical sources used as grouping evidence. */
export type FileFacts = {
  names: string[];
  refs: string[];
  iris: string[];
  physical: string[];
  sources: string[];
};
/** The exact relationship supporting a suggested project move. */
export type EvidenceKind = 'ossie-ref-name' | 'shared-iri' | 'odcs-physical-name';
/** A matching fact and the other file that supports a grouping suggestion. */
export type Evidence = {
  kind: EvidenceKind;
  detail: string;
  otherFile: { project: string; path: string };
};
/** A proposed file move with its current hash, target project, and supporting evidence. */
export type Suggestion = {
  id: string;
  file: { project: string; path: string; hash: string };
  targetProject: string;
  evidence: Evidence[];
};
/** A file’s project, path, content hash, and extracted grouping facts. */
export type IndexedFile = { project: string; path: string; hash: string; facts: FileFacts };
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
/** Compares names exactly and case-sensitively; similarity is not grouping evidence. */
export const sameName = (a: string, b: string) => a === b;
/** Extracts grouping evidence from validated document source. */
export function factsOf(source: string, path: string): FileFacts {
  const facts: FileFacts = { names: [], refs: [], iris: [], physical: [], sources: [] };
  const model = validateInput(source, posix.basename(path)).model;
  if (!model) return facts;
  const doc: any = 'document' in model ? model.document : null;
  if (doc && isMapping(doc))
    facts.refs.push(...[doc.ontology_ref?.name, doc.semantic_model_ref?.name].filter(text));
  if (
    doc &&
    !isMapping(doc) &&
    (model.kind === 'Ossie ontology' || model.kind === 'Ossie semantic')
  ) {
    if (text(doc.name)) facts.names.push(doc.name);
    const embedded = Array.isArray(doc.semantic_model)
      ? doc.semantic_model
      : doc.semantic_model
        ? [doc.semantic_model]
        : [];
    for (const m of embedded) if (text(m?.name)) facts.names.push(m.name);
  }
  for (const key of documentKeys(model)) if (/^[a-z][a-z\d+.-]*:/i.test(key)) facts.iris.push(key);
  for (const e of model.entities) {
    const d: any = e.definition ?? {};
    if (model.kind === 'ODCS' && text(d.physicalName)) facts.physical.push(d.physicalName);
    if (model.kind === 'Ossie semantic' && text(d.source)) facts.sources.push(d.source);
  }
  for (const k of Object.keys(facts) as (keyof FileFacts)[]) facts[k] = [...new Set(facts[k])];
  return facts;
}
/** Finds explicit relationships between two files in either direction. */
export function evidenceBetween(a: IndexedFile, b: IndexedFile): Evidence[] {
  const out: Evidence[] = [];
  const other = { project: b.project, path: b.path };
  const match = (xs: string[], ys: string[]) => xs.filter(x => ys.some(y => sameName(x, y)));
  for (const name of match(a.facts.refs, b.facts.names))
    out.push({
      kind: 'ossie-ref-name',
      detail: `${a.path} references "${name}", the name declared in ${b.path}`,
      otherFile: other,
    });
  for (const name of match(a.facts.names, b.facts.refs))
    out.push({
      kind: 'ossie-ref-name',
      detail: `${b.path} references "${name}", the name declared in ${a.path}`,
      otherFile: other,
    });
  const iris = new Set(b.facts.iris);
  const shared = a.facts.iris.filter(i => iris.has(i));
  if (shared.length)
    out.push({
      kind: 'shared-iri',
      detail: `${shared.length} IRI${shared.length === 1 ? '' : 's'} shared with ${b.path}, for example ${shared[0]}`,
      otherFile: other,
    });
  for (const name of [
    ...match(a.facts.physical, b.facts.sources),
    ...match(a.facts.sources, b.facts.physical),
  ])
    out.push({
      kind: 'odcs-physical-name',
      detail: `physical name ${name} appears in ${a.path} and ${b.path}`,
      otherFile: other,
    });
  return out;
}
/** Derives a stable suggestion identifier from the source file and target project. */
export const suggestionId = (project: string, path: string, target: string) =>
  sha256(`${project}/${path}\u0000${target}`).slice(0, 20);
// Suggest moves only when evidence links to another project and none links within the source.
// Move from the smaller project, breaking ties by later registration, so isolated imports join
// the project they reference rather than pulling that project apart.
/** Suggests moves supported by cross-project evidence, excluding remembered rejections. */
export function inferSuggestions(
  files: IndexedFile[],
  rejected: Set<string>,
  order: string[] = [],
): Suggestion[] {
  const out: Suggestion[] = [];
  const size = new Map<string, number>();
  const rank = (p: string) => {
    const i = order.indexOf(p);
    return i < 0 ? order.length : i;
  };
  for (const f of files) size.set(f.project, (size.get(f.project) ?? 0) + 1);
  const smaller = (a: string, b: string) =>
    size.get(a)! < size.get(b)! || (size.get(a) === size.get(b) && rank(a) > rank(b));
  for (const f of files) {
    const own = files.filter(o => o.project === f.project && o.path !== f.path);
    if (own.some(o => evidenceBetween(f, o).length)) continue;
    const byProject = new Map<string, Evidence[]>();
    for (const o of files)
      if (o.project !== f.project && smaller(f.project, o.project)) {
        const ev = evidenceBetween(f, o);
        if (ev.length) byProject.set(o.project, [...(byProject.get(o.project) ?? []), ...ev]);
      }
    for (const [target, evidence] of byProject)
      if (!rejected.has(`${f.hash}:${target}`))
        out.push({
          id: suggestionId(f.project, f.path, target),
          file: { project: f.project, path: f.path, hash: f.hash },
          targetProject: target,
          evidence,
        });
  }
  return out;
}
