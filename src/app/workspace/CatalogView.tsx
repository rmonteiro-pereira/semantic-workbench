/** Presentation and event handling for catalog view. */
import { Gauge, Pencil } from 'lucide-react';
import React from 'react';
import type { Entity } from '../../shared/core/model';
import { EntityName, humanizeIdentifier } from '../graph/EntityName';
import type { AreaFilter } from '../graph/overview';
import type { ItemTarget, RdfTarget, ValidatedModel } from './types';
import './catalog.css';

type Props = {
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
function metricCountLabel(count: number) {
  return count === 1 ? '1 metric' : `${count} metrics`;
}
function catalogDescription(description: string | undefined) {
  if (!description) return 'No description yet';
  if (description.length <= 160) return description;
  const boundary = description.lastIndexOf(' ', 160);
  return boundary > 0 ? `${description.slice(0, boundary)}…` : description;
}
/** Renders catalog view. */
export function CatalogView({ model, search, clearSearch, area, clearArea, selectEntity, kpiBadges, entityTarget, rdfTarget, setEditing, setRdfEditing }: Props) {
  const areaIds = area ? new Set(area.entityIds) : null;
  const inArea = (entity: Entity) => !areaIds || areaIds.has(entity.id);
  const areaEntities = model?.entities.filter(inArea) ?? [];
  const entities = areaEntities.filter(entity => entity.name.toLowerCase().includes(search.toLowerCase()));
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
      {entities.map(entity => {
        function handleCatalogEditClick() {
          const target = entityTarget(entity);
          if (target) setEditing(target);
          else setRdfEditing(rdfTarget(entity));
        }
        return (
          <div className="catalog-card" key={entity.id}>
            <button onClick={() => selectEntity(entity.id)}>
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
              <p title={entity.description || undefined}>{catalogDescription(entity.description)}</p>
              <span className="catalog-details">View details</span>
            </button>
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
