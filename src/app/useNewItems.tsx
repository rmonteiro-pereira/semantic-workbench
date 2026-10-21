/** Builds creation actions with explanations for unsupported document kinds. */
import React from 'react';
import type { Path } from '../edit/item-model';
import { addableKinds, kindLabel, type ItemKind } from '../edit/item-model';
import type { Doc } from '../projects/api';
import { type MenuItem } from '../projects/Menu';
import type { ValidatedModel } from './types';

type Options = {
  model: ValidatedModel;
  current: Doc | null;
  currentIsRdf: boolean;
  setAdding: React.Dispatch<
    React.SetStateAction<{
      docId: string;
      kind?: ItemKind | undefined;
      owner?: Path | undefined;
      preset?: Record<string, any> | undefined;
    } | null>
  >;
  setRdfAdding: React.Dispatch<React.SetStateAction<string | null>>;
};
/** Manages new items. */
export function useNewItems({ model, current, currentIsRdf, setAdding, setRdfAdding }: Options) {
  // New ▾: one Add dialog per kind; kinds the open file cannot hold stay listed with the reason.
  function newItems(): MenuItem[] {
    function getUnavailableReason() {
      if (!current) {
        return 'Open a file first.';
      }
      if (!model) {
        return 'The open file has errors; repair it in Source first.';
      }
      return '';
    }

    const doc = (model as any)?.document;
    const kinds = current && model && !currentIsRdf ? addableKinds(doc) : [];
    const none = getUnavailableReason();
    const item = (kind: ItemKind, why: string): MenuItem => ({
      label: `Add ${kindLabel[kind].toLowerCase()}…`,
      disabled: none || (kinds.includes(kind) ? false : why),
      run: () => {
        if (current) setAdding({ docId: current.id, kind });
      },
    });
    return [
      item('concept', 'Open an Ossie ontology to add a concept.'),
      item('dataset', 'Open an Ossie semantic model to add a dataset.'),
      item('join', 'Open an Ossie semantic model to add a dataset relationship.'),
      item('metric', 'Open an Ossie semantic model to add a metric.'),
      item('odcs-object', 'Open an ODCS contract to add a contract object.'),
      item('concept-mapping', 'Open an Ossie mapping document to add a concept mapping.'),
      {
        label: 'Add RDF resource…',
        disabled:
          none ||
          (currentIsRdf
            ? false
            : 'Open a Turtle, N-Triples, RDF/XML or N3 file to add a resource.'),
        run: () => {
          if (current) setRdfAdding(current.id);
        },
      },
    ];
  }

  return { newItems };
}
