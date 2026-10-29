/** Maintains navigation between neighborhood centers and related files. */
import React from 'react';
import type { Walk, WalkAction } from '../../graph/walk';
import type { Relationship } from '../../../shared/core/model';
import type { CrossFileTarget } from '../../graph/NeighborhoodGraph';
import { type Doc } from '../../projects/api';
import type { ValidatedModel } from '../types';

type Options = {
  walk: Walk;
  current: Doc | null;
  docsRef: React.RefObject<Map<string, Doc>>;
  openDocument: (doc: Doc) => boolean;
  setTab: (next: string) => void;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  dispatchWalk: React.ActionDispatch<[action: WalkAction]>;
  neighborhoodFocus: string;
  model: ValidatedModel;
  selected: string;
  relationship: Relationship | undefined;
  setNeighborhoodFocus: (id: string) => void;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
};
/** Manages walk navigation. */
export function useWalkNavigation({
  walk,
  current,
  docsRef,
  openDocument,
  setTab,
  setSelected,
  setSelectedEdge,
  dispatchWalk,
  neighborhoodFocus,
  model,
  selected,
  relationship,
  setNeighborhoodFocus,
  setSearch,
}: Options) {
  function walkTo(index: number) {
    const step = walk.steps[index];
    if (!step) return;
    if (step.doc !== current?.id) {
      const document = docsRef.current.get(step.doc);
      if (!document || !openDocument(document)) return;
      setTab('neighborhood');
    }
    setSelected(step.center);
    setSelectedEdge('');
    dispatchWalk({ type: 'jump', index });
  }
  function crossTo(crossFileTarget: CrossFileTarget) {
    const doc = docsRef.current.get(crossFileTarget.doc);
    if (!doc || !current) return;
    const from = walk.steps[walk.index];
    if (!openDocument(doc)) return;
    if (!from || from.doc !== current.id || from.center !== neighborhoodFocus) {
      const centerEntity = model?.entities.find(e => e.id === (neighborhoodFocus || selected));
      if (centerEntity)
        dispatchWalk({
          type: 'push',
          step: { doc: current.id, center: centerEntity.id, name: centerEntity.name },
        });
    }
    dispatchWalk({
      type: 'push',
      step: {
        doc: crossFileTarget.doc,
        center: crossFileTarget.entity,
        name: crossFileTarget.name,
        via: { id: 'file', label: 'same definition' },
      },
    });
    setTab('neighborhood');
    setSelected(crossFileTarget.entity);
    setSelectedEdge('');
  }
  function showNeighborhood(id = selected || relationship?.source || neighborhoodFocus) {
    setNeighborhoodFocus(id);
    setSearch('');
    setTab('neighborhood');
  }

  return { showNeighborhood, walkTo, crossTo };
}
