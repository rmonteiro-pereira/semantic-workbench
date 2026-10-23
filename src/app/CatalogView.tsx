/** Presentation and event handling for catalog view. */
import { Gauge, Pencil } from 'lucide-react';
import React from 'react';
import type { Entity } from '../model';
import type { ItemTarget, RdfTarget, ValidatedModel } from './types';
import './catalog.css';

type Props = {
  model: ValidatedModel;
  search: string;
  selectEntity: (id: string) => void;
  kpiBadges: Map<string, string[]>;
  entityTarget: (e: Entity) => ItemTarget | null;
  rdfTarget: (e: Entity) => RdfTarget | null;
  setEditing: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  setRdfEditing: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
};
function metricCountLabel(count: number) {
  return count === 1 ? '1 metric' : `${count} metrics`;
}
/** Renders catalog view. */
export function CatalogView({
  model,
  search,
  selectEntity,
  kpiBadges,
  entityTarget,
  rdfTarget,
  setEditing,
  setRdfEditing,
}: Props) {
  return (
    <div className="catalog">
      {model?.entities
        .filter(e => e.name.toLowerCase().includes(search.toLowerCase()))
        .map(e => {
          function handleCatalogEditClick() {
            const target = entityTarget(e);
            if (target) setEditing(target);
            else setRdfEditing(rdfTarget(e));
          }
          return (
            <div className="catalog-card" key={e.id}>
              <button onClick={() => selectEntity(e.id)}>
                <small>
                  {e.kind === 'Metric' ? 'Metric' : e.kind}
                  {(kpiBadges.get(e.name)?.length ?? 0) > 0 && (
                    <span
                      className="kpi-badge"
                      title={`Metrics: ${kpiBadges.get(e.name)!.join(', ')}`}
                    >
                      <Gauge size={10} />
                      {metricCountLabel(kpiBadges.get(e.name)!.length)}
                    </span>
                  )}
                </small>
                <strong>{e.name}</strong>
                <p title={e.description || undefined}>{e.description || 'No description yet'}</p>
              </button>
              {(entityTarget(e) || rdfTarget(e)) && (
                <button
                  className="catalog-edit"
                  aria-label={`Edit ${e.name}`}
                  onClick={handleCatalogEditClick}
                >
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
