import type { ReactNode } from 'react';

/**
 * One column of a record list: its heading, which also labels the value on a phone card, and an
 * optional class for the value cell, such as a colour for a decision.
 */
export type RecordColumn<Entry> = { label: string; value: (record: Entry) => ReactNode; className?: (record: Entry) => string };

type RecordListProps<Entry> = {
  /** Names the list for screen readers, such as "Agent programs". */
  label: string;
  records: Entry[];
  columns: RecordColumn<Entry>[];
  /** A stable key for the record; the position helps when records can repeat, such as audit entries. */
  recordKey: (record: Entry, index: number) => string;
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
          {records.map((record, index) => (
            <tr key={recordKey(record, index)}>
              {columns.map(column => (
                <td key={column.label} data-label={column.label} className={column.className?.(record)}>
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
