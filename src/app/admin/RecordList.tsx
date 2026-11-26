import type { ReactNode } from 'react';

/** One column of a record list: its heading, which also labels the value on a phone card. */
export type RecordColumn<Entry> = { label: string; value: (record: Entry) => ReactNode };

type RecordListProps<Entry> = {
  /** Names the list for screen readers, such as "Agent programs". */
  label: string;
  records: Entry[];
  columns: RecordColumn<Entry>[];
  recordKey: (record: Entry) => string;
  /** The buttons that act on one record; they sit in the last column. */
  actions?: (record: Entry) => ReactNode;
};

/**
 * The one way Admin lists records: a real table on wide screens and labelled cards on a phone,
 * with each record's actions as plain buttons in its last column.
 */
export function RecordList<Entry>({ label, records, columns, recordKey, actions }: RecordListProps<Entry>) {
  return (
    <div className="admin-table">
      <table className="admin-records" aria-label={label}>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.label}>{column.label}</th>
            ))}
            {actions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {records.map(record => (
            <tr key={recordKey(record)}>
              {columns.map(column => (
                <td key={column.label} data-label={column.label}>
                  {column.value(record)}
                </td>
              ))}
              {actions && (
                <td data-label="Actions">
                  <div className="admin-actions">{actions(record)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
