/** Displays model groups and their entities as a browsable catalog. */
import { useRecordedState } from '../workspace/hooks/useRecordedState';
import type { GroupingOptions } from './overview';
import { useMemo, useState } from 'react';
import { ArrowRight, Focus, Grid2X2, Layers, Search, X, Network } from 'lucide-react';
import { modelOverview, usableGroupingModes } from './overview';
import type { Entity, Relationship } from '../../shared/core/model';
type Props = {
  grouping?: GroupingOptions;
  name: string;
  entities: Entity[];
  edges: Relationship[];
  search: string;
  selected: string;
  onSelectEntity: (id: string) => void;
  onSelectRelationship: (id: string) => void;
  onClose: () => void;
  onOpenGraph: () => void;
  /** Opens one area in the Catalog, filtered to its entities. */
  onShowArea: (area: AreaFilter) => void;
};

/** The entities of one overview area, as the Catalog lists them after "Show all". */
export type AreaFilter = { name: string; entityIds: string[] };

// A card lists this many entities; the rest are one click away in the Catalog, so no card grows
// with the size of its area.
export const AREA_ENTITY_LIMIT = 8;

// "Declared domains" reads as "declared domains" inside a sentence; "IRI namespaces" keeps its acronym.
function inSentence(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
}
// A cell of the relationship matrix is shaded in the accent colour; more relationships are darker.
function relationshipHeat(count: number): string {
  const percent = Math.round(Math.min(8 + Math.log2(count + 1) * 3.5, 32));
  return `color-mix(in srgb, var(--color-accent) ${percent}%, transparent)`;
}
/** Displays grouped model entities as catalog cards. */
export function ModelOverview(props: Props) {
  const [mode, setMode] = useRecordedState<'areas' | 'matrix'>('overview.mode', 'areas');
  const [technical, setTechnical] = useRecordedState('overview.technical', false);
  const [pair, setPair] = useRecordedState<[string, string] | null>('overview.pair', null);
  const [hover, setHover] = useState('');
  const overview = useMemo(() => modelOverview(props.entities, props.edges, props.name, technical, props.grouping), [props.entities, props.edges, props.name, technical, props.grouping]);
  const byId = useMemo(() => new Map(props.entities.map(e => [e.id, e])), [props.entities]);
  const focus = overview.degree.has(hover || props.selected) ? hover || props.selected : '';
  const connected = useMemo(() => {
    const ids = new Set<string>();
    if (focus) {
      ids.add(focus);
      for (const edge of overview.links)
        if (edge.source === focus || edge.target === focus) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
    }
    return ids;
  }, [overview, focus]);
  let connections: typeof overview.links;
  if (pair) {
    if (pair[1] === '*') {
      connections = overview.links.filter(e => overview.groupOf.get(e.source) === pair[0] && overview.groupOf.get(e.target) !== pair[0]);
    } else {
      connections = overview.matrix.get(JSON.stringify(pair)) ?? [];
    }
  } else {
    connections = [];
  }
  const groupName = (id: string) => (id === '*' ? 'Other areas' : (overview.groups.find(g => g.id === id)?.name ?? id));
  const canChangeInGraph = usableGroupingModes(overview.modes).length > 1;
  const matches = (e: Entity) => !props.search || e.name.toLowerCase().includes(props.search.toLowerCase()) || e.id.toLowerCase().includes(props.search.toLowerCase());
  return (
    <div className="model-overview">
      <div className="overview-top">
        <div>
          <div className="overview-eyebrow">FULL MODEL</div>
          <h2>One model. {overview.groups.length} groups.</h2>
          <p>
            {overview.entities.length} entities · {overview.links.length} relationships. Counts beside entity names are declared relationships. Select an entity to trace its connections.
          </p>
        </div>
        <div className="overview-view-actions">
          <button onClick={props.onOpenGraph}>
            <Network size={14} /> Graph
          </button>
          <button onClick={props.onClose}>
            <Focus size={14} /> Neighborhood
          </button>
        </div>
      </div>
      <p className="overview-grouping-note">
        Grouped by {inSentence(overview.groupingLabel)}, as in Graph.{' '}
        {canChangeInGraph && (
          <button type="button" className="link-button" onClick={props.onOpenGraph}>
            Change in Graph
          </button>
        )}
      </p>
      <div className="overview-options">
        <div className="overview-switch">
          <button className={mode === 'areas' ? 'active' : ''} onClick={() => setMode('areas')}>
            <Layers size={14} /> {overview.mode === 'example' ? 'Business areas' : overview.groupingLabel}
          </button>
          <button className={mode === 'matrix' ? 'active' : ''} onClick={() => setMode('matrix')}>
            <Grid2X2 size={14} /> Relationship matrix
          </button>
        </div>
        <div className="overview-legend">
          {props.selected && (
            <>
              <span /> Connected to the selected entity
            </>
          )}
          {props.entities.some(e => e.kind === 'OWL class') && (
            <button onClick={() => setTechnical(v => !v)}>{technical ? 'Business classes' : `Include ${overview.technicalCount} technical definitions`}</button>
          )}
        </div>
      </div>
      <div className="overview-scroll">
        {mode === 'areas' ? (
          <div className="area-grid">
            {overview.groups.map(group => {
              const entities = group.entities.filter(matches);
              if (!entities.length) return null;
              const internal = overview.matrix.get(JSON.stringify([group.id, group.id]))?.length ?? 0;
              const external = overview.links.filter(e => overview.groupOf.get(e.source) === group.id && overview.groupOf.get(e.target) !== group.id).length;
              return (
                <section key={group.id} className="business-area" style={{ '--area-color': group.color } as any}>
                  <header>
                    <div>
                      <h3>
                        <span />
                        {group.name}
                      </h3>
                      <p>{group.description}</p>
                    </div>
                    <span className="area-count" title="Entities in this area">
                      {group.entities.length} entities
                    </span>
                  </header>
                  <div className="area-entities">
                    {entities.slice(0, AREA_ENTITY_LIMIT).map(entity => (
                      <button
                        key={entity.id}
                        data-entity-id={entity.id}
                        title={entity.name}
                        onMouseEnter={() => setHover(entity.id)}
                        onMouseLeave={() => setHover('')}
                        onFocus={() => setHover(entity.id)}
                        onBlur={() => setHover('')}
                        onClick={() => {
                          setHover('');
                          props.onSelectEntity(entity.id);
                        }}
                        className={[props.selected === entity.id ? 'selected' : '', connected.has(entity.id) ? 'connected' : '', focus && !connected.has(entity.id) ? 'muted' : ''].join(' ')}
                      >
                        <span>{entity.name.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')}</span>
                        <small title="Declared relationships">{overview.degree.get(entity.id)}</small>
                      </button>
                    ))}
                  </div>
                  {entities.length > AREA_ENTITY_LIMIT && (
                    <button type="button" className="area-show-all" onClick={() => props.onShowArea({ name: group.name, entityIds: group.entities.map(entity => entity.id) })}>
                      Show all {entities.length}
                    </button>
                  )}
                  <footer>
                    <span>
                      {internal} internal {internal === 1 ? 'relationship' : 'relationships'}
                    </span>
                    <button
                      aria-label={`Explore relationships for ${group.name}`}
                      disabled={!external}
                      title={external ? undefined : 'No relationship leaves this area'}
                      onClick={() => {
                        setMode('matrix');
                        setPair([group.id, '*']);
                      }}
                    >
                      {external} outgoing <ArrowRight size={12} />
                    </button>
                  </footer>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="matrix-view">
            <p className="matrix-help">Rows are sources; columns are targets. Each count opens the exact directed relationships, including links within an area.</p>
            <div className="matrix-scroll">
              <table>
                <thead>
                  <tr>
                    <th>FROM ↓ / TO →</th>
                    {overview.groups.map(group => (
                      <th key={group.id}>
                        <span style={{ color: group.color }}>●</span> {group.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overview.groups.map(from => (
                    <tr key={from.id}>
                      <th>{from.name}</th>
                      {overview.groups.map(to => {
                        const count = overview.matrix.get(JSON.stringify([from.id, to.id]))?.length ?? 0;
                        return (
                          <td key={to.id}>
                            {count ? (
                              <button
                                aria-label={`${from.name} to ${to.name}: ${count} relationships`}
                                style={{
                                  background: relationshipHeat(count),
                                }}
                                onClick={() => setPair([from.id, to.id])}
                              >
                                {count}
                              </button>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {mode === 'areas' && overview.groups.every(g => !g.entities.some(matches)) && (
          <div className="overview-empty">
            <Search />
            <p>No entities match this search.</p>
          </div>
        )}
      </div>
      {pair && (
        <section className="overview-connections">
          <header>
            <div>
              <h3>
                {groupName(pair[0])} <ArrowRight size={14} /> {groupName(pair[1])}
              </h3>
              <p>{connections.length} declared relationships</p>
            </div>
            <button aria-label="Close relationship list" onClick={() => setPair(null)}>
              <X size={16} />
            </button>
          </header>
          <div className="connection-list">
            {connections.map(connection => (
              <button key={connection.id} onClick={() => props.onSelectRelationship(connection.id)}>
                <span>{byId.get(connection.source)?.name}</span>
                <strong>{connection.label}</strong>
                <span>{byId.get(connection.target)?.name}</span>
                <ArrowRight size={12} />
              </button>
            ))}
            {!connections.length && <p>No relationships within this area.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
