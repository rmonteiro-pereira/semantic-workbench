import { ChangeMark } from '../item-diff/ChangeMark';
import { useGraphChanges } from '../item-diff/graph-changes';
import { useItemDiffContext } from '../item-diff/ItemDiffContext';
import { ItemChangeAnnotation } from '../item-diff/ItemChangeAnnotation';
/** Presentation and event handling for catalog view. */
import { Gauge, Pencil } from 'lucide-react';
import React, { useState } from 'react';
import type { Entity } from '../../shared/core/model';
import { EntityName, humanizeIdentifier } from '../graph/EntityName';
import type { AreaFilter } from '../graph/overview';
import { TrafficBadge } from '../usage/TrafficBadge';
import { TrafficSort } from '../usage/TrafficSort';
import { entityAddressText } from '../usage/usage-addresses';
import { sortByTraffic } from '../usage/usage-sort';
import { useTraffic, useTrafficTotals } from '../usage/use-usage';
import type { ItemTarget, RdfTarget, ValidatedModel } from './types';
import { StatusMark } from '../governance/StatusMark';
import { governanceOf, metricGovernanceOf } from '../../shared/governance/item-governance';
import { conceptKindLookup, declaredAttributesOf } from '../../shared/attributes/attribute-rule';
import { orderedAttributes, orderListOf } from '../../shared/attributes/attribute-order';
import './catalog.css';

type Props = {
  current?: import('../projects/api').Doc | null;
  model: ValidatedModel;
  search: string;
  clearSearch: () => void;
  /** When set, only this area's entities are listed. */
  area: AreaFilter | null;
  clearArea: () => void;
  selectEntity: (id: string) => void;
  kpiBadges: Map<string, string[]>;
  entityTarget: (entity: Entity) => ItemTarget | null;
  rdfTarget: (entity: Entity) => RdfTarget | null;
  setEditing: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  setRdfEditing: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
};
/** The status and the attribute names a card shows under its text, read from the item's own definition. A card with neither shows nothing. */
function CardMarks({ entity, model }: { entity: Entity; model: ValidatedModel }) {
  const definition = entity.definition;
  if (!definition || typeof definition !== 'object') return null;
  const isConcept = entity.kind === 'EntityType' || entity.kind === 'ValueType';
  const governance = entity.kind === 'Metric' ? metricGovernanceOf(definition) : governanceOf(definition);
  const concepts = (model?.entities ?? []).filter(candidate => candidate.kind === 'EntityType' || candidate.kind === 'ValueType').map(candidate => candidate.definition);
  const attributes = isConcept ? orderedAttributes(declaredAttributesOf(definition, conceptKindLookup(concepts)), orderListOf(definition)) : [];
  if (governance.status === undefined && !attributes.length) return null;
  return (
    <div className="catalog-marks">
      {governance.status !== undefined && <StatusMark status={governance.status} />}
      {attributes.length > 0 && <p className="catalog-attributes">Attributes: {attributes.map(attribute => attribute.name).join(', ')}</p>}
    </div>
  );
}

function metricCountLabel(count: number) {
  return count === 1 ? '1 metric' : `${count} metrics`;
}
/** Renders catalog view. */
export function CatalogView({ current, model, search, clearSearch, area, clearArea, selectEntity, kpiBadges, entityTarget, rdfTarget, setEditing, setRdfEditing }: Props) {
  const graph = useGraphChanges(model, current ?? null);
  const overlay = useItemDiffContext();
  const areaIds = area ? new Set(area.entityIds) : null;
  const inArea = (entity: Entity) => !areaIds || areaIds.has(entity.id);
  // Sorting by traffic exists only while Traffic is on; the list keeps its own order otherwise.
  const [sortedByTraffic, setSortedByTraffic] = useState(false);
  const trafficTotal = useTrafficTotals();
  const trafficOn = useTraffic().on;
  const areaEntities = (graph?.entities ?? []).filter(inArea);
  const trafficCount = trafficOn && sortedByTraffic ? (entity: Entity) => trafficTotal(entityAddressText(entity)) : null;
  const entities = shownEntities(graph?.entities ?? [], inArea, search, trafficCount);
  return (
    <div className="catalog">
      <p className="catalog-result-count" role="status">
        {entities.length} of {areaEntities.length}
      </p>
      {entities.length === 0 && search && (
        <div className="catalog-empty">
          <p>No entity matches "{search}"</p>
          <button type="button" onClick={clearSearch}>
            Clear search
          </button>
        </div>
      )}
      {area && (
        <div className="catalog-area-filter">
          <span>
            Showing the {area.name} area ({area.entityIds.length})
          </span>
          <button type="button" onClick={clearArea}>
            Show every entity
          </button>
        </div>
      )}
      <TrafficSort sorted={sortedByTraffic} onToggle={() => setSortedByTraffic(sorted => !sorted)} />
      {entities.map(entity => {
        function handleCatalogEditClick() {
          const target = entityTarget(entity);
          if (target) setEditing(target);
          else setRdfEditing(rdfTarget(entity));
        }
        function handleViewDetails() {
          if (!overlay?.openRemoved(entity.id)) selectEntity(entity.id);
        }
        return (
          <div className="catalog-card" key={entity.id}>
            <button onClick={handleViewDetails}>
              <small>
                {humanizeIdentifier(entity.kind)}
                {(kpiBadges.get(entity.name)?.length ?? 0) > 0 && (
                  <span className="kpi-badge" title={`Metrics: ${kpiBadges.get(entity.name)!.join(', ')}`}>
                    <Gauge size={10} />
                    {metricCountLabel(kpiBadges.get(entity.name)!.length)}
                  </span>
                )}
              </small>
              <EntityName name={entity.name} />
              <p title={entity.description || undefined}>{entity.description || 'No description yet'}</p>
              <span className="catalog-details">View details</span>
            </button>
            {entity.id.startsWith('removed:') ? <ChangeMark change="removed" /> : <ItemChangeAnnotation document={current ?? null} item={entity} />}
            <CardMarks entity={entity} model={model} />
            <TrafficBadge compact address={entityAddressText(entity)} />
            {(entityTarget(entity) || rdfTarget(entity)) && (
              <button className="catalog-edit" aria-label={`Edit ${entity.name}`} onClick={handleCatalogEditClick}>
                <Pencil size={11} />
                Edit
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
/** The entities the list shows: in the area, matching the search and, when asked, busiest first. */
function shownEntities(entities: Entity[], inArea: (entity: Entity) => boolean, search: string, countOf: ((entity: Entity) => number) | null) {
  const shown = entities.filter(inArea).filter(e => e.name.toLowerCase().includes(search.toLowerCase()));
  return countOf ? sortByTraffic(shown, countOf) : shown;
}
