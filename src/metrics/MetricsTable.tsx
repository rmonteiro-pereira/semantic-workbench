/** The metrics list as a table that becomes a stack of cards on phones. */
import React from 'react';
import type { KpiSummary } from '../../server/agent/explain';
import { conceptText, typeLabel } from './format';
import type { GroupBy, MetricColumns } from './metric-filters';
import { metricKey } from './metric-filters';

function MetricRow({
  kpi,
  columns,
  active,
  onSelect,
}: {
  kpi: KpiSummary;
  columns: MetricColumns;
  active: boolean;
  onSelect: (key: string) => void;
}) {
  const key = metricKey(kpi);
  const needsRepair = kpi.findings.some(finding => finding.severity === 'error');
  return (
    <tr className={active ? 'selected' : ''} aria-selected={active}>
      <td data-label="Metric">
        <button
          className="metrics-name"
          aria-label={`${kpi.label}: explain`}
          aria-current={active ? 'true' : undefined}
          onClick={() => onSelect(active ? '' : key)}
        >
          <strong>{kpi.label}</strong>
          <code>{kpi.name}</code>
        </button>
        {needsRepair && (
          <span
            className="metrics-flag error"
            title={kpi.findings.map(finding => finding.message).join('\n')}
          >
            Needs repair
          </span>
        )}
      </td>
      <td data-label="Type" className="col-type">
        <span className={`kpi-pill type-${kpi.type}`}>{typeLabel[kpi.type]}</span>
        {!kpi.typeDeclared && (
          <small className="inferred" title="Not declared; read from the expression">
            inferred
          </small>
        )}
      </td>
      {columns.unit && (
        <td data-label="Unit" className="col-unit">
          {kpi.unit ?? <span className="muted">—</span>}
        </td>
      )}
      {columns.status && (
        <td data-label="Status">
          {kpi.status ? (
            <span className={`kpi-status status-${kpi.status}`}>{kpi.status}</span>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
      )}
      {columns.owner && (
        <td data-label="Owner" className="col-owner">
          {kpi.owner ?? <span className="muted">—</span>}
        </td>
      )}
      {columns.concept && (
        <td data-label="Concept" className="col-concept">
          {kpi.concepts.length ? (
            <span className="kpi-concepts">{conceptText(kpi.concepts)}</span>
          ) : (
            <span className="muted">Not bound</span>
          )}
        </td>
      )}
    </tr>
  );
}

/** Renders the grouped metric rows; columns without data in any metric are left out. */
export function MetricsTable({
  groups,
  groupBy,
  columns,
  selected,
  onSelect,
}: {
  groups: [string, KpiSummary[]][];
  groupBy: GroupBy;
  columns: MetricColumns;
  selected: string;
  onSelect: (key: string) => void;
}) {
  const columnCount = 2 + Object.values(columns).filter(Boolean).length;
  return (
    <div className="metrics-table-wrap">
      <table className="metrics-table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col" className="col-type">
              Type
            </th>
            {columns.unit && (
              <th scope="col" className="col-unit">
                Unit
              </th>
            )}
            {columns.status && <th scope="col">Status</th>}
            {columns.owner && (
              <th scope="col" className="col-owner">
                Owner
              </th>
            )}
            {columns.concept && (
              <th scope="col" className="col-concept">
                Concept
              </th>
            )}
          </tr>
        </thead>
        {groups.map(([group, items]) => (
          <tbody key={group}>
            {groupBy !== 'none' && (
              <tr className="metrics-group">
                <th colSpan={columnCount} scope="rowgroup">
                  {group}
                  <span>{items.length}</span>
                </th>
              </tr>
            )}
            {items.map(kpi => (
              <MetricRow
                key={metricKey(kpi)}
                kpi={kpi}
                columns={columns}
                active={metricKey(kpi) === selected}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
