import { useCallback, useState } from 'react';
import { auditLabel, whenLabel } from './helpers';
import { SelectField } from './SelectField';
import { adminApi, problemText } from './api';
import { useAdminData } from './useAdminData';
import { SectionStatus } from './SectionStatus';
import { EmptyState } from '../projects/EmptyState';
import { RecordList, type RecordColumn } from './RecordList';
import type { AuditEntry } from './types';

const filterLabels: Record<string, string> = {
  principal: 'Person',
  action: 'Action',
  project: 'Resource project',
  from: 'From',
  to: 'To',
};
/** Each column pairs two facts on separate lines, so the table stays three columns wide. */
const auditColumns: RecordColumn<AuditEntry>[] = [
  {
    label: 'When / person',
    value: entry => (
      <>
        {whenLabel(entry.at)}
        <br />
        {entry.principal.name ?? entry.principal.id}
      </>
    ),
  },
  {
    label: 'Action / resource',
    value: entry => (
      <>
        <span title={entry.action}>{auditLabel(entry.action)}</span>
        {entry.tool && ` · ${entry.tool}`}
        <br />
        {Object.values(entry.resource).join(' · ')}
      </>
    ),
  },
  {
    label: 'Decision',
    className: entry => `admin-audit-decision ${entry.decision}`,
    value: entry => (
      <>
        {auditLabel(entry.decision)}
        {entry.outcome && ` · ${entry.outcome}`}
        <br />
        {entry.rules.map(rule => (
          <span key={rule} title={rule}>
            {auditLabel(rule)}{' '}
          </span>
        ))}
      </>
    ),
  },
];

// Phones start with the filters folded so the results are what the page opens on.
function startsWithFiltersOpen(): boolean {
  return globalThis.matchMedia?.('(min-width: 601px)').matches ?? true;
}

function activeFilterCount(filters: Record<string, string>): number {
  return Object.values(filters).filter(value => value !== '').length;
}
/** Filters and pages the server-scoped audit stream and exports only the selected filters. */
export function AuditSection() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState('');
  const [previous, setPrevious] = useState<string[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(() => adminApi.audit({ ...filters, cursor }), [filters, cursor]);
  const { data, error: loadError, reload } = useAdminData(load);
  function filter(name: string, value: string) {
    setFilters({ ...filters, [name]: value });
    setCursor('');
    setPrevious([]);
  }
  function next() {
    if (!data?.next) return;
    setPrevious([...previous, cursor]);
    setCursor(data.next);
  }
  function back() {
    setCursor(previous.at(-1) ?? '');
    setPrevious(previous.slice(0, -1));
  }
  async function download(format: 'jsonl' | 'csv') {
    setError('');
    try {
      const blob = await adminApi.exportAudit(filters, format);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (problem) {
      setError(problemText(problem));
    }
  }
  return (
    <>
      <details className="admin-filter-disclosure" open={startsWithFiltersOpen()}>
        <summary>Filters{activeFilterCount(filters) > 0 && ` (${activeFilterCount(filters)})`}</summary>
        <div className="admin-filters">
          {Object.entries(filterLabels).map(([name, label]) => (
            <label key={name}>
              {label}
              <input type={name === 'from' || name === 'to' ? 'datetime-local' : 'text'} value={filters[name] ?? ''} onChange={event => filter(name, event.target.value)} />
            </label>
          ))}
          <SelectField label="Decision" value={filters.decision ?? ''} onChange={event => filter('decision', event.target.value)}>
            <option value="">All</option>
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </SelectField>
        </div>
      </details>
      <SectionStatus subject="the audit record" loading={!data && !loadError} error={loadError} onRetry={reload} />
      {error && <p role="alert">{error}</p>}
      <div className="admin-actions">
        <button onClick={() => void download('jsonl')}>Export JSONL</button>
        <button onClick={() => void download('csv')}>Export CSV</button>
      </div>
      {data?.entries.length === 0 && (
        <EmptyState title={activeFilterCount(filters) > 0 ? 'No decisions match these filters' : 'No access decisions recorded yet'}>
          {activeFilterCount(filters) > 0 ? 'Change or clear the filters to see more.' : 'Decisions appear here as people use the workbench.'}
        </EmptyState>
      )}
      {data && data.entries.length > 0 && <RecordList label="Access decisions" records={data.entries} columns={auditColumns} recordKey={(entry, index) => entry.requestId + index} />}
      <div className="admin-actions">
        <button disabled={!previous.length} onClick={back}>
          Previous page
        </button>
        <button disabled={!data?.next} onClick={next}>
          Next page
        </button>
      </div>
    </>
  );
}
