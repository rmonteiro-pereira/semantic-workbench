/** Presentation and event handling for contract view. */
import { useCapabilities } from '../auth/Capabilities';
import React from 'react';
import type { Saved } from '../edit/ItemEditor';
import { ContractOverview } from '../odcs/ContractOverview';
import { DatasetPage } from '../odcs/DatasetPage';
import type { LineageCard } from '../odcs/lineage';
import { propertyEditor } from '../odcs/PropertyEditors';
import type { Doc } from '../projects/api';
import type { ValidatedModel } from './types';

type Props = {
  contractObject: string | null;
  current: Doc;
  model: ValidatedModel;
  docs: Doc[];
  setContractObject: React.Dispatch<React.SetStateAction<string | null>>;
  openInLineage: (name: string) => void;
  continueInNeighborhood: (card: LineageCard) => void;
  gitVersion: number;
  docText: (id: string) => string;
  applySaved: (saved: Saved[], label: string) => void;
  onOpenSource: () => void;
};
/** Why some property controls are read-only for people who may not classify. */
function protectedPropertiesNote(protectedLevel = 'confidential') {
  return `Only a Steward or Admin changes a classification, or a property classified ${protectedLevel} or above.`;
}
/** Renders contract view. */
export function ContractView({ contractObject, current, model, docs, setContractObject, openInLineage, continueInNeighborhood, gitVersion, docText, applySaved, onOpenSource }: Props) {
  const access = useCapabilities(current.project);
  const lockedForPerson = !access.local && !access.can('editGuarded');
  return contractObject ? (
    <DatasetPage
      key={contractObject}
      doc={current}
      data={(model as any).document}
      objectName={contractObject}
      projectDocs={docs.filter(d => d.project === current.project)}
      onBack={() => setContractObject(null)}
      onOpenSource={onOpenSource}
      onOpenObject={setContractObject}
      onOpenInLineage={openInLineage}
      onNeighborhood={continueInNeighborhood}
      gitVersion={gitVersion}
      editor={propertyEditor({
        canEdit: access.can('edit'),
        canClassify: access.can('editGuarded'),
        classification: access.classification,
        doc: current,
        base: docText(current.id),
        onSaved: applySaved,
      })}
      propertiesNote={lockedForPerson ? protectedPropertiesNote(access.classification?.protectedLevel) : undefined}
    />
  ) : (
    <ContractOverview data={(model as any).document} onOpen={setContractObject} onOpenInLineage={openInLineage} />
  );
}
