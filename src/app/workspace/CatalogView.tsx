/** Presentation and event handling for catalog view. */
import { Gauge, Pencil } from 'lucide-react';
import React from 'react';
import type { Entity } from '../../shared/core/model';
import { EntityName } from '../graph/EntityName';
import type { AreaFilter } from '../graph/overview';
import type { ItemTarget, RdfTarget, ValidatedModel } from './types';
import './catalog.css';

type Props = {
  model: ValidatedModel;
  search: string;
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
/** Renders catalog view. */
export function CatalogView({ model, search, area, clearArea, selectEntity, kpiBadges, entityTarget, rdfTarget, setEditing, setRdfEditing }: Props) {
  const areaIds = area ? new Set(area.entityIds) : null;
  const inArea = (entity: Entity) => !areaIds || areaIds.has(entity.id);
  return (
    <div className="catalog">
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
      {model?.entities
        .filter(inArea)
        .filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
        .map(entity => {
          function handleCatalogEditClick() {
            const target = entityTarget(entity);
            if (target) setEditing(target);
            else setRdfEditing(rdfTarget(entity));
          }
          return (
            <div className="catalog-card" key={entity.id}>
              <button onClick={() => selectEntity(entity.id)}>
                <small>
                  {entity.kind === 'Metric' ? 'Metric' : entity.kind}
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
