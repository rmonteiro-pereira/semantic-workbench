/** Lists, filters and groups project metrics alongside the selected metric's explanation. */
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Gauge, Plus, Search, Tags } from 'lucide-react';
import type { KpiSummary } from '../../server/agent/explain';
import { MetricDetail } from './MetricDetail';
import { conceptText, typeLabel } from './format';
import './metrics.css';
// The governed filter keeps metrics with workbench attributes. Metrics without them offer Add
// attributes; details sit beside the list or below it on narrow screens.
type GroupBy = 'none' | 'owner' | 'type' | 'status' | 'concept' | 'file';
const groupLabel: Record<GroupBy, string> = {
  none: 'No grouping',
  owner: 'Owner',
  type: 'Type',
  status: 'Status',
  concept: 'Concept',
  file: 'File',
};
const keyOf = (k: KpiSummary) => `${k.file}#${k.modelPath.join('/')}#${k.name}`;
function groupValue(k: KpiSummary, by: GroupBy) {
  if (by === 'owner') return k.owner ?? 'No owner';
  if (by === 'type') return typeLabel[k.type];
  if (by === 'status')
    return k.status ? k.status[0].toUpperCase() + k.status.slice(1) : 'No status';
  if (by === 'concept')
    return (
      k.concepts.find(c => c.role === 'of')?.concept ??
      k.concepts.find(c => c.role === 'measures')?.concept ??
      'Not bound to a concept'
    );
  if (by === 'file') return k.file;
  return '';
}
/** Displays searchable project metrics with the selected metric's detail pane. */
export function MetricsView({
  project,
  projectName,
  kpis,
  error,
  loading,
  selected,
  onSelect,
  filter,
  onNew,
  onEdit,
  onAddAttributes,
}: {
  project: string | null;
  projectName?: string;
  kpis: KpiSummary[];
  error: string;
  loading: boolean;
  selected: string;
  onSelect: (key: string) => void;
  filter?: string;
  onNew?: () => void;
  onEdit?: (k: KpiSummary) => void;
  onAddAttributes?: (k: KpiSummary) => void;
}) {
  const [query, setQuery] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [owner, setOwner] = useState('');
  const [governedOnly, setGovernedOnly] = useState(false);
  // A concept chosen elsewhere (the neighborhood's metric indicator) filters the list.
  useEffect(() => {
    if (filter) setQuery(filter.split('\u0000')[0]);
  }, [filter]);
  const term = query.trim().toLocaleLowerCase();
  const owners = useMemo(
    () => [...new Set(kpis.map(k => k.owner).filter(Boolean) as string[])].sort(),
    [kpis],
  );
  const statuses = useMemo(
    () => [...new Set(kpis.map(k => k.status).filter(Boolean) as string[])].sort(),
    [kpis],
  );
  const types = useMemo(() => [...new Set(kpis.map(k => k.type))].sort(), [kpis]);
  const visible = kpis.filter(
    k =>
      (!governedOnly || k.governed) &&
      (!type || k.type === type) &&
      (!status || k.status === status) &&
      (!owner || k.owner === owner) &&
      (!term ||
        [
          k.label,
          k.name,
          k.description,
          k.owner,
          ...k.concepts.map(c => c.concept ?? c.input),
        ].some(s => typeof s === 'string' && s.toLocaleLowerCase().includes(term))),
  );
  const groups = useMemo(() => {
    const map = new Map<string, KpiSummary[]>();
    for (const k of visible) {
      const g = groupValue(k, groupBy);
      map.set(g, [...(map.get(g) ?? []), k]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, groupBy]);
  const current = kpis.find(k => keyOf(k) === selected);
  const filtered = !!(type || status || owner || term || governedOnly);
  return (
    <div className={`metrics-view${current ? ' has-detail' : ''}`}>
      <section className="metrics-list" aria-label="Metrics">
        <header className="metrics-heading">
          <small>METRICS{projectName ? ` · ${projectName.toUpperCase()}` : ''}</small>
          <div className="metrics-title">
            <h2>Metrics</h2>
            {project && onNew && (
              <button className="primary metrics-new" onClick={onNew}>
                <Plus size={14} />
                New metric
              </button>
            )}
          </div>
          <p>
            What each metric measures, how it is calculated and where its data comes from. Explained
            here, never executed.
          </p>
        </header>
        <div className="metrics-filters">
          <label className="metrics-search">
            <Search size={15} />
            <input
              aria-label="Find a metric"
              placeholder="Find a metric, owner or concept"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
          <label>
            Group by
            <select
              aria-label="Group metrics by"
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as GroupBy)}
            >
              {Object.entries(groupLabel).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              aria-label="Filter by type"
              value={type}
              onChange={e => setType(e.target.value)}
            >
              <option value="">All</option>
              {types.map(t => (
                <option key={t} value={t}>
                  {typeLabel[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              aria-label="Filter by status"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="">All</option>
              {statuses.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Owner
            <select
              aria-label="Filter by owner"
              value={owner}
              onChange={e => setOwner(e.target.value)}
            >
              <option value="">All</option>
              {owners.map(o => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label
            className="metrics-governed"
            title="Only metrics with workbench attributes (type, owner, status, targets)"
          >
            <input
              type="checkbox"
              checked={governedOnly}
              onChange={e => setGovernedOnly(e.target.checked)}
            />
            Governed only
          </label>
        </div>
        {!project ? (
          <p className="metrics-empty">Open a file of a project to see its metrics.</p>
        ) : loading && !kpis.length ? (
          <p role="status" className="metrics-empty">
            Reading the project’s semantic models…
          </p>
        ) : error ? (
          <p role="alert" className="mapping-error">
            {error}
          </p>
        ) : !kpis.length ? (
          <div className="metrics-empty">
            <Gauge size={28} />
            <p>
              This project has no governed metrics yet. Metrics live in an Ossie semantic model,
              either in its own file or embedded in a consolidated ontology file.
            </p>
          </div>
        ) : (
          <>
            <p className="metrics-count">
              <span role="status">
                {filtered
                  ? `${visible.length} of ${kpis.length} metrics`
                  : `${kpis.length} ${kpis.length === 1 ? 'metric' : 'metrics'}`}
              </span>
              {filtered && (
                <button
                  onClick={() => {
                    setQuery('');
                    setType('');
                    setStatus('');
                    setOwner('');
                    setGovernedOnly(false);
                  }}
                >
                  Clear filters
                </button>
              )}
            </p>
            <div className="metrics-table-wrap">
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="col-unit">
                      Unit
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col" className="col-owner">
                      Owner
                    </th>
                    <th scope="col" className="col-concept">
                      Concept
                    </th>
                  </tr>
                </thead>
                {groups.map(([group, items]) => (
                  <tbody key={group}>
                    {groupBy !== 'none' && (
                      <tr className="metrics-group">
                        <th colSpan={6} scope="rowgroup">
                          {group}
                          <span>{items.length}</span>
                        </th>
                      </tr>
                    )}
                    {items.map(k => {
                      const key = keyOf(k);
                      const active = key === selected;
                      return (
                        <tr key={key} className={active ? 'selected' : ''} aria-selected={active}>
                          <td data-label="Metric">
                            <button
                              className="metrics-name"
                              aria-label={`${k.label}: explain`}
                              aria-current={active ? 'true' : undefined}
                              onClick={() => onSelect(active ? '' : key)}
                            >
                              <strong>{k.label}</strong>
                              <code>{k.name}</code>
                            </button>
                            {k.findings.some(f => f.severity === 'error') && (
                              <span
                                className="metrics-flag error"
                                title={k.findings.map(f => f.message).join('\n')}
                              >
                                Needs repair
                              </span>
                            )}
                            {!k.governed && onAddAttributes && (
                              <button
                                className="metrics-add-attributes"
                                aria-label={`Add attributes to ${k.label}`}
                                title="Give this metric a type, owner, status and targets"
                                onClick={() => onAddAttributes(k)}
                              >
                                <Tags size={13} />
                                Add attributes
                              </button>
                            )}
                          </td>
                          <td data-label="Type">
                            <span className={`kpi-pill type-${k.type}`}>{typeLabel[k.type]}</span>
                            {!k.typeDeclared && (
                              <small
                                className="inferred"
                                title="Not declared; read from the expression"
                              >
                                inferred
                              </small>
                            )}
                          </td>
                          <td data-label="Unit" className="col-unit">
                            {k.unit ?? <span className="muted">—</span>}
                          </td>
                          <td data-label="Status">
                            {k.status ? (
                              <span className={`kpi-status status-${k.status}`}>{k.status}</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td data-label="Owner" className="col-owner">
                            {k.owner ?? <span className="muted">—</span>}
                          </td>
                          <td data-label="Concept" className="col-concept">
                            {k.concepts.length ? (
                              <span className="kpi-concepts">{conceptText(k.concepts)}</span>
                            ) : (
                              <span className="muted">Not bound</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
            {!visible.length && <p className="metrics-empty">No metric matches these filters.</p>}
          </>
        )}
      </section>
      {current && project && (
        <section className="metrics-detail" aria-label={`Metric ${current.label}`}>
          <button className="metrics-back" onClick={() => onSelect('')}>
            <ArrowLeft size={15} />
            All metrics
          </button>
          <MetricDetail
            key={keyOf(current)}
            project={project}
            kpi={current}
            all={kpis}
            onEdit={onEdit ? () => onEdit(current) : undefined}
          />
        </section>
      )}
    </div>
  );
}
/** Exports the stable metric key used by selection and navigation. */
export { keyOf as kpiKey };
