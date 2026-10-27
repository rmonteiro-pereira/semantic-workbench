/** Presentation and event handling for relationship details. */
import { Braces, Network, Pencil, Trash2 } from 'lucide-react';
import React from 'react';
import { itemName } from '../../shared/edit/item-model';
import { itemValue } from '../../shared/edit/yaml-patch';
import type { Relationship } from '../../shared/core/model';
import { editEntity } from '../../shared/core/model';
import type { Doc } from '../projects/api';
import type { ItemTarget, RdfTarget, ValidatedModel } from './types';

type Props = {
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
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  relationship: Relationship;
  relationshipTarget: (r: Relationship) => ItemTarget | null;
  rdfEdgeTarget: (r: Relationship) => RdfTarget | null;
  setRdfEditing: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
  source: string;
  setEditing: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  setDeleting: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  model: ValidatedModel;
  setSource: React.Dispatch<React.SetStateAction<string>>;
  current: Doc | null;
  setDefinition: React.Dispatch<React.SetStateAction<{ title: string; value: unknown } | null>>;
};
/** Renders relationship details. */
export function RelationshipDetails({
  activeGroup,
  selectedEdge,
  setSelectedEdge,
  relationship,
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
}: Props) {
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement, HTMLTextAreaElement>) {
    return setSource(editEntity(source, relationship.data.path, e.target.value, current?.filename));
  }

  function handleViewDefinitionClick() {
    return setDefinition({
      title: `Definition of ${relationship.label}`,
      value: relationship.data.definition,
    });
  }

  return (
    <>
      <div className="entity-icon">
        <Network />
      </div>
      {activeGroup && activeGroup.data.relationships.length > 1 && (
        <label>
          Relationships on this connection
          <select
            aria-label="Connection relationship"
            value={selectedEdge}
            onChange={e => setSelectedEdge(e.target.value)}
          >
            {activeGroup.data.relationships.map(r => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <h2>{relationship.label}</h2>
      <div className="badge">{relationship.data.kind}</div>
      {(() => {
        const targetValue = relationshipTarget(relationship);
        const rdfItem = targetValue ? null : rdfEdgeTarget(relationship);
        if (rdfItem)
          return (
            <div className="inspector-actions">
              <button
                className="primary"
                onClick={() => setRdfEditing(rdfItem)}
                aria-label={`Edit ${rdfItem.label}`}
              >
                <Pencil size={13} />
                Edit {rdfItem.label}
              </button>
            </div>
          );
        if (!targetValue) return <p className="hint">Edit this relationship in Source.</p>;
        const whole =
          relationship.data.kind === 'Inheritance' ||
          relationship.data.kind === 'Metric expression reference';
        const owner = whole
          ? itemName(targetValue.kind, itemValue(source, targetValue.path))
          : relationship.label;
        return (
          <div className="inspector-actions">
            <button
              className="primary"
              onClick={() => setEditing(targetValue)}
              aria-label={`Edit ${owner}`}
            >
              <Pencil size={13} />
              {whole ? `Edit ${owner}` : 'Edit'}
            </button>
            {!whole && (
              <button
                onClick={() => setDeleting(targetValue)}
                aria-label={`Delete ${relationship.label}`}
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
          </div>
        );
      })()}
      <dl className="relationship-details">
        <dt>From</dt>
        <dd>{model?.entities.find(e => e.id === relationship.source)?.name}</dd>
        <dt>To</dt>
        <dd>{model?.entities.find(e => e.id === relationship.target)?.name}</dd>
        {relationship.data.definition.multiplicity && (
          <>
            <dt>Multiplicity</dt>
            <dd>{relationship.data.definition.multiplicity}</dd>
          </>
        )}
        {relationship.data.definition.from_columns && (
          <>
            <dt>Join keys</dt>
            <dd>
              {relationship.data.definition.from_columns.map((key: string, i: number) => (
                <div key={i}>
                  {key} → {relationship.data.definition.to_columns[i]}
                </div>
              ))}
            </dd>
          </>
        )}
        {relationship.data.definition.roles && (
          <>
            <dt>Roles</dt>
            <dd>
              {relationship.data.definition.roles.map((role: any, i: number) => (
                <div key={i}>
                  {role.concept}
                  {role.name ? ` (${role.name})` : ''}
                </div>
              ))}
            </dd>
          </>
        )}
        {relationship.data.definition.verbalizes && (
          <>
            <dt>Verbalizations</dt>
            <dd>{relationship.data.definition.verbalizes.join(' · ')}</dd>
          </>
        )}
      </dl>
      {relationship.data.kind !== 'Inheritance' && !relationship.data.readOnlyForm && (
        <label>
          Description
          <textarea
            aria-label="Relationship description"
            value={relationship.data.definition.description ?? ''}
            onChange={handleTextareaChange}
          />
        </label>
      )}
      <button className="view-definition" onClick={handleViewDefinitionClick}>
        <Braces size={13} />
        View definition
      </button>
      <p className="hint">
        Edit the description here or the full definition in Source. Save to persist changes.
      </p>
    </>
  );
}
