/** Lists, filters and groups project metrics alongside the selected metric's explanation. */
import { useRecordedState } from '../workspace/hooks/useRecordedState';
import { useCapabilities } from '../auth/Capabilities';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Gauge, Plus, Search } from 'lucide-react';
import type { KpiSummary } from '../../server/agent/explain';
import { MetricDetail } from './MetricDetail';
import { MetricFilterControls } from './MetricFilterControls';
import { MetricsTable } from './MetricsTable';
import { filterMetrics, groupMetrics, isNarrowed, metricKey, noFilters, visibleColumns } from './metric-filters';
import './metrics.css';
// The list shows what identifies a metric; grouping and filters sit beside the search box.
// Metrics without workbench attributes offer Add attributes in their detail view.
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
  onEdit?: (kpiSummary: KpiSummary) => void;
  onAddAttributes?: (kpiSummary: KpiSummary) => void;
}) {
  const access = useCapabilities(project ?? undefined);
  if (!access.can('edit')) {
    onNew = undefined;
    onEdit = undefined;
    onAddAttributes = undefined;
  }
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useRecordedState('metrics.filters', noFilters);
  // A concept chosen elsewhere (the neighborhood's metric indicator) filters the list.
  useEffect(() => {
    if (filter) setQuery(filter.split('\u0000')[0]);
  }, [filter]);
  const term = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => filterMetrics(kpis, filters, term), [kpis, filters, term]);
  const groups = useMemo(() => groupMetrics(visible, filters.groupBy), [visible, filters.groupBy]);
  const columns = useMemo(() => visibleColumns(kpis), [kpis]);
  const current = kpis.find(k => metricKey(k) === selected);
  const detailPane = useRef<HTMLElement>(null);
  // Another metric opens at its title, not where the previous one was scrolled to.
  useEffect(() => {
    detailPane.current?.scrollTo({ top: 0 });
  }, [selected]);
  const filtered = isNarrowed(filters, term);
  // Clearing removes what hides metrics; how the list is grouped stays as the reader set it.
  function clearFilters() {
    setQuery('');
    setFilters({ ...noFilters, groupBy: filters.groupBy });
  }
  let metricsBody: React.ReactNode;
  if (!project) {
    metricsBody = <p className="metrics-empty">Open a file of a project to see its metrics.</p>;
  } else if (loading && !kpis.length) {
    metricsBody = (
      <p role="status" className="metrics-empty">
        Reading the project’s semantic models
      </p>
    );
  } else if (error) {
    metricsBody = (
      <p role="alert" className="mapping-error">
        {error}
      </p>
    );
  } else if (!kpis.length) {
    metricsBody = (
      <div className="metrics-empty">
        <Gauge size={28} />
        <p>This project has no governed metrics yet. Metrics live in an Ossie semantic model, either in its own file or embedded in a consolidated ontology file.</p>
      </div>
    );
  } else {
    metricsBody = (
      <>
        <p className="metrics-count">
          <span role="status">{filtered ? `${visible.length} of ${kpis.length} metrics` : `${kpis.length} ${kpis.length === 1 ? 'metric' : 'metrics'}`}</span>
          {filtered && <button onClick={clearFilters}>Clear filters</button>}
        </p>
        <MetricsTable groups={groups} groupBy={filters.groupBy} columns={columns} selected={selected} onSelect={onSelect} />
        {!visible.length && <p className="metrics-empty">No metric matches these filters.</p>}
      </>
    );
  }
  return (
    <div className={`metrics-view${current ? ' has-detail' : ''}`}>
      <section className="metrics-list" aria-label="Metrics">
        <header className="metrics-heading">
          <small>{projectName ? `Project: ${projectName}` : 'Project metrics'}</small>
          <div className="metrics-title">
            <h2>Metrics</h2>
            {project && onNew && (
              <button className="primary metrics-new" onClick={onNew}>
                <Plus size={14} />
                New metric
              </button>
            )}
          </div>
          <p>What each metric measures, how it is calculated and where its data comes from. Explained here, never executed.</p>
        </header>
        <div className="metrics-filters">
          <label className="metrics-search">
            <Search size={15} />
            <input aria-label="Find a metric" placeholder="Find a metric, owner or concept" value={query} onChange={e => setQuery(e.target.value)} />
          </label>
          <MetricFilterControls kpis={kpis} filters={filters} onChange={setFilters} />
        </div>
        {metricsBody}
      </section>
      {current && project && (
        <section ref={detailPane} className="metrics-detail" aria-label={`Metric ${current.label}`}>
          <button className="metrics-back" onClick={() => onSelect('')}>
            <ArrowLeft size={15} />
            All metrics
          </button>
          <MetricDetail
            key={metricKey(current)}
            project={project}
            kpi={current}
            all={kpis}
            onEdit={onEdit ? () => onEdit(current) : undefined}
            onAddAttributes={onAddAttributes ? () => onAddAttributes(current) : undefined}
          />
        </section>
      )}
    </div>
  );
}
/** Exports the stable metric key used by selection and navigation. */
export { metricKey as kpiKey };
