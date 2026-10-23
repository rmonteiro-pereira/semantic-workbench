/** Lists an ODCS object's properties as read-only rows, with filter, sort and an edit dialog. */
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Search } from 'lucide-react';
import { odcsForeignKeys } from '../odcs';
import { flattenProperties } from './odcs-diff';
import { Badge, badge } from '../PropertyBadges';
import type { PropertyEditor } from './PropertyEditors';
import './odcs.css';
import './contract.css';
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const text = (v: unknown) =>
  v === undefined || v === null
    ? ''
    : typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : JSON.stringify(v);
type Property = Record<string, any>;
type Row = { path: string; property: Property };
/** A property attribute the rows can be sorted and filtered by. */
type SortField = { key: string; label: string; value: (p: Property) => unknown };
const SORT_FIELDS: SortField[] = [
  { key: 'name', label: 'Name', value: () => undefined },
  { key: 'logicalType', label: 'Logical type', value: p => p.logicalType },
  { key: 'physicalType', label: 'Physical type', value: p => p.physicalType },
  { key: 'required', label: 'Required', value: p => p.required === true },
  { key: 'unique', label: 'Unique', value: p => p.unique === true },
  { key: 'primaryKey', label: 'Primary key', value: p => p.primaryKey === true },
  { key: 'classification', label: 'Classification', value: p => p.classification },
  { key: 'description', label: 'Description', value: p => p.description },
  { key: 'tags', label: 'Tags', value: p => list(p.tags).join(', ') },
  { key: 'foreignKeys', label: 'Foreign keys', value: () => undefined },
];
type Sort = { key: string; direction: 1 | -1 };

// Foreign-key targets per property path: property-level relationships and schema-level ones.
function foreignKeys(data: any, objectIndex: number) {
  const schema = list(data?.schema);
  const out = new Map<string, string[]>();
  for (const k of odcsForeignKeys(data))
    if (k.from === objectIndex)
      for (const name of k.label.split(', ')) {
        const t = String(schema[k.to]?.name);
        const xs = out.get(name) ?? [];
        if (!xs.includes(t)) xs.push(t);
        out.set(name, xs);
      }
  return out;
}

/** Returns the searchable text of one row for a sort field. */
function fieldText(row: Row, key: string, targets: Map<string, string[]>) {
  if (key === 'name') return row.path;
  if (key === 'foreignKeys') return (targets.get(row.path) ?? []).join(', ');
  return text(SORT_FIELDS.find(field => field.key === key)!.value(row.property));
}

/** Filters rows by any attribute and orders them by the chosen one. */
function visibleRows(
  rows: Row[],
  filter: string,
  sort: Sort | null,
  targets: Map<string, string[]>,
) {
  const query = filter.trim().toLowerCase();
  const matching = query
    ? rows.filter(row =>
        SORT_FIELDS.some(f => fieldText(row, f.key, targets).toLowerCase().includes(query)),
      )
    : rows;
  if (!sort) return matching;
  const compare = (a: Row, b: Row) =>
    fieldText(a, sort.key, targets).localeCompare(fieldText(b, sort.key, targets), undefined, {
      numeric: true,
    });
  return [...matching].sort((a, b) => sort.direction * compare(a, b));
}

/** Which optional columns have something to show; empty columns are not drawn. */
function usedColumns(rows: Row[], targets: Map<string, string[]>, editor?: PropertyEditor) {
  const some = (test: (p: Property) => boolean) => rows.some(row => test(row.property));
  return {
    constraints: some(p => p.required === true || p.unique === true || p.primaryKey === true),
    classification: some(p => Boolean(text(p.classification))),
    description: some(p => Boolean(text(p.description)) || list(p.tags).length > 0),
    foreignKeys: rows.some(row => (targets.get(row.path) ?? []).length > 0),
    actions: Boolean(editor) && rows.some(row => editor!.canEditProperty(row.path, row.property)),
  };
}

type TabProps = {
  data: any;
  objectIndex: number;
  onOpenObject: (name: string) => void;
  editor?: PropertyEditor;
};
/** Displays the properties of one object with filter, sort and the edit dialog. */
export function PropertiesTab({ data, objectIndex, onOpenObject, editor }: TabProps) {
  const object = list(data?.schema)[objectIndex];
  const rows = useMemo(() => flattenProperties(object?.properties), [object]);
  const targets = useMemo(() => foreignKeys(data, objectIndex), [data, objectIndex]);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<Sort | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const shown = useMemo(
    () => visibleRows(rows, filter, sort, targets),
    [rows, filter, sort, targets],
  );
  const columns = usedColumns(rows, targets, editor);
  return (
    <>
      <div className="odcs-toolbar">
        <label className="odcs-search">
          <Search size={14} />
          <input
            type="search"
            aria-label="Filter properties"
            placeholder="Filter properties…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </label>
        <SortControl sort={sort} onChange={setSort} />
        <small>
          {shown.length === rows.length
            ? `${rows.length} properties`
            : `${shown.length} of ${rows.length} properties`}
        </small>
      </div>
      <div className="odcs-table-wrap">
        <table className="odcs-table stack" aria-label="Properties">
          <PropertiesHead columns={columns} />
          <tbody>
            {shown.map(row => (
              <PropertyRow
                key={row.path}
                row={row}
                targets={targets.get(row.path) ?? []}
                columns={columns}
                onOpenObject={onOpenObject}
                onEdit={editor?.canEditProperty(row.path, row.property) ? setEditing : undefined}
              />
            ))}
          </tbody>
        </table>
      </div>
      {!shown.length && <p className="odcs-note">No property matches “{filter}”.</p>}
      {editing &&
        editor?.renderDialog({
          objectIndex,
          path: editing.path,
          property: editing.property,
          onClose: () => setEditing(null),
        })}
    </>
  );
}

function SortControl({
  sort,
  onChange,
}: {
  sort: Sort | null;
  onChange: (s: Sort | null) => void;
}) {
  function chooseField(key: string) {
    onChange(key ? { key, direction: sort?.direction ?? 1 } : null);
  }
  function reverse() {
    if (sort) onChange({ ...sort, direction: sort.direction === 1 ? -1 : 1 });
  }
  return (
    <div className="odcs-sort-control">
      <label>
        <span>Sort by</span>
        <select
          aria-label="Sort properties by"
          value={sort?.key ?? ''}
          onChange={e => chooseField(e.target.value)}
        >
          <option value="">File order</option>
          {SORT_FIELDS.map(field => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </select>
      </label>
      {sort && (
        <button
          type="button"
          aria-label={
            sort.direction === 1 ? 'Sorted ascending, reverse' : 'Sorted descending, reverse'
          }
          title="Reverse the sort order"
          onClick={reverse}
        >
          {sort.direction === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
        </button>
      )}
    </div>
  );
}

type UsedColumns = ReturnType<typeof usedColumns>;
function PropertiesHead({ columns }: { columns: UsedColumns }) {
  return (
    <thead>
      <tr>
        <th>Name</th>
        <th>Type</th>
        {columns.constraints && <th>Constraints</th>}
        {columns.classification && <th>Classification</th>}
        {columns.description && <th>Description</th>}
        {columns.foreignKeys && <th>Foreign keys</th>}
        {columns.actions && <th>Edit</th>}
      </tr>
    </thead>
  );
}

const CONSTRAINT_BADGES = [
  { key: 'primaryKey', info: badge('pk') },
  { key: 'required', info: badge('required') },
  { key: 'unique', info: badge('unique') },
] as const;

function ConstraintBadges({ property }: { property: Property }) {
  const present = CONSTRAINT_BADGES.filter(({ key }) => property[key] === true);
  return (
    <span className="prop-badges">
      {present.map(({ key, info }) => (
        <Badge key={key} kind={info.kind} title={info.title}>
          {info.label}
        </Badge>
      ))}
    </span>
  );
}

function ForeignKeyChips({ targets, onOpen }: { targets: string[]; onOpen: (n: string) => void }) {
  return (
    <>
      {targets.map(target => (
        <button
          key={target}
          className="odcs-link fk"
          aria-label={`Open ${target}`}
          title={`Foreign key to ${target}`}
          onClick={() => onOpen(target)}
        >
          <Badge kind="fk" />
          {target}
        </button>
      ))}
    </>
  );
}

function DescriptionCell({ property }: { property: Property }) {
  const description = text(property.description);
  const tags = list(property.tags);
  return (
    <>
      {description && (
        <span className="odcs-clamp" title={description}>
          {description}
        </span>
      )}
      {tags.length > 0 && (
        <span className="odcs-tags">
          {tags.map(tag => (
            <em key={text(tag)} className="odcs-tag">
              {text(tag)}
            </em>
          ))}
        </span>
      )}
    </>
  );
}

function TypeCell({ property }: { property: Property }) {
  const physical = text(property.physicalType);
  return (
    <>
      <span>{text(property.logicalType) || '—'}</span>
      {physical && <small className="odcs-secondary">{physical}</small>}
    </>
  );
}

type RowProps = {
  row: Row;
  targets: string[];
  columns: UsedColumns;
  onOpenObject: (name: string) => void;
  onEdit?: (row: Row) => void;
};
function PropertyRow({ row, targets, columns, onOpenObject, onEdit }: RowProps) {
  const { path, property } = row;
  const depth = path.split('.').length - 1 + (path.match(/\[\]/g)?.length ?? 0);
  const classification = text(property.classification);
  return (
    <tr>
      <td
        className="col-name"
        data-label="Name"
        style={depth ? { paddingLeft: 10 + depth * 14 } : undefined}
      >
        <code>{path}</code>
      </td>
      <td data-label="Type">
        <TypeCell property={property} />
      </td>
      {columns.constraints && (
        <td data-label="Constraints">
          <ConstraintBadges property={property} />
        </td>
      )}
      {columns.classification && (
        <td data-label="Classification">
          {classification && (
            <Badge kind="classification" title={`Classification: ${classification}`}>
              {classification}
            </Badge>
          )}
        </td>
      )}
      {columns.description && (
        <td data-label="Description">
          <DescriptionCell property={property} />
        </td>
      )}
      {columns.foreignKeys && (
        <td data-label="Foreign keys">
          <ForeignKeyChips targets={targets} onOpen={onOpenObject} />
        </td>
      )}
      {columns.actions && (
        <td data-label="Edit">
          {onEdit && (
            <button
              type="button"
              className="odcs-row-edit"
              aria-label={`Edit ${path}`}
              onClick={() => onEdit(row)}
            >
              <Pencil size={13} />
              Edit
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
