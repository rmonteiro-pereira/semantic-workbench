/** Displays an ODCS object's properties, relationships, lineage, Git history and declared quality
 * rules. */
import React, { useEffect, useMemo, useState } from 'react';
import { parse } from 'yaml';
import { ArrowLeft, Table2, Workflow } from 'lucide-react';
import { odcsForeignKeys } from '../odcs';
import { scm, type Doc, type GitCommit as Commit } from '../projects/api';
import { diffObject, flattenProperties, lastChange, type ObjectDiff } from './odcs-diff';
import { buildLineage, closure, objectId, cardOfNode, type LineageCard } from './lineage';
import { LineageCanvas } from './LineageCanvas';
import { projectFiles, projectRevision } from './project-files';
import { rulesOf, tableTypeBadge } from './ContractOverview';
import { PropertiesTab } from './PropertiesTab';
import type { PropertyEditor } from './PropertyEditors';
import { ReadMore } from './ReadMore';
import './odcs.css';
// Quality rules are displayed as declared and never executed. Git history compares versions at
// property level.
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const text = (v: unknown) =>
  v === undefined || v === null
    ? ''
    : typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : JSON.stringify(v);
type Version = Commit & { source: string; data: any };

type Tab = 'Lineage' | 'Relationships' | 'Data Quality' | 'Properties' | 'History';
const TABS: Tab[] = ['Lineage', 'Relationships', 'Data Quality', 'Properties', 'History'];
type Props = {
  doc: Doc;
  data: any;
  objectName: string;
  projectDocs: Doc[];
  onBack: () => void;
  onOpenObject: (name: string) => void;
  onOpenInLineage?: (name: string) => void;
  onNeighborhood?: (card: LineageCard) => void;
  // Changes when Git reports a commit, switch or pull, so History follows commits made elsewhere.
  gitVersion?: number;
  // Opens properties in an edit dialog; without it the properties are read-only.
  editor?: PropertyEditor;
  // Says why cells are read-only, shown above the properties.
  propertiesNote?: string;
};
/** Displays one table's properties, lineage, relationships, history and quality. */
export function DatasetPage({
  doc,
  data,
  objectName,
  projectDocs,
  onBack,
  onOpenObject,
  onOpenInLineage,
  onNeighborhood,
  editor,
  propertiesNote,
  gitVersion = 0,
}: Props) {
  const schema = list(data?.schema);
  const index = schema.findIndex((o: any) => o?.name === objectName);
  const object = schema[index];
  const [tab, setTab] = useState<Tab>('Properties');
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [historyError, setHistoryError] = useState('');
  useEffect(() => {
    setTab('Properties');
  }, [objectName]);
  // The file's committed versions: last change in the header and the History tab.
  useEffect(() => {
    let live = true;
    setHistoryError('');
    scm
      .versions(doc.project, doc.path, 20)
      .then(vs => {
        if (!live) return;
        setVersions(
          vs.map(v => {
            let parsed: any = null;
            try {
              parsed = parse(v.source);
            } catch {}
            return { ...v, data: parsed };
          }),
        );
      })
      .catch(e => {
        if (live) {
          setVersions([]);
          setHistoryError(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, [doc.project, doc.path, doc.hash, gitVersion]);
  if (!object)
    return (
      <section className="odcs-page" aria-label={`Table ${objectName}`}>
        <button className="odcs-back" onClick={onBack}>
          <ArrowLeft size={14} />
          All tables
        </button>
        <p className="odcs-note">{objectName} is no longer in this contract.</p>
      </section>
    );
  const properties = flattenProperties(object.properties);
  const rules = rulesOf(object);
  const changed = versions ? lastChange(versions, objectName) : null;
  const tags = list(object.tags);
  return (
    <section className="odcs-page odcs-dataset" aria-label={`Table ${objectName}`}>
      <button className="odcs-back" onClick={onBack}>
        <ArrowLeft size={14} />
        All tables
      </button>
      <header className="odcs-head">
        <div className="odcs-title">
          <Table2 size={20} />
          <div>
            <h2>
              {objectName}
              {tableTypeBadge(object) && (
                <span className="odcs-type-badge">{tableTypeBadge(object)}</span>
              )}
            </h2>
            {object.physicalName && (
              <small>
                <code>{text(object.physicalName)}</code>
              </small>
            )}
          </div>
          {onOpenInLineage && (
            <button
              type="button"
              className="odcs-head-action"
              aria-label={`Open ${objectName} in lineage`}
              onClick={() => onOpenInLineage(objectName)}
            >
              <Workflow size={14} />
              Open in lineage
            </button>
          )}
        </div>
        <div className="odcs-facts dataset-facts" role="group" aria-label="Table facts">
          <span>
            <b>Type</b>
            <span>
              {[object.physicalType, object.logicalType].filter(Boolean).map(text).join(' · ') ||
                '—'}
            </span>
          </span>
          <span>
            <b>Properties</b>
            <span>
              {properties.length} {properties.length === 1 ? 'property' : 'properties'}
            </span>
          </span>
          <span>
            <b>Quality</b>
            <span>
              {rules.length} quality {rules.length === 1 ? 'rule' : 'rules'}
            </span>
          </span>
          <span>
            <b>Last change</b>
            <span>
              {versions === null ? (
                '…'
              ) : changed ? (
                <>
                  {changed.message} · <code>{changed.commit.slice(0, 7)}</code> ·{' '}
                  {new Date(changed.date).toLocaleDateString()} · {changed.author}
                </>
              ) : (
                'Not committed yet'
              )}
            </span>
          </span>
          {tags.length > 0 && (
            <span>
              <b>Tags</b>
              <span>
                {tags.map(t => (
                  <em key={text(t)} className="odcs-tag">
                    {text(t)}
                  </em>
                ))}
              </span>
            </span>
          )}
        </div>
        {object.description && <ReadMore>{text(object.description)}</ReadMore>}
      </header>
      <div className="odcs-tabs" role="tablist" aria-label="Asset views">
        {TABS.map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'selected' : ''}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'Data Quality' && rules.length > 0 && <small>{rules.length}</small>}
          </button>
        ))}
      </div>
      <div className="odcs-panel" role="tabpanel" aria-label={tab}>
        {tab === 'Properties' && propertiesNote && <p className="odcs-note">{propertiesNote}</p>}
        {tab === 'Properties' && (
          <PropertiesTab
            data={data}
            objectIndex={index}
            onOpenObject={onOpenObject}
            editor={editor}
          />
        )}
        {tab === 'Lineage' && (
          <LineageTab
            doc={doc}
            projectDocs={projectDocs}
            objectName={objectName}
            onOpenObject={onOpenObject}
            onNeighborhood={onNeighborhood}
          />
        )}
        {tab === 'Relationships' && (
          <RelationshipsTab data={data} objectIndex={index} onOpenObject={onOpenObject} />
        )}
        {tab === 'History' && (
          <HistoryTab versions={versions} error={historyError} objectName={objectName} />
        )}
        {tab === 'Data Quality' && <QualityTab object={object} />}
      </div>
    </section>
  );
}
// The asset's Lineage tab: the lineage canvas centred on this object, and per property the fields
// that read it and the metrics downstream of it, read from the same lineage graph.
function LineageTab({
  doc,
  projectDocs,
  objectName,
  onOpenObject,
  onNeighborhood,
}: {
  doc: Doc;
  projectDocs: Doc[];
  objectName: string;
  onOpenObject: (n: string) => void;
  onNeighborhood?: (card: LineageCard) => void;
}) {
  const rev = projectRevision(projectDocs);
  const graph = useMemo(
    () => buildLineage(projectFiles(projectDocs), doc.path, rev),
    [rev, doc.path],
  );
  const id = objectId(doc.path, objectName);
  const card = graph.cards.get(id);
  const rows = useMemo(
    () =>
      (card?.columns ?? []).map(col => {
        const down = closure(graph, [col.id], 'down');
        const fields: string[] = [];
        const metrics: string[] = [];
        for (const n of down.nodes) {
          if (n === col.id) continue;
          const c = graph.cards.get(cardOfNode(graph, n));
          if (!c) continue;
          if (c.kind === 'dataset' && n !== c.id)
            fields.push(`${c.label}.${n.slice(c.id.length + 1)}`);
          if (c.kind === 'metric') metrics.push(c.label);
        }
        return {
          path: col.path,
          fields: [...new Set(fields)].sort(),
          metrics: [...new Set(metrics)].sort(),
        };
      }),
    [graph, card],
  );
  if (!card) return <p className="odcs-note">No lineage for this table.</p>;
  return (
    <>
      <div className="odcs-lineage-host">
        <LineageCanvas
          graph={graph}
          center={id}
          compact
          ariaLabel="Lineage graph"
          storageKey={`workbench:lineage-steps:${doc.id}`}
          onOpenAsset={c => onOpenObject(c.label)}
          onNeighborhood={onNeighborhood}
        />
      </div>
      <h3 className="odcs-subhead">Property lineage</h3>
      <div className="odcs-table-wrap">
        <table className="odcs-table compact stack" aria-label="Property lineage">
          <thead>
            <tr>
              <th>Property</th>
              <th>Read by fields</th>
              <th>Metrics downstream</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.path}>
                <td data-label="Property">
                  <code>{r.path}</code>
                </td>
                <td data-label="Read by fields">
                  {r.fields.length ? (
                    r.fields.map(f => (
                      <code key={f} className="odcs-chip">
                        {f}
                      </code>
                    ))
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td data-label="Metrics downstream">
                  {r.metrics.length ? (
                    r.metrics.map(m => (
                      <span key={m} className="odcs-chip metric">
                        {m}
                      </span>
                    ))
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
// Relationships: foreign keys out of and into each column, both directions, with links.
function RelationshipsTab({
  data,
  objectIndex,
  onOpenObject,
}: {
  data: any;
  objectIndex: number;
  onOpenObject: (n: string) => void;
}) {
  const schema = list(data?.schema);
  const name = String(schema[objectIndex]?.name);
  const rows = useMemo(() => {
    const out: {
      column: string;
      direction: 'out' | 'in';
      other: string;
      otherColumn: string;
      label: string;
    }[] = [];
    for (const k of odcsForeignKeys(data))
      k.fromColumns.forEach((c, i) => {
        if (k.from === objectIndex)
          out.push({
            column: c,
            direction: 'out',
            other: String(schema[k.to]?.name),
            otherColumn: k.toColumns[i],
            label: k.label,
          });
        if (k.to === objectIndex)
          out.push({
            column: k.toColumns[i],
            direction: 'in',
            other: String(schema[k.from]?.name),
            otherColumn: c,
            label: k.label,
          });
      });
    return out.sort(
      (a, b) =>
        a.column.localeCompare(b.column) ||
        a.direction.localeCompare(b.direction) ||
        a.other.localeCompare(b.other),
    );
  }, [data, objectIndex]);
  if (!rows.length)
    return (
      <p className="odcs-note">{name} has no foreign keys and no other table references it.</p>
    );
  return (
    <>
      <p className="odcs-note">
        Foreign keys as declared in the contract. In lineage they are drawn from the referenced
        column to the referencing one (the workbench's reading).
      </p>
      <div className="odcs-table-wrap">
        <table className="odcs-table compact stack" aria-label="Relationships">
          <thead>
            <tr>
              <th>Column</th>
              <th>Direction</th>
              <th>Other table</th>
              <th>Other column</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td data-label="Column">
                  <code>{r.column}</code>
                </td>
                <td data-label="Direction">
                  {r.direction === 'out' ? (
                    <span className="odcs-dir out">references</span>
                  ) : (
                    <span className="odcs-dir in">referenced by</span>
                  )}
                </td>
                <td data-label="Other table">
                  <button
                    className="odcs-link fk"
                    aria-label={`Open ${r.other}`}
                    onClick={() => onOpenObject(r.other)}
                  >
                    {r.other}
                  </button>
                </td>
                <td data-label="Other column">
                  <code>{r.otherColumn}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function HistoryTab({
  versions,
  error,
  objectName,
}: {
  versions: Version[] | null;
  error: string;
  objectName: string;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => {
    if (versions && versions.length > 1) {
      setFrom(versions[1].commit);
      setTo(versions[0].commit);
    }
  }, [versions]);
  if (error)
    return (
      <p role="alert" className="odcs-note">
        History is not available: {error}
      </p>
    );
  if (!versions) return <p className="odcs-note">Loading versions…</p>;
  const count = (v: Version) => {
    const o = list(v.data?.schema).find((x: any) => x?.name === objectName);
    return o ? flattenProperties(o.properties).length : null;
  };
  const a = versions.find(v => v.commit === from);
  const b = versions.find(v => v.commit === to);
  const diff: ObjectDiff | null = a && b ? diffObject(a.data, b.data, objectName) : null;
  const option = (v: Version) => (
    <option key={v.commit} value={v.commit}>
      {v.commit.slice(0, 7)} · {text(v.data?.version)} · {v.message}
    </option>
  );
  return (
    <>
      <div className="odcs-table-wrap">
        <table className="odcs-table compact stack" aria-label="Versions">
          <thead>
            <tr>
              <th>Version</th>
              <th>Date</th>
              <th>Author</th>
              <th>Message</th>
              <th className="num">Properties</th>
            </tr>
          </thead>
          <tbody>
            {versions.map(v => (
              <tr key={v.commit} className={v.commit === from || v.commit === to ? 'selected' : ''}>
                <td data-label="Version">
                  {text(v.data?.version) || '—'} <code>{v.commit.slice(0, 7)}</code>
                </td>
                <td data-label="Date">{new Date(v.date).toLocaleString()}</td>
                <td data-label="Author">{v.author}</td>
                <td data-label="Message">{v.message}</td>
                <td className="num" data-label="Properties">
                  {count(v) ?? <span className="muted">absent</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {versions.length < 2 ? (
        <p className="odcs-note">
          {versions.length
            ? 'Only one committed version so far; commit a change to compare versions.'
            : 'This file has no commits yet.'}
        </p>
      ) : (
        <>
          <div className="odcs-compare">
            <label>
              <span>From version</span>
              <select
                aria-label="From version"
                value={from}
                onChange={e => setFrom(e.target.value)}
              >
                {versions.map(option)}
              </select>
            </label>
            <label>
              <span>To version</span>
              <select aria-label="To version" value={to} onChange={e => setTo(e.target.value)}>
                {versions.map(option)}
              </select>
            </label>
          </div>
          <section className="odcs-changes" aria-label="Changes between versions">
            {!diff ? (
              <p className="odcs-note">No changes to {objectName} between these versions.</p>
            ) : (
              <>
                {diff.kind !== 'changed' && (
                  <p>
                    <span className={`odcs-change ${diff.kind}`}>{diff.kind}</span> {objectName}{' '}
                    {diff.kind === 'added' ? 'appears' : 'disappears'} in this version.
                  </p>
                )}
                {diff.attributes.length > 0 && (
                  <ul className="odcs-change-list">
                    {diff.attributes.map(c => (
                      <li key={c.attribute}>
                        <span className="odcs-change changed">changed</span>
                        <b>{c.attribute}</b> <Values before={c.before} after={c.after} />
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="odcs-change-list">
                  {diff.properties.map(p => (
                    <li key={p.kind + p.path}>
                      <span className={`odcs-change ${p.kind}`}>{p.kind}</span>
                      <code>{p.path}</code>
                      {p.changes.length > 0 && (
                        <ul>
                          {p.changes.map(c => (
                            <li key={c.attribute}>
                              <b>{c.attribute}</b> <Values before={c.before} after={c.after} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}
const shown = (v: unknown) =>
  v === undefined ? '(none)' : typeof v === 'string' ? v : JSON.stringify(v);
const Values = ({ before, after }: { before: unknown; after: unknown }) => (
  <span className="odcs-values">
    <del>{shown(before)}</del> → <ins>{shown(after)}</ins>
  </span>
);
const OPERATORS: [string, string][] = [
  ['mustBe', '='],
  ['mustNotBe', '≠'],
  ['mustBeGreaterThan', '>'],
  ['mustBeGreaterOrEqualTo', '≥'],
  ['mustBeLessThan', '<'],
  ['mustBeLessOrEqualTo', '≤'],
];
/** Formats a declared quality rule's threshold for display. */
export function threshold(r: any) {
  for (const [k, op] of OPERATORS) if (r?.[k] !== undefined) return `${op} ${text(r[k])}`;
  if (Array.isArray(r?.mustBeBetween))
    return `between ${text(r.mustBeBetween[0])} and ${text(r.mustBeBetween[1])}`;
  if (Array.isArray(r?.mustNotBeBetween))
    return `not between ${text(r.mustNotBeBetween[0])} and ${text(r.mustNotBeBetween[1])}`;
  return '';
}
type QualityRow = { scope: string; rule: any };
type QualityColumn = { label: string; cell: (row: QualityRow) => React.ReactNode; filled: boolean };

/** Lists the quality table's columns; a column no rule fills is left out. */
function qualityColumns(rows: QualityRow[]): QualityColumn[] {
  const filled = (read: (rule: any) => unknown) => rows.some(row => Boolean(read(row.rule)));
  const columns: QualityColumn[] = [
    {
      label: 'Applies to',
      filled: true,
      cell: ({ scope }) =>
        scope === 'Table' ? <span className="muted">Table</span> : <code>{scope}</code>,
    },
    { label: 'Rule', filled: filled(r => r.name), cell: ({ rule }) => text(rule.name) },
    {
      label: 'Dimension',
      filled: filled(r => r.dimension),
      cell: ({ rule }) => text(rule.dimension),
    },
    {
      label: 'Severity',
      filled: filled(r => r.severity),
      cell: ({ rule }) =>
        rule.severity ? (
          <span className={`odcs-severity s-${text(rule.severity)}`}>{text(rule.severity)}</span>
        ) : null,
    },
    { label: 'Type', filled: filled(r => r.type), cell: ({ rule }) => text(rule.type) },
    {
      label: 'Check',
      filled: filled(r => r.metric ?? r.rule ?? r.query),
      cell: ({ rule }) => (
        <>
          {text(rule.metric ?? rule.rule)}
          {rule.query && <code className="odcs-query">{text(rule.query)}</code>}
        </>
      ),
    },
    { label: 'Threshold', filled: filled(threshold), cell: ({ rule }) => threshold(rule) },
    { label: 'Unit', filled: filled(r => r.unit), cell: ({ rule }) => text(rule.unit) },
    {
      label: 'Description',
      filled: filled(r => r.description),
      cell: ({ rule }) => text(rule.description),
    },
  ];
  return columns.filter(column => column.filled);
}

function QualityTab({ object }: { object: any }) {
  const rules: QualityRow[] = [
    ...list(object.quality).map(r => ({ scope: 'Table', rule: r })),
    ...flattenProperties(object.properties).flatMap(p =>
      list(p.property.quality).map(r => ({ scope: p.path, rule: r })),
    ),
  ];
  const columns = qualityColumns(rules);
  return (
    <>
      <p className="odcs-note">
        Rules are shown as declared in the contract; the workbench does not run them.
      </p>
      {!rules.length ? (
        <p className="odcs-note">This table declares no quality rules.</p>
      ) : (
        <div className="odcs-table-wrap">
          <table className="odcs-table stack" aria-label="Quality rules">
            <thead>
              <tr>
                {columns.map(column => (
                  <th key={column.label}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((row, i) => (
                <tr key={i}>
                  {columns.map(column => (
                    <td key={column.label} data-label={column.label}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
