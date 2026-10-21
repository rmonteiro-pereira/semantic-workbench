/** Presentation and event handling for entity details. */
import { Box, Braces, FileCode, Focus, Pencil, Plus, Trash2 } from 'lucide-react';
import React from 'react';
import type { Path } from '../edit/item-model';
import { type ItemKind } from '../edit/item-model';
import type { Entity } from '../model';
import { editEntity } from '../model';
import type { Doc } from '../projects/api';
import type { ItemTarget, RdfTarget, ValidatedModel } from './types';

type Props = {
  entity: Entity;
  showNeighborhood: (id?: string | undefined) => void;
  rdfTarget: (e: Entity) => RdfTarget | null;
  setRdfEditing: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
  setRdfDeleting: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
  entityTarget: (e: Entity) => ItemTarget | null;
  setEditing: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  setAdding: React.Dispatch<
    React.SetStateAction<{
      docId: string;
      kind?: ItemKind | undefined;
      owner?: Path | undefined;
      preset?: Record<string, any> | undefined;
    } | null>
  >;
  setDeleting: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  source: string;
  current: Doc | null;
  relatedDocuments: Doc[];
  openDocument: (d: Doc) => boolean;
  model: ValidatedModel;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setDefinition: React.Dispatch<React.SetStateAction<{ title: string; value: unknown } | null>>;
};
/** Renders entity details. */
export function EntityDetails({
  entity,
  showNeighborhood,
  rdfTarget,
  setRdfEditing,
  setRdfDeleting,
  entityTarget,
  setEditing,
  setAdding,
  setDeleting,
  setSource,
  source,
  current,
  relatedDocuments,
  openDocument,
  model,
  setSelectedEdge,
  setSelected,
  setDefinition,
}: Props) {
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>) {
    return setSource(editEntity(source, entity.path, e.target.value, current?.filename));
  }

  function handleViewDefinitionClick() {
    return setDefinition({
      title: `Definition of ${entity.name}`,
      value: entity.definition,
    });
  }

  return (
    <>
      <div className="entity-icon">
        <Box />
      </div>
      <h2>{entity.name}</h2>
      <button className="inspect-neighborhood" onClick={() => showNeighborhood(entity.id)}>
        <Focus size={14} />
        Explore neighborhood
      </button>
      <div className="badge">{entity.kind}</div>
      {(() => {
        const rdfItem = rdfTarget(entity);
        if (rdfItem)
          return (
            <div className="inspector-actions">
              <button
                className="primary"
                onClick={() => setRdfEditing(rdfItem)}
                aria-label={`Edit ${entity.name}`}
                title="Edit (E)"
              >
                <Pencil size={13} />
                Edit
              </button>
              <button onClick={() => setRdfDeleting(rdfItem)} aria-label={`Delete ${entity.name}`}>
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          );
        return null;
      })()}
      {(() => {
        function getChildCreationAction() {
          if (!targetValue) return null;
          if (targetValue.kind === 'concept') {
            return {
              kind: 'ontology-relationship' as ItemKind,
              owner: targetValue.path,
              label: 'Add relationship',
            };
          }
          if (targetValue.kind === 'dataset') {
            return {
              kind: 'join' as ItemKind,
              preset: { from: entity.name },
              label: 'Add relationship',
            };
          }
          if (targetValue.kind === 'odcs-object') {
            return {
              kind: 'odcs-property' as ItemKind,
              owner: targetValue.path,
              label: 'Add property',
            };
          }
          return null;
        }

        function handleAddChildClick() {
          if (targetValue == null || add == null) return;

          return setAdding({
            docId: targetValue.docId,
            kind: add.kind,
            owner: add.owner,
            preset: add.preset,
          });
        }

        const targetValue = entityTarget(entity);
        if (!targetValue) return null;
        const add = getChildCreationAction();
        return (
          <div className="inspector-actions">
            <button
              className="primary"
              onClick={() => setEditing(targetValue)}
              aria-label={`Edit ${entity.name}`}
              title="Edit (E)"
            >
              <Pencil size={13} />
              Edit
            </button>
            {add && (
              <button onClick={handleAddChildClick}>
                <Plus size={13} />
                {add.label}
              </button>
            )}
            <button onClick={() => setDeleting(targetValue)} aria-label={`Delete ${entity.name}`}>
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        );
      })()}
      {entity.readOnlyForm ? (
        <p className="hint">
          {entity.description ||
            (rdfTarget(entity)
              ? 'Edit its statements with Edit; the file keeps its serialization and layout.'
              : 'A blank node is edited with the resource that contains it.')}
        </p>
      ) : (
        <label>
          Description
          <textarea value={entity.description} onChange={handleTextareaChange} />
        </label>
      )}
      {relatedDocuments.length > 0 && (
        <>
          <div className="section-label">SHARED REFERENCES</div>
          {relatedDocuments.map(d => (
            <button className="document" key={d.id} onClick={() => openDocument(d)}>
              <FileCode size={14} />
              {d.filename}
            </button>
          ))}
        </>
      )}
      <div className="section-label">RELATIONSHIPS</div>
      <div className="related-edges">
        {model?.edges
          .filter(e => e.source === entity.id || e.target === entity.id)
          .map(e => {
            function handleAddChildClick2() {
              setSelectedEdge(e.id);
              setSelected('');
            }
            return (
              <button key={e.id} onClick={handleAddChildClick2}>
                <span>{e.label}</span>
                <small>
                  {
                    model.entities.find(
                      n => n.id === (e.source === entity.id ? e.target : e.source),
                    )?.name
                  }
                </small>
              </button>
            );
          })}
      </div>
      {entity.definition && (
        <button className="view-definition" onClick={handleViewDefinitionClick}>
          <Braces size={13} />
          View definition
        </button>
      )}
      {entity.fields.length > 0 && (
        <>
          <div className="section-label">FIELDS</div>
          {entity.fields.map((f, i) => (
            <div className="field" key={i}>
              {f}
            </div>
          ))}
        </>
      )}
      <p className="hint">
        Edit all properties and relationships in the Source tab. Save to persist changes.
      </p>
    </>
  );
}
