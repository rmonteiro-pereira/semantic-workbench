/** Presentation and event handling for details panel. */
import { Box } from 'lucide-react';
import React from 'react';
import type { Path } from '../../shared/edit/item-model';
import { type ItemKind } from '../../shared/edit/item-model';
import type { Entity, Relationship } from '../../shared/core/model';
import type { Doc } from '../projects/api';
import { EntityDetails } from './EntityDetails';
import { RelationshipDetails } from './RelationshipDetails';
import type { ItemTarget, RdfTarget, ValidatedModel } from './types';

type Props = {
  inspectorVisible: boolean;
  pageDetails: boolean;
  entity: Entity | undefined;
  relationship: Relationship | undefined;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  activeGroup:
    | {
        data: {
          relationships: Relationship[];
          path: (string | number)[];
          definition: any;
          kind: string;
          readOnlyForm?: boolean | undefined;
        };
        id: string;
        source: string;
        target: string;
        label: string;
      }
    | undefined;
  selectedEdge: string;
  relationshipTarget: (relationship: Relationship) => ItemTarget | null;
  rdfEdgeTarget: (relationship: Relationship) => RdfTarget | null;
  setRdfEditing: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
  source: string;
  setEditing: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  setDeleting: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  model: ValidatedModel;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  current: Doc | null;
  setDefinition: React.Dispatch<React.SetStateAction<{ title: string; value: unknown } | null>>;
  showNeighborhood: (id?: string) => void;
  rdfTarget: (entity: Entity) => RdfTarget | null;
  setRdfDeleting: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
  entityTarget: (entity: Entity) => ItemTarget | null;
  setAdding: React.Dispatch<
    React.SetStateAction<{
      docId: string;
      kind?: ItemKind | undefined;
      owner?: Path | undefined;
      preset?: Record<string, any> | undefined;
    } | null>
  >;
  relatedDocuments: Doc[];
  openDocument: (doc: Doc) => boolean;
  applySaved: SectionSupport['applySaved'];
  projectDocsOf: SectionSupport['projectDocsOf'];
};
import { declaredImports } from '../../shared/tessera/imports';
import { documentFormat } from '../../shared/tessera/validate';
import { ImportsSection } from '../mesh/ImportsSection';
import { PartPicker } from '../mesh/PartPicker';
import { ontologyPartSelection } from './ontologyUnit';
import { ItemSectionSupportContext, type SectionSupport } from '../edit/section-context';

/** Renders details and makes the workspace's editing support available to its sections. */
export function DetailsPanel({ sections, ...props }: Omit<Props, 'applySaved' | 'projectDocsOf'> & { sections: SectionSupport }) {
  return (
    <ItemSectionSupportContext.Provider value={sections}>
      <DetailsPanelContent {...props} applySaved={sections.applySaved} projectDocsOf={sections.projectDocsOf} />
    </ItemSectionSupportContext.Provider>
  );
}

function DetailsPanelContent({
  inspectorVisible,
  pageDetails,
  entity,
  relationship,
  setSelected,
  setSelectedEdge,
  activeGroup,
  selectedEdge,
  relationshipTarget,
  rdfEdgeTarget,
  setRdfEditing,
  source,
  setEditing,
  setDeleting,
  model,
  setSource,
  current,
  setDefinition,
  showNeighborhood,
  rdfTarget,
  setRdfDeleting,
  entityTarget,
  setAdding,
  relatedDocuments,
  openDocument,
  applySaved,
  projectDocsOf,
}: Props) {
  const unitFiles = model && 'unitFiles' in model && Array.isArray(model.unitFiles) ? model.unitFiles : undefined;
  const partSelection = ontologyPartSelection(current, model, unitFiles);
  const data = model && 'document' in model ? model.document : undefined;
  const format = documentFormat(data);
  const showImports = model?.kind === 'Ossie ontology' && format?.family === 'tessera' && format.revision === 3 && !partSelection?.part;
  function renderDetails() {
    if (relationship) {
      return (
        <RelationshipDetails
          activeGroup={activeGroup}
          selectedEdge={selectedEdge}
          setSelectedEdge={setSelectedEdge}
          relationship={relationship}
          relationshipTarget={relationshipTarget}
          rdfEdgeTarget={rdfEdgeTarget}
          setRdfEditing={setRdfEditing}
          source={source}
          setEditing={setEditing}
          setDeleting={setDeleting}
          model={model}
          setSource={setSource}
          current={current}
          setDefinition={setDefinition}
        />
      );
    }
    if (entity) {
      return (
        <EntityDetails
          entity={entity}
          showNeighborhood={showNeighborhood}
          rdfTarget={rdfTarget}
          setRdfEditing={setRdfEditing}
          setRdfDeleting={setRdfDeleting}
          entityTarget={entityTarget}
          setEditing={setEditing}
          setAdding={setAdding}
          setDeleting={setDeleting}
          setSource={setSource}
          source={source}
          current={current}
          relatedDocuments={relatedDocuments}
          openDocument={openDocument}
          model={model}
          setSelectedEdge={setSelectedEdge}
          setSelected={setSelected}
          setDefinition={setDefinition}
        />
      );
    }
    return (
      <div className="inspect-empty">
        <Box size={30} />
        <p>
          Select an entity or relationship to explore
          <br />
          its definition and fields.
        </p>
      </div>
    );
  }

  function handleInspectorCloseClick() {
    setSelected('');
    setSelectedEdge('');
  }

  return (
    <>
      {inspectorVisible && (
        <aside className="inspector" aria-label="Definition details" role={pageDetails ? 'dialog' : undefined} aria-modal={pageDetails || undefined}>
          <div className="section-label">
            DEFINITION DETAILS
            {(entity || relationship) && (
              <button className="inspector-close" aria-label="Close details" onClick={handleInspectorCloseClick}>
                ×
              </button>
            )}
          </div>
          {partSelection && <PartPicker selection={partSelection} />}
          {showImports && current && (
            <ImportsSection key={current.id} doc={current} imports={declaredImports(data)} dirty={source !== current.source} applySaved={applySaved} projectDocs={() => projectDocsOf(current.id)} />
          )}
          {renderDetails()}
        </aside>
      )}
    </>
  );
}
