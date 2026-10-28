/** Resolves editable targets and applies saved item changes across workspace views. */
import React, { useRef, useState } from 'react';
import type { KpiSummary } from '../server/agent/explain';
import type { Issue } from '../validation/diagnostics';
import { openFragment } from '../edit/fragment';
import { itemKindAt, type Choices, type ItemKind, type Path } from '../edit/item-model';
import { type Saved } from '../edit/ItemEditor';
import { isIri } from '../edit/rdf-patch/index';
import { itemValue } from '../edit/yaml-patch';
import type { CodeEditorHandle } from '../editor/CodeEditor';
import type { Entity, Relationship } from '../core/model';
import type { Doc } from '../projects/api';
import { rdfSyntax } from '../validation/rdf';
import type { ItemTarget, RdfTarget, ValidatedModel } from './types';
import { useSourceControl } from './useSourceControl';

type Options = {
  selectedProject: string;
  current: Doc | null;
  source: string;
  model: ValidatedModel;
  docsRef: React.RefObject<Map<string, Doc>>;
  projectModels: Map<
    string,
    | { kind: string; name: any; entities: Entity[]; edges: Relationship[]; issues: Issue[] }
    | {
        kind: string;
        layout: string | undefined;
        name: any;
        entities: Entity[];
        edges: Relationship[];
        issues: Issue[];
        document: any;
      }
  >;
  parsedDoc: (d: Doc) => { hash: string; model: ValidatedModel; keys: Set<string> };
  docs: Doc[];
  currentRef: React.RefObject<Doc | null>;
  setCurrent: (next: Doc | null) => void;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  setDocs: React.Dispatch<React.SetStateAction<Doc[]>>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  refresh: () => Promise<Doc[]>;
  openDocument: (d: Doc) => boolean;
  setTab: (next: string) => void;
  sourceEditor: React.RefObject<CodeEditorHandle | null>;
  kpiProject: string | null;
  entity: Entity | undefined;
  relationship: Relationship | undefined;
};
/** Manages item editing. */
export function useItemEditing({
  selectedProject,
  current,
  source,
  model,
  docsRef,
  projectModels,
  parsedDoc,
  docs,
  currentRef,
  setCurrent,
  setSource,
  setDocs,
  setMessage,
  refresh,
  openDocument,
  setTab,
  sourceEditor,
  kpiProject,
  entity,
  relationship,
}: Options) {
  // Item editing: the editor, add and delete dialogs work on one file of a project.

  const [editing, setEditing] = useState<ItemTarget | null>(null);
  const [adding, setAdding] = useState<{
    docId: string;
    kind?: ItemKind;
    owner?: Path;
    preset?: Record<string, any>;
  } | null>(null);
  const [deleting, setDeleting] = useState<ItemTarget | null>(null);
  const [wizard, setWizard] = useState<boolean | KpiSummary>(false);
  const { draftOf, setHistoryPath, historyPath } = useSourceControl({
    project: selectedProject,
    current,
    source,
  });
  // RDF, OWL and SHACL resources are edited by IRI; blank nodes go with their parent.

  const [rdfEditing, setRdfEditing] = useState<RdfTarget | null>(null);
  const [rdfAdding, setRdfAdding] = useState<string | null>(null);
  const [rdfDeleting, setRdfDeleting] = useState<RdfTarget | null>(null);
  const currentIsRdf = !!current && !!rdfSyntax(source, current.filename);
  function rdfTarget(e: Entity): RdfTarget | null {
    return current && currentIsRdf && e.readOnlyForm && isIri(e.id) && e.kind !== 'Built-in concept'
      ? { docId: current.id, subject: e.id, label: e.name, kind: e.kind }
      : null;
  }
  function rdfEdgeTarget(r: Relationship): RdfTarget | null {
    if (!current || !currentIsRdf) return null;
    const definitionValue = r.data.definition;
    const subject =
      r.data.kind === 'OWL object property' ? definitionValue?.iri : definitionValue?.subject;
    const e = model?.entities.find(x => x.id === subject);
    return subject && isIri(subject)
      ? { docId: current.id, subject, label: e?.name ?? subject, kind: e?.kind ?? 'RDF resource' }
      : null;
  }
  const docText = (id: string) =>
    id === current?.id ? source : (docsRef.current.get(id)?.source ?? '');
  const modelOf = (id: string) =>
    id === current?.id
      ? model
      : (projectModels.get(id) ??
        (() => {
          const documentValue = docsRef.current.get(id);
          return documentValue ? parsedDoc(documentValue).model : null;
        })());
  const documentOf = (id: string) => (modelOf(id) as any)?.document;
  function entityTarget(e: Entity): ItemTarget | null {
    if (!current || e.readOnlyForm || !e.path.length) return null;
    const kind = itemKindAt(documentOf(current.id), e.path);
    return kind ? { docId: current.id, path: e.path, kind } : null;
  }
  function relationshipTarget(r: Relationship): ItemTarget | null {
    if (!current || r.data.readOnlyForm || !r.data.path.length) return null;
    const kind = itemKindAt(documentOf(current.id), r.data.path);
    return kind ? { docId: current.id, path: r.data.path, kind } : null;
  }
  function choicesFor(id: string): Choices {
    const own = modelOf(id);
    const project = docsRef.current.get(id)?.project;
    const models = docs
      .filter(d => d.project === project)
      .map(d => modelOf(d.id))
      .filter(Boolean) as NonNullable<typeof model>[];
    const names = (m: typeof model, kinds: string[]) =>
      (m?.entities ?? []).filter(e => kinds.includes(e.kind)).map(e => e.name);
    return {
      concepts: [
        ...new Set(models.flatMap(m => names(m, ['EntityType', 'ValueType', 'Concept']))),
      ].sort(),
      datasets: names(own, ['Dataset']),
      metrics: names(own, ['Metric']),
    };
  }
  const projectDocsOf = (id: string) =>
    docs.filter(d => d.project === docsRef.current.get(id)?.project);
  // Saved item changes: every view follows the new bytes at once, then the folder scan confirms.
  function applySaved(saved: Saved[], label: string) {
    for (const savedItem of saved) {
      const documentValue = docsRef.current.get(savedItem.docId);
      if (!documentValue) continue;
      const next = { ...documentValue, source: savedItem.source, hash: savedItem.hash };
      docsRef.current.set(documentValue.id, next);
      if (currentRef.current?.id === documentValue.id) {
        setCurrent(next);
        setSource(savedItem.source);
      }
    }
    setDocs(old => old.map(d => docsRef.current.get(d.id) ?? d));
    setMessage(label);
    void refresh().catch(() => {});
  }
  function openSourceAt(id: string, line: number) {
    const documentValue = docsRef.current.get(id);
    if (documentValue && documentValue.id !== current?.id && !openDocument(documentValue)) return;
    setTab('source');
    setTimeout(() => sourceEditor.current?.goToLine(line), 60);
  }
  function editMappingItem(docId: string, path: Path) {
    const documentValue = docsRef.current.get(docId);
    if (!documentValue) return;
    const document = documentOf(docId);
    const text = docText(docId);
    for (let length = path.length; length > 0; length--) {
      const prefix = path.slice(0, length);
      const kind = itemKindAt(document, prefix);
      if (kind && prefix.reduce((value, key) => value?.[key], document) != null) {
        if (documentValue.id !== current?.id && !openDocument(documentValue)) return;
        setEditing({ docId, path: prefix, kind });
        return;
      }
    }
    // A non-editable finding still leads to the nearest source location available.
    for (let length = path.length; length > 0; length--) {
      try {
        const fragment = openFragment(text, path.slice(0, length));
        openSourceAt(docId, fragment.line);
        return;
      } catch {}
    }
    openSourceAt(docId, 1);
  }
  function editKpi(k: KpiSummary) {
    const id = `${kpiProject}/${k.file}`;
    const documentValue = docsRef.current.get(id);
    if (!documentValue) return;
    const metrics = itemValue(docText(id), [...k.modelPath, 'metrics']);
    const index = Array.isArray(metrics) ? metrics.findIndex((m: any) => m?.name === k.name) : -1;
    if (index >= 0)
      setEditing({ docId: id, path: [...k.modelPath, 'metrics', index], kind: 'metric' });
  }
  const latest = useRef<() => void>(() => {});
  latest.current = () => {
    function getSelectedItemTarget() {
      if (entity) {
        return entityTarget(entity);
      }
      if (relationship) {
        return relationshipTarget(relationship);
      }
      return null;
    }

    function getSelectedRdfTarget() {
      if (entity) {
        return rdfTarget(entity);
      }
      if (relationship) {
        return rdfEdgeTarget(relationship);
      }
      return null;
    }

    const target = getSelectedItemTarget();
    if (target) {
      setEditing(target);
      return;
    }
    const rdfItem = getSelectedRdfTarget();
    if (rdfItem) setRdfEditing(rdfItem);
  };

  return {
    latest,
    currentIsRdf,
    draftOf,
    editing,
    docText,
    projectDocsOf,
    choicesFor,
    setEditing,
    applySaved,
    setAdding,
    setDeleting,
    openSourceAt,
    adding,
    documentOf,
    deleting,
    rdfEditing,
    setRdfEditing,
    setRdfDeleting,
    rdfAdding,
    setRdfAdding,
    rdfDeleting,
    wizard,
    setWizard,
    setHistoryPath,
    historyPath,
    editKpi,
    editMappingItem,
    entityTarget,
    rdfTarget,
    relationshipTarget,
    rdfEdgeTarget,
  };
}
