/** Selects contract lineage centers and routes navigation into related documents. */
import React, { useEffect, useMemo } from 'react';
import { useRecordedState } from './useRecordedState';
import type { WalkAction } from '../../graph/walk';
import { buildLineage, defaultCenter, type LineageCard } from '../../odcs/lineage';
import { projectFiles, projectRevision } from '../../odcs/project-files';
import type { Doc } from '../../projects/api';
import type { ValidatedModel } from '../types';

type Options = {
  model: ValidatedModel;
  current: Doc | null;
  docs: Doc[];
  tab: string;
  setTab: (next: string) => void;
  openDocument: (d: Doc) => boolean;
  parsedDoc: (d: Doc) => { hash: string; model: ValidatedModel; keys: Set<string> };
  dispatchWalk: React.ActionDispatch<[action: WalkAction]>;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
};
/** Manages lineage. */
export function useLineage({
  model,
  current,
  docs,
  tab,
  setTab,
  openDocument,
  parsedDoc,
  dispatchWalk,
  setSelected,
}: Options) {
  function getMappingId() {
    if (current && (isMappingDoc || isConsolidated)) {
      if (isMappingDoc) {
        return current.id;
      }
      return `${current.id}#ontology_mappings/0`;
    }
    return '';
  }

  function getLineageCenterId() {
    if (lineage) {
      if (lineage.cards.has(lineageCenter)) {
        return lineageCenter;
      }
      return defaultCenter(lineage);
    }
    return '';
  }

  // ODCS contract overview and dataset pages: the object whose page is open, per document.
  const isContract = model?.kind === 'ODCS';
  // Mapping documents and consolidated files (embedded ontology_mappings) get the mapping canvas
  // on the Graph tab; a consolidated file can switch to its ontology graph.
  const isMappingDoc = model?.kind === 'Ossie mappings';
  const isConsolidated =
    !isMappingDoc &&
    Array.isArray((model as any)?.document?.ontology_mappings) &&
    (model as any).document.ontology_mappings.length > 0;
  const [mappingView, setMappingView] = useRecordedState<'mapping' | 'ontology'>(
    'lineage.mappingView',
    'mapping',
  );
  useEffect(() => setMappingView('mapping'), [current?.id]);
  const mappingId = getMappingId();
  const graphViewSwitch = isConsolidated ? (
    <span className="graph-view-switch" role="group" aria-label="Graph view">
      {(['mapping', 'ontology'] as const).map(v => (
        <button key={v} aria-pressed={mappingView === v} onClick={() => setMappingView(v)}>
          {v === 'mapping' ? 'Mapping graph' : 'Ontology graph'}
        </button>
      ))}
    </span>
  ) : null;
  const [contractObject, setContractObject] = useRecordedState<string | null>(
    'contract.object',
    null,
  );
  // Column-level lineage of the open contract, built from the project's saved files.
  const lineageDocs = isContract && current ? docs.filter(d => d.project === current.project) : [];
  const lineageRev = isContract && current ? projectRevision(lineageDocs) : '';
  const lineage = useMemo(
    () =>
      isContract && current
        ? buildLineage(projectFiles(lineageDocs), current.path, lineageRev)
        : null,
    [isContract, current?.project, current?.path, lineageRev],
  );
  const lineageKey = current ? `workbench:lineage-center:${current.id}` : '';
  const [lineageCenter, setLineageCenter] = useRecordedState('lineage.center', '');
  useEffect(() => {
    if (!lineage) {
      setLineageCenter('');
      return;
    }
    let stored = '';
    try {
      stored = localStorage.getItem(lineageKey) ?? '';
    } catch {}
    setLineageCenter(lineage.cards.has(stored) ? stored : defaultCenter(lineage));
  }, [lineage?.contract, current?.id, !!lineage]);
  // The stored centre belongs to the previous contract for one render after switching files.
  const lineageCenterId = getLineageCenterId();
  const lineageShown =
    tab === 'fullgraph' &&
    ((isContract && !!lineage && !!lineageCenterId) || (!!mappingId && mappingView === 'mapping'));
  function lineageCenterChanged(id: string) {
    try {
      localStorage.setItem(lineageKey, id);
    } catch {}
  }
  function openInLineage(name: string) {
    if (!lineage || !current) return;
    const id = `object:${current.path}#${name}`;
    try {
      localStorage.setItem(lineageKey, id);
    } catch {}
    setLineageCenter(id);
    setTab('fullgraph');
  }
  // Walking into a semantic model or metric continues in that file's Neighborhood.
  function continueInNeighborhood(card: LineageCard) {
    const documentValue = docs.find(x => x.project === current?.project && x.path === card.file);
    if (!documentValue || !openDocument(documentValue)) return;
    const name = card.kind === 'metric' ? card.id.slice(card.id.lastIndexOf('/') + 1) : card.label;
    const target = parsedDoc(documentValue).model?.entities.find(
      e => e.name === name && (e.kind === 'Dataset' || e.kind === 'Metric'),
    );
    setTab('neighborhood');
    if (target) {
      dispatchWalk({
        type: 'push',
        step: { doc: documentValue.id, center: target.id, name: target.name },
      });
      setSelected(target.id);
    }
  }
  useEffect(() => setContractObject(null), [current?.id]);
  useEffect(() => {
    if (tab === 'contract' && model && !isContract) setTab('fullgraph');
  }, [tab, isContract, !!model]);

  return {
    isContract,
    lineageShown,
    contractObject,
    setContractObject,
    openInLineage,
    continueInNeighborhood,
    mappingId,
    mappingView,
    graphViewSwitch,
    lineage,
    lineageCenterId,
    lineageCenterChanged,
  };
}
