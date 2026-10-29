/** Lists an ODCS object's properties with filter and sort. Logical type and the Required, Unique
 * and Primary key flags change in the row; the rest changes in an edit dialog. */
import { useRecordedState } from '../workspace/hooks/useRecordedState';
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Search } from 'lucide-react';
import { odcsForeignKeys } from '../../shared/odcs/foreign-keys';
import { flattenProperties } from './odcs-diff';
import { hopSentence } from './lineage';
import { Badge, badge } from '../components/PropertyBadges';
import type { PropertyChange, PropertyEditor } from './PropertyEditors';
import { FlagCheckbox, LogicalTypeSelect } from './PropertyInlineControls';
import './odcs.css';
import './contract.css';
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const text = (value: unknown) => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
};
type Property = Record<string, any>;
type Row = { path: string; property: Property };
/** A property attribute the rows can be sorted and filtered by. */
type SortField = { key: string; label: string; value: (property: Property) => unknown };
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
  for (const odcsForeignKey of odcsForeignKeys(data))
    if (odcsForeignKey.from === objectIndex)
      for (const name of odcsForeignKey.label.split(', ')) {
        const targetName = String(schema[odcsForeignKey.to]?.name);
        const xs = out.get(name) ?? [];
        if (!xs.includes(targetName)) xs.push(targetName);
        out.set(name, xs);
      }
  return out;
}

// The same keys as plain sentences, `orders.customer_id → customers.id`, by column and target.
function foreignKeySentences(data: any, objectIndex: number) {
  const schema = list(data?.schema);
  const own = String(schema[objectIndex]?.name);
  const out = new Map<string, string>();
  for (const odcsForeignKey of odcsForeignKeys(data))
    if (odcsForeignKey.from === objectIndex)
      odcsForeignKey.fromColumns.forEach((column, i) => {
        const parent = `${String(schema[odcsForeignKey.to]?.name)}.${odcsForeignKey.toColumns[i]}`;
        out.set(`${column}>${String(schema[odcsForeignKey.to]?.name)}`, hopSentence({ child: `${own}.${column}`, parent }));
      });
  return out;
}

/** Returns the searchable text of one row for a sort field. */
function fieldText(row: Row, key: string, targets: Map<string, string[]>) {
  if (key === 'name') return row.path;
  if (key === 'foreignKeys') return (targets.get(row.path) ?? []).join(', ');
  return text(SORT_FIELDS.find(field => field.key === key)!.value(row.property));
}

/** Filters rows by any attribute and orders them by the chosen one. */
function visibleRows(rows: Row[], filter: string, sort: Sort | null, targets: Map<string, string[]>) {
  const query = filter.trim().toLowerCase();
  const matching = query ? rows.filter(row => SORT_FIELDS.some(f => fieldText(row, f.key, targets).toLowerCase().includes(query))) : rows;
  if (!sort) return matching;
  const compare = (a: Row, b: Row) =>
    fieldText(a, sort.key, targets).localeCompare(fieldText(b, sort.key, targets), undefined, {
      numeric: true,
    });
  return [...matching].sort((a, b) => sort.direction * compare(a, b));
}

/** Which optional columns have something to show; empty columns are not drawn. */
function usedColumns(rows: Row[], targets: Map<string, string[]>, editor?: PropertyEditor) {
  const some = (test: (property: Property) => boolean) => rows.some(row => test(row.property));
  return {
    // With an editor the three flags are checkboxes in columns of their own, drawn even when no
    // row sets one yet; without it they are badges, drawn only when a row has one.
    flagColumns: Boolean(editor),
    constraints: some(p => p.required === true || p.unique === true || p.primaryKey === true),
    physicalType: some(p => Boolean(text(p.physicalType))),
    classification: some(p => Boolean(text(p.classification))),
    description: some(p => Boolean(text(p.description))),
    tags: some(p => list(p.tags).length > 0),
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
  const sentences = useMemo(() => foreignKeySentences(data, objectIndex), [data, objectIndex]);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useRecordedState<Sort | null>('dataset.sort', null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [saveError, setSaveError] = useState('');
  const shown = useMemo(() => visibleRows(rows, filter, sort, targets), [rows, filter, sort, targets]);
  const columns = usedColumns(rows, targets, editor);
  async function saveInRow(row: Row, change: PropertyChange) {
    const failure = await editor?.saveChange(objectIndex, row.path, change);
    setSaveError(failure ?? '');
  }
  return (
    <>
      <div className="odcs-toolbar">
        <label className="odcs-search">
          <Search size={14} />
          <input type="search" aria-label="Filter properties" placeholder="Filter properties" value={filter} onChange={e => setFilter(e.target.value)} />
        </label>
        <SortControl sort={sort} onChange={setSort} />
        <small>{shown.length === rows.length ? `${rows.length} properties` : `${shown.length} of ${rows.length} properties`}</small>
      </div>
      <div className="odcs-table-wrap">
        <table className="odcs-table odcs-properties stack" aria-label="Properties">
          <PropertiesHead columns={columns} />
          <tbody>
            {shown.map(row => (
              <PropertyRow
                key={row.path}
                row={row}
                targets={targets.get(row.path) ?? []}
                sentences={sentences}
                columns={columns}
                onOpenObject={onOpenObject}
                onEdit={editor?.canEditProperty(row.path, row.property) ? setEditing : undefined}
                onChange={change => saveInRow(row, change)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {saveError && (
        <p role="alert" className="dialog-error">
          {saveError}
        </p>
      )}
      {!shown.length && <p className="odcs-note">No property matches “{filter}”.</p>}
      {editing &&
        editor?.renderDialog({
          objectIndex,
          tableName: String(object?.name),
          path: editing.path,
          property: editing.property,
          onClose: () => setEditing(null),
        })}
    </>
  );
}

function SortControl({ sort, onChange }: { sort: Sort | null; onChange: (sort: Sort | null) => void }) {
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
        <select aria-label="Sort properties by" value={sort?.key ?? ''} onChange={e => chooseField(e.target.value)}>
          <option value="">File order</option>
          {SORT_FIELDS.map(field => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </select>
      </label>
      {sort && (
        <button type="button" aria-label={sort.direction === 1 ? 'Sorted ascending, reverse' : 'Sorted descending, reverse'} title="Reverse the sort order" onClick={reverse}>
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
        <th>Logical type</th>
        {columns.physicalType && <th>Physical type</th>}
        {columns.flagColumns && (
          <>
            <th>Required</th>
            <th>Unique</th>
            <th>Primary key</th>
          </>
        )}
        {!columns.flagColumns && columns.constraints && <th>Constraints</th>}
        {columns.classification && <th>Classification</th>}
        {columns.description && <th>Description</th>}
        {columns.tags && <th>Tags</th>}
        {columns.foreignKeys && <th>Foreign keys</th>}
        {columns.actions && <th className="col-actions">Edit</th>}
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

function ForeignKeyChips({ targets, sentenceOf, onOpen }: { targets: string[]; sentenceOf: (target: string) => string | undefined; onOpen: (name: string) => void }) {
  return (
    <>
      {targets.map(target => (
        <button key={target} className="odcs-link fk" aria-label={`Open ${target}`} title={sentenceOf(target) ?? `Foreign key to ${target}`} onClick={() => onOpen(target)}>
          <Badge kind="fk" />
          {target}
        </button>
      ))}
    </>
  );
}

function DescriptionCell({ property }: { property: Property }) {
  const description = text(property.description);
  if (!description) return null;
  return (
    <span className="odcs-clamp" title={description}>
      {description}
    </span>
  );
}

function TagsCell({ property }: { property: Property }) {
  const tags = list(property.tags);
  if (!tags.length) return null;
  return (
    <span className="odcs-tags">
      {tags.map(tag => (
        <em key={text(tag)} className="odcs-tag">
          {text(tag)}
        </em>
      ))}
    </span>
  );
}

const FLAG_COLUMNS = [
  { key: 'required', label: 'Required' },
  { key: 'unique', label: 'Unique' },
  { key: 'primaryKey', label: 'Primary key' },
] as const;

function FlagCells({ row, canEdit, onChange }: { row: Row; canEdit: boolean; onChange: (change: PropertyChange) => Promise<void> }) {
  return (
    <>
      {FLAG_COLUMNS.map(({ key, label }) => (
        <td key={key} data-label={label}>
          <FlagCheckbox label={`${label} of ${row.path}`} checked={row.property[key] === true} disabled={!canEdit} onChange={checked => onChange({ key, value: checked ? true : undefined })} />
        </td>
      ))}
    </>
  );
}

type RowProps = {
  row: Row;
  targets: string[];
  sentences: Map<string, string>;
  columns: UsedColumns;
  onOpenObject: (name: string) => void;
  onEdit?: (row: Row) => void;
  onChange: (change: PropertyChange) => Promise<void>;
};
function PropertyRow(props: RowProps) {
  const { row, targets, sentences, columns, onOpenObject, onEdit, onChange } = props;
  const { path, property } = row;
  const depth = path.split('.').length - 1 + (path.match(/\[\]/g)?.length ?? 0);
  const classification = text(property.classification);
  return (
    <tr>
      <td className="col-name" data-label="Name" style={depth ? { paddingLeft: 10 + depth * 14 } : undefined}>
        <code>{path}</code>
      </td>
      <td data-label="Logical type">
        {onEdit ? (
          <LogicalTypeSelect label={`Logical type of ${path}`} value={text(property.logicalType)} onChange={value => onChange({ key: 'logicalType', value: value || undefined })} />
        ) : (
          text(property.logicalType) || '—'
        )}
      </td>
      {columns.physicalType && <td data-label="Physical type">{text(property.physicalType)}</td>}
      {columns.flagColumns && <FlagCells row={row} canEdit={Boolean(onEdit)} onChange={onChange} />}
      {!columns.flagColumns && columns.constraints && (
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
      {columns.tags && (
        <td data-label="Tags">
          <TagsCell property={property} />
        </td>
      )}
      {columns.foreignKeys && (
        <td data-label="Foreign keys">
          <ForeignKeyChips targets={targets} sentenceOf={target => sentences.get(`${row.path}>${target}`)} onOpen={onOpenObject} />
        </td>
      )}
      {columns.actions && (
        <td className="col-actions" data-label="Edit">
          {onEdit && (
            <button type="button" className="odcs-row-edit" aria-label={`Edit ${path}`} onClick={() => onEdit(row)}>
              <Pencil size={13} />
              Edit
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
