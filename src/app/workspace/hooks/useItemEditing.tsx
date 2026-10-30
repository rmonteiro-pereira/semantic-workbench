/** Resolves editable targets and applies saved item changes across workspace views. */
import React, { useRef, useState } from 'react';
import type { KpiSummary } from '../../../server/agent/explain';
import type { Issue } from '../../../shared/validation/diagnostics';
import { openFragment } from '../../edit/fragment';
import { itemKindAt, type Choices, type ItemKind, type Path } from '../../../shared/edit/item-model';
import { type Saved } from '../../edit/ItemEditor';
import { isIri } from '../../edit/rdf-patch/index';
import { itemValue } from '../../../shared/edit/yaml-patch';
import type { CodeEditorHandle } from '../../editor/CodeEditor';
import type { Entity, Relationship } from '../../../shared/core/model';
import type { Doc } from '../../projects/api';
import { rdfSyntax } from '../../../shared/validation/rdf';
import type { ItemTarget, RdfTarget, ValidatedModel } from '../types';
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
  parsedDoc: (doc: Doc) => { hash: string; model: ValidatedModel; keys: Set<string> };
  docs: Doc[];
  currentRef: React.RefObject<Doc | null>;
  setCurrent: (next: Doc | null) => void;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  setDocs: React.Dispatch<React.SetStateAction<Doc[]>>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  refresh: () => Promise<Doc[]>;
  openDocument: (doc: Doc) => boolean;
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
  function rdfTarget(entity: Entity): RdfTarget | null {
    return current && currentIsRdf && entity.readOnlyForm && isIri(entity.id) && entity.kind !== 'Built-in concept'
      ? { docId: current.id, subject: entity.id, label: entity.name, kind: entity.kind }
      : null;
  }
  function rdfEdgeTarget(relationship: Relationship): RdfTarget | null {
    if (!current || !currentIsRdf) return null;
    const definition = relationship.data.definition;
    const subject = relationship.data.kind === 'OWL object property' ? definition?.iri : definition?.subject;
    const entity = model?.entities.find(x => x.id === subject);
    return subject && isIri(subject)
      ? {
          docId: current.id,
          subject,
          label: entity?.name ?? subject,
          kind: entity?.kind ?? 'RDF resource',
        }
      : null;
  }
  const docText = (id: string) => (id === current?.id ? source : (docsRef.current.get(id)?.source ?? ''));
  const modelOf = (id: string) =>
    id === current?.id
      ? model
      : (projectModels.get(id) ??
        (() => {
          const doc = docsRef.current.get(id);
          return doc ? parsedDoc(doc).model : null;
        })());
  const documentOf = (id: string) => (modelOf(id) as any)?.document;
  function entityTarget(entity: Entity): ItemTarget | null {
    if (!current || entity.readOnlyForm || !entity.path.length) return null;
    const kind = itemKindAt(documentOf(current.id), entity.path);
    return kind ? { docId: current.id, path: entity.path, kind } : null;
  }
  function relationshipTarget(relationship: Relationship): ItemTarget | null {
    if (!current || relationship.data.readOnlyForm || !relationship.data.path.length) return null;
    const kind = itemKindAt(documentOf(current.id), relationship.data.path);
    return kind ? { docId: current.id, path: relationship.data.path, kind } : null;
  }
  function choicesFor(id: string): Choices {
    const own = modelOf(id);
    const project = docsRef.current.get(id)?.project;
    const models = docs
      .filter(d => d.project === project)
      .map(d => modelOf(d.id))
      .filter(Boolean) as NonNullable<typeof model>[];
    const names = (m: typeof model, kinds: string[]) => (m?.entities ?? []).filter(e => kinds.includes(e.kind)).map(e => e.name);
    return {
      concepts: [...new Set(models.flatMap(m => names(m, ['EntityType', 'ValueType', 'Concept'])))].sort(),
      datasets: names(own, ['Dataset']),
      metrics: names(own, ['Metric']),
    };
  }
  const projectDocsOf = (id: string) => docs.filter(d => d.project === docsRef.current.get(id)?.project);
  // Saved item changes: every view follows the new bytes at once, then the folder scan confirms.
  function applySaved(saved: Saved[], label: string) {
    for (const savedItem of saved) {
      const doc = docsRef.current.get(savedItem.docId);
      if (!doc) continue;
      const next = { ...doc, source: savedItem.source, hash: savedItem.hash };
      docsRef.current.set(doc.id, next);
      if (currentRef.current?.id === doc.id) {
        setCurrent(next);
        setSource(savedItem.source);
      }
    }
    setDocs(old => old.map(d => docsRef.current.get(d.id) ?? d));
    setMessage(label);
    void refresh().catch(() => {});
  }
  function openSourceAt(id: string, line: number) {
    const doc = docsRef.current.get(id);
    if (doc && doc.id !== current?.id && !openDocument(doc)) return;
    setTab('source');
    setTimeout(() => sourceEditor.current?.goToLine(line), 60);
  }
  function editMappingItem(docId: string, path: Path) {
    const doc = docsRef.current.get(docId);
    if (!doc) return;
    const document = documentOf(docId);
    for (let length = path.length; length > 0; length--) {
      const prefix = path.slice(0, length);
      const kind = itemKindAt(document, prefix);
      if (kind && prefix.reduce((value, key) => value?.[key], document) != null) {
        if (doc.id !== current?.id && !openDocument(doc)) return;
        setEditing({ docId, path: prefix, kind });
        return;
      }
    }
    openSourceAtPath(docId, path);
  }
  // Opens the document in Source at the deepest part of the path that the text still has, or at the top.
  function openSourceAtPath(docId: string, path: Path) {
    const text = docText(docId);
    for (let length = path.length; length > 0; length--) {
      try {
        const fragment = openFragment(text, path.slice(0, length));
        openSourceAt(docId, fragment.line);
        return;
      } catch {}
    }
    openSourceAt(docId, 1);
  }
  function editKpi(kpiSummary: KpiSummary) {
    const id = `${kpiProject}/${kpiSummary.file}`;
    const doc = docsRef.current.get(id);
    if (!doc) return;
    const metrics = itemValue(docText(id), [...kpiSummary.modelPath, 'metrics']);
    const index = Array.isArray(metrics) ? metrics.findIndex((m: any) => m?.name === kpiSummary.name) : -1;
    if (index >= 0) setEditing({ docId: id, path: [...kpiSummary.modelPath, 'metrics', index], kind: 'metric' });
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
    openSourceAtPath,
    entityTarget,
    rdfTarget,
    relationshipTarget,
    rdfEdgeTarget,
  };
}
