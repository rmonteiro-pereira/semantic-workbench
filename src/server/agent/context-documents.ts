// Parses stored documents and lists the mappings, ontologies and semantic models they define.
import { inspect, inspectOntologyUnit } from '../../shared/core/model';
import { rdfSyntax } from '../../shared/validation/rdf';
import { isMapping } from '../../shared/mappings/mapping-schema';
import { documentForAgents } from '../../shared/tessera/agent-view';
import { INCLUDES_PROPERTY } from '../../shared/tessera/additions/includes';
import { IMPORTS_PROPERTY } from '../../shared/tessera/additions/imports';
import { PART_PROPERTY } from '../../shared/tessera/additions/part';
import { combineUnit } from '../../shared/tessera/unit-model';
import { readUnitStructure } from '../../shared/tessera/unit-structure';
import type { StoredDocument } from './context-types';
type UnitEvidence = ReadonlyMap<string, { doc: StoredDocument; path: (string | number)[] }>;

/** Holds an agent-safe definition and optional evidence for its original part files. */
export type Parsed = { doc: StoredDocument; data: any; unitEvidence?: UnitEvidence };

/** Identifies one ontology or semantic model in the agent catalog. */
export type Target = { doc: StoredDocument; data: any; path: (string | number)[]; unitEvidence?: UnitEvidence };

function parseOne(doc: StoredDocument): Parsed {
  try {
    if (rdfSyntax(doc.source, doc.filename)) return { doc, data: null };
    const model = inspect(doc.source, doc.filename);
    return { doc, data: 'document' in model ? model.document : null };
  } catch {
    return { doc, data: null };
  }
}

function projectPathOf(doc: StoredDocument) {
  return doc.project && doc.id.startsWith(doc.project + '/') ? doc.id.slice(doc.project.length + 1) : doc.filename;
}

function composeAgentUnits(documents: Parsed[]) {
  const byPath = new Map(documents.map(entry => [projectPathOf(entry.doc), entry]));
  const structure = readUnitStructure([...byPath].map(([path, entry]) => ({ path, data: entry.data })));
  const replacements = new Map<string, Parsed>();
  for (const unit of structure.units) {
    const paths = new Set([unit.root.path, ...unit.parts.map(part => part.path)]);
    if (structure.findings.some(finding => finding.severity === 'error' && finding.files.some(path => paths.has(path)))) continue;
    const root = byPath.get(unit.root.path)!;
    const imported = Boolean(root.data[IMPORTS_PROPERTY]?.length);
    if (imported && !root.doc.publishedInterfaces?.length) continue;
    if (!imported && !root.data[INCLUDES_PROPERTY]?.length) continue;
    const combined = combineUnit(unit);
    const unitEvidence = new Map([...combined.itemSources].map(([key, source]) => [key, { doc: byPath.get(source.file)!.doc, path: source.path }]));
    const data = imported ? inspectOntologyUnit(unit, undefined, root.doc.publishedInterfaces).document : combined.ontology;
    replacements.set(root.doc.id, { ...root, data: documentForAgents(data), unitEvidence });
  }
  return documents.flatMap(entry => {
    if (entry.data?.[PART_PROPERTY] === true) return [];
    if (entry.data?.[INCLUDES_PROPERTY]?.length || entry.data?.[IMPORTS_PROPERTY]?.length) {
      const composed = replacements.get(entry.doc.id);
      return composed ? [composed] : [];
    }
    return [{ ...entry, data: documentForAgents(entry.data) }];
  });
}

/** Reads the caller's published documents as a catalog of complete ontologies and independent files. */
export function parseDocuments(documents: StoredDocument[]): Parsed[] {
  const projects = new Map<string | undefined, Parsed[]>();
  for (const doc of documents) {
    const entries = projects.get(doc.project) ?? [];
    entries.push(parseOne(doc));
    projects.set(doc.project, entries);
  }
  const parsed = new Map([...projects.values()].flatMap(composeAgentUnits).map(entry => [entry.doc.id, entry]));
  return documents.flatMap(doc => parsed.get(doc.id) ?? []);
}
// References can target standalone models or models inside legacy wrappers by logical name.
export function targets(parsed: Parsed[], kind: 'ontology' | 'semantic'): Target[] {
  return parsed.flatMap(parsedDocument => {
    if (!parsedDocument.data || isMapping(parsedDocument.data)) return [];
    if (kind === 'ontology') return Array.isArray(parsedDocument.data.ontology) ? [{ ...parsedDocument, path: [] }] : [];
    if (Array.isArray(parsedDocument.data.datasets)) return [{ doc: parsedDocument.doc, data: parsedDocument.data, path: [] }];
    return Array.isArray(parsedDocument.data.semantic_model)
      ? parsedDocument.data.semantic_model.flatMap((m: any, i: number) => (m && Array.isArray(m.datasets) ? [{ doc: parsedDocument.doc, data: m, path: ['semantic_model', i] }] : []))
      : [];
  });
}
export const identity = (target: Target) => {
  const name = target.data.name ?? '(unnamed)';
  const project = target.doc.project;
  const projectPrefix = project ? `${project}/` : '';
  const file = project ? target.doc.id.slice(project.length + 1) : target.doc.filename;
  const pointer = target.path.length ? '#/' + target.path.join('/') : '';
  return `"${name}" in ${projectPrefix}${file}${pointer}`;
};
export function mappingEntries(parsed: Parsed[]) {
  return parsed.flatMap(parsedDocument => {
    if (isMapping(parsedDocument.data))
      return [
        {
          id: parsedDocument.doc.id,
          doc: parsedDocument.doc,
          data: parsedDocument.data,
          ontology: null as Parsed | null,
          path: [] as (string | number)[],
        },
      ];
    return (parsedDocument.data?.ontology_mappings ?? []).map((mappingEntry: any, i: number) => ({
      id: `${parsedDocument.doc.id}#ontology_mappings/${i}`,
      doc: parsedDocument.doc,
      data: mappingEntry,
      ontology: parsedDocument,
      path: ['ontology_mappings', i] as (string | number)[],
    }));
  });
}
export type Entry = ReturnType<typeof mappingEntries>[number] & { semanticPath?: (string | number)[] };
