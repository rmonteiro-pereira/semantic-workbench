// Suggests project moves from exact references, shared IRIs, and matching physical sources. Files
// move only after the user accepts a suggestion.
import { posix } from 'node:path';
import { validateInput } from '../../shared/validation/input';
import { isMapping } from '../../shared/mappings/mapping-schema';
import { documentKeys } from '../../shared/core/references';
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
  if (doc && isMapping(doc)) facts.refs.push(...[doc.ontology_ref?.name, doc.semantic_model_ref?.name].filter(text));
  if (doc && !isMapping(doc) && (model.kind === 'Ossie ontology' || model.kind === 'Ossie semantic')) {
    if (text(doc.name)) facts.names.push(doc.name);
    let embedded: any[];
    if (Array.isArray(doc.semantic_model)) {
      embedded = doc.semantic_model;
    } else if (doc.semantic_model) {
      embedded = [doc.semantic_model];
    } else {
      embedded = [];
    }
    for (const embeddedModel of embedded) if (text(embeddedModel?.name)) facts.names.push(embeddedModel.name);
  }
  for (const key of documentKeys(model)) if (/^[a-z][a-z\d+.-]*:/i.test(key)) facts.iris.push(key);
  for (const entity of model.entities) {
    const data: any = entity.definition ?? {};
    if (model.kind === 'ODCS' && text(data.physicalName)) facts.physical.push(data.physicalName);
    if (model.kind === 'Ossie semantic' && text(data.source)) facts.sources.push(data.source);
  }
  for (const fact of Object.keys(facts) as (keyof FileFacts)[]) facts[fact] = [...new Set(facts[fact])];
  return facts;
}
/** Finds explicit relationships between two files in either direction. */
export function evidenceBetween(indexedFile: IndexedFile, otherFile: IndexedFile): Evidence[] {
  const out: Evidence[] = [];
  const other = { project: otherFile.project, path: otherFile.path };
  const match = (xs: string[], ys: string[]) => xs.filter(x => ys.some(y => sameName(x, y)));
  for (const name of match(indexedFile.facts.refs, otherFile.facts.names))
    out.push({
      kind: 'ossie-ref-name',
      detail: `${indexedFile.path} references "${name}", the name declared in ${otherFile.path}`,
      otherFile: other,
    });
  for (const name of match(indexedFile.facts.names, otherFile.facts.refs))
    out.push({
      kind: 'ossie-ref-name',
      detail: `${otherFile.path} references "${name}", the name declared in ${indexedFile.path}`,
      otherFile: other,
    });
  const iris = new Set(otherFile.facts.iris);
  const shared = indexedFile.facts.iris.filter(i => iris.has(i));
  if (shared.length)
    out.push({
      kind: 'shared-iri',
      detail: `${shared.length} IRI${shared.length === 1 ? '' : 's'} shared with ${otherFile.path}, for example ${shared[0]}`,
      otherFile: other,
    });
  for (const name of [...match(indexedFile.facts.physical, otherFile.facts.sources), ...match(indexedFile.facts.sources, otherFile.facts.physical)])
    out.push({
      kind: 'odcs-physical-name',
      detail: `physical name ${name} appears in ${indexedFile.path} and ${otherFile.path}`,
      otherFile: other,
    });
  return out;
}
/** Derives a stable suggestion identifier from the source file and target project. */
export const suggestionId = (project: string, path: string, target: string) => sha256(`${project}/${path}\u0000${target}`).slice(0, 20);
// Suggest moves only when evidence links to another project and none links within the source.
// Move from the smaller project, breaking ties by later registration, so isolated imports join
// the project they reference rather than pulling that project apart.
/** Suggests moves supported by cross-project evidence, excluding remembered rejections. */
export function inferSuggestions(files: IndexedFile[], rejected: Set<string>, order: string[] = []): Suggestion[] {
  const out: Suggestion[] = [];
  const size = new Map<string, number>();
  const rank = (p: string) => {
    const i = order.indexOf(p);
    return i < 0 ? order.length : i;
  };
  for (const file of files) size.set(file.project, (size.get(file.project) ?? 0) + 1);
  const smaller = (a: string, b: string) => size.get(a)! < size.get(b)! || (size.get(a) === size.get(b) && rank(a) > rank(b));
  for (const file of files) {
    const own = files.filter(o => o.project === file.project && o.path !== file.path);
    if (own.some(o => evidenceBetween(file, o).length)) continue;
    const byProject = new Map<string, Evidence[]>();
    for (const indexedFile of files)
      if (indexedFile.project !== file.project && smaller(file.project, indexedFile.project)) {
        const ev = evidenceBetween(file, indexedFile);
        if (ev.length) byProject.set(indexedFile.project, [...(byProject.get(indexedFile.project) ?? []), ...ev]);
      }
    for (const [target, evidence] of byProject)
      if (!rejected.has(`${file.hash}:${target}`))
        out.push({
          id: suggestionId(file.project, file.path, target),
          file: { project: file.project, path: file.path, hash: file.hash },
          targetProject: target,
          evidence,
        });
  }
  return out;
}
