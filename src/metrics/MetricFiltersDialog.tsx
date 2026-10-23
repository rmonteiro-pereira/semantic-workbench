/** The metrics list's filters and grouping, opened from one Filters button. */
import React, { useMemo } from 'react';
import type { KpiSummary } from '../../server/agent/explain';
import { Modal } from '../projects/Modal';
import { typeLabel } from './format';
import type { GroupBy, MetricFilters } from './metric-filters';
import { groupLabel, noFilters } from './metric-filters';

function distinct(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter(Boolean) as string[])].sort();
}

/** Lets the reader narrow and group the metrics list; changes apply as they are made. */
export function MetricFiltersDialog({
  kpis,
  filters,
  onChange,
  onClose,
}: {
  kpis: KpiSummary[];
  filters: MetricFilters;
  onChange: (filters: MetricFilters) => void;
  onClose: () => void;
}) {
  const owners = useMemo(() => distinct(kpis.map(kpi => kpi.owner)), [kpis]);
  const statuses = useMemo(() => distinct(kpis.map(kpi => kpi.status)), [kpis]);
  const types = useMemo(() => [...new Set(kpis.map(kpi => kpi.type))].sort(), [kpis]);
  const footer = (
    <>
      <button type="button" onClick={() => onChange(noFilters)}>
        Reset
      </button>
      <button type="button" className="primary" onClick={onClose}>
        Done
      </button>
    </>
  );
  return (
    <Modal title="Filters" size="small" onCancel={onClose} footer={footer}>
      <label>
        Group by
        <select
          aria-label="Group metrics by"
          value={filters.groupBy}
          onChange={event => onChange({ ...filters, groupBy: event.target.value as GroupBy })}
        >
          {Object.entries(groupLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select
          aria-label="Filter by type"
          value={filters.type}
          onChange={event =>
            onChange({ ...filters, type: event.target.value as MetricFilters['type'] })
          }
        >
          <option value="">All</option>
          {types.map(type => (
            <option key={type} value={type}>
              {typeLabel[type]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select
          aria-label="Filter by status"
          value={filters.status}
          onChange={event => onChange({ ...filters, status: event.target.value })}
        >
          <option value="">All</option>
          {statuses.map(status => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <label>
        Owner
        <select
          aria-label="Filter by owner"
          value={filters.owner}
          onChange={event => onChange({ ...filters, owner: event.target.value })}
        >
          <option value="">All</option>
          {owners.map(owner => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
      </label>
      <label
        className="item-check"
        title="Only metrics with workbench attributes (type, owner, status, targets)"
      >
        <input
          type="checkbox"
          checked={filters.governedOnly}
          onChange={event => onChange({ ...filters, governedOnly: event.target.checked })}
        />
        Governed only
      </label>
    </Modal>
  );
}
