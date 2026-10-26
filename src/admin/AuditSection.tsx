import { useCallback, useState } from 'react';
import { whenLabel } from './format';
import { SelectField } from './SelectField';
import { adminApi, problemText } from './api';
import { useAdminData } from './useAdminData';

const filterLabels: Record<string, string> = {
  principal: 'Person',
  action: 'Action',
  project: 'Resource project',
  from: 'From',
  to: 'To',
};
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
  const { data, error: loadError } = useAdminData(load);
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
        <summary>
          Filters{activeFilterCount(filters) > 0 && ` (${activeFilterCount(filters)})`}
        </summary>
        <div className="admin-filters">
          {Object.entries(filterLabels).map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                type={name === 'from' || name === 'to' ? 'datetime-local' : 'text'}
                value={filters[name] ?? ''}
                onChange={event => filter(name, event.target.value)}
              />
            </label>
          ))}
          <SelectField
            label="Decision"
            value={filters.decision ?? ''}
            onChange={event => filter('decision', event.target.value)}
          >
            <option value="">All</option>
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </SelectField>
        </div>
      </details>
      {(error || loadError) && <p role="alert">{error || loadError}</p>}
      <div className="admin-actions">
        <button onClick={() => void download('jsonl')}>Export JSONL</button>
        <button onClick={() => void download('csv')}>Export CSV</button>
      </div>
      <div className="admin-table">
        <table className="admin-records">
          <thead>
            <tr>
              <th>When / person</th>
              <th>Action / resource</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {data?.entries.map((entry, index) => (
              <tr key={entry.requestId + index}>
                <td data-label="When / person">
                  {whenLabel(entry.at)}
                  <br />
                  {entry.principal.name ?? entry.principal.id}
                </td>
                <td data-label="Action / resource">
                  {entry.action}
                  <br />
                  {Object.values(entry.resource).join(' · ')}
                </td>
                <td data-label="Decision">
                  {entry.decision}
                  {entry.outcome && ` · ${entry.outcome}`}
                  <br />
                  {entry.rules.join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
