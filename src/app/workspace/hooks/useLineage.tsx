/** Selects contract lineage centers and routes navigation into related documents. */
import { saveCenterPreference } from '../../graph/center-preference';
import { resolveInModel } from '../../../shared/core/model-addresses';
import { displayName, parseAddress } from '../../../shared/core/item-address';
import { legacyLineageKey } from '../../../shared/core/item-key-adapters';
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
  openDocument: (doc: Doc) => boolean;
  parsedDoc: (doc: Doc) => { hash: string; model: ValidatedModel; keys: Set<string> };
  dispatchWalk: React.ActionDispatch<[action: WalkAction]>;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setMessage: (message: string) => void;
};
/** Manages lineage. */
export function useLineage({ model, current, docs, tab, setTab, openDocument, parsedDoc, dispatchWalk, setSelected, setMessage }: Options) {
  function getMappingId() {
    if (current && (isMappingDoc || isConsolidated)) {
      if (isMappingDoc) {
        return current.id;
      }
      return `${current.id}#ontology_mappings/0`;
    }
    return '';
  }

  function storedCenter(id: string) {
    const parsed = parseAddress(id);
    if (!parsed.ok) return id;
    const direct = legacyLineageKey(parsed.address);
    if (direct) return direct;
    const document = docs.find(doc => doc.project === current?.project && doc.path === parsed.address.document?.join('/'));
    const inspected = document ? parsedDoc(document).model : null;
    const resolved = inspected && 'document' in inspected ? resolveInModel(inspected.document, parsed.address) : null;
    return legacyLineageKey(parsed.address, resolved?.status === 'found' ? resolved.item.path : undefined);
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
  const isConsolidated = !isMappingDoc && Array.isArray((model as any)?.document?.ontology_mappings) && (model as any).document.ontology_mappings.length > 0;
  const [mappingView, setMappingView] = useRecordedState<'mapping' | 'ontology'>('lineage.mappingView', 'mapping');
  useEffect(() => setMappingView('mapping'), [current?.id]);
  const mappingId = getMappingId();
  const graphViewSwitch = isConsolidated ? (
    <span className="graph-view-switch" role="group" aria-label="Graph view">
      {(['mapping', 'ontology'] as const).map(value => (
        <button key={value} aria-pressed={mappingView === value} onClick={() => setMappingView(value)}>
          {value === 'mapping' ? 'Mapping graph' : 'Ontology graph'}
        </button>
      ))}
    </span>
  ) : null;
  const [contractObject, setContractObject] = useRecordedState<string | null>('contract.object', null);
  // Column-level lineage of the open contract, built from the project's saved files.
  const lineageDocs = isContract && current ? docs.filter(d => d.project === current.project) : [];
  const lineageRev = isContract && current ? projectRevision(lineageDocs) : '';
  const lineage = useMemo(() => (isContract && current ? buildLineage(projectFiles(lineageDocs), current.path, lineageRev) : null), [isContract, current?.project, current?.path, lineageRev]);
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
    const matches = stored ? [...lineage.cards.values()].filter(card => card.id === stored || storedCenter(card.id) === stored) : [];
    setLineageCenter(matches.length === 1 ? matches[0].id : defaultCenter(lineage));
    if (matches.length === 1 && matches[0].id !== stored) lineageCenterChanged(matches[0].id);
  }, [lineage?.contract, current?.id, !!lineage]);
  // The stored centre belongs to the previous contract for one render after switching files.
  const lineageCenterId = getLineageCenterId();
  const lineageShown = tab === 'fullgraph' && ((isContract && !!lineage && !!lineageCenterId) || (!!mappingId && mappingView === 'mapping'));
  function lineageCenterChanged(id: string) {
    try {
      saveCenterPreference(localStorage, lineageKey, id);
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : 'The canvas preference could not be saved.');
    }
  }
  function openInLineage(name: string) {
    if (!lineage || !current) return;
    const id = [...lineage.cards.values()].find(card => card.kind === 'object' && card.file === current.path && card.label === name)?.id;
    if (!id) return;
    lineageCenterChanged(id);
    setLineageCenter(id);
    setTab('fullgraph');
  }
  // Walking into a semantic model or metric continues in that file's Neighborhood.
  function continueInNeighborhood(card: LineageCard) {
    const doc = docs.find(x => x.project === current?.project && x.path === card.file);
    if (!doc || !openDocument(doc)) return;
    const parsed = parseAddress(card.id);
    const name = parsed.ok ? displayName(parsed.address) : card.label;
    const target = parsedDoc(doc).model?.entities.find(e => e.name === name && (e.kind === 'Dataset' || e.kind === 'Metric'));
    setTab('neighborhood');
    if (target) {
      dispatchWalk({
        type: 'push',
        step: { doc: doc.id, center: target.id, name: target.name },
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
