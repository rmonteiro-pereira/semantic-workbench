/** Displays contract metadata and a searchable schema-object summary. */
import React, { useDeferredValue, useMemo, useState } from 'react';
import { ChevronRight, FileCheck2, Search, Table2, Workflow } from 'lucide-react';
import { odcsForeignKeys } from '../odcs';
import { flattenProperties } from './odcs-diff';
import { Badge } from '../PropertyBadges';
import { Modal } from '../projects/Modal';
import { ContractId } from './ContractId';
import { ReadMore } from './ReadMore';
import './odcs.css';
import './contract.css';
// ODCS contract overview: identity and status, then a summary row for each contract-level section
// that is present (servers, team and roles, service levels, quality, support, pricing, custom
// properties; each opens in a dialog) and a searchable list of tables.
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const text = (v: unknown) =>
  v === undefined || v === null
    ? ''
    : typeof v === 'string'
      ? v
      : typeof v === 'number' || typeof v === 'boolean'
        ? String(v)
        : JSON.stringify(v);
/** Collects quality rules declared on an object and its properties. */
export const rulesOf = (o: any) => [
  ...list(o?.quality),
  ...flattenProperties(o?.properties).flatMap(p => list(p.property.quality)),
];
// Every schema entry is a table in the interface. ODCS declares its type as `logicalType` (always
// `object` in the standard) and `physicalType` (`table`, `view`, ...). Only a type that tells
// tables apart is worth a badge, so the usual `table` and `object` values show nothing.
const PLAIN_TABLE_TYPES = new Set(['table', 'object']);
/** Names the type of a table when it is not an ordinary table, such as `view`; otherwise ''. */
export function tableTypeBadge(table: any): string {
  const declared = [table?.physicalType, table?.logicalType].filter(Boolean).map(String);
  const unusual = declared.filter(type => !PLAIN_TABLE_TYPES.has(type.toLowerCase()));
  return [...new Set(unusual)].join(' · ');
}
/** Summarizes tables with property, constraint and quality-rule counts. */
export function objectFacts(data: any) {
  const schema = list(data?.schema);
  const fks = odcsForeignKeys(data);
  return schema.map((o: any, i: number) => ({
    index: i,
    name: String(o?.name ?? `table ${i + 1}`),
    physicalName: text(o?.physicalName),
    type: tableTypeBadge(o),
    properties: flattenProperties(o?.properties).length,
    pk: flattenProperties(o?.properties).filter(p => p.property.primaryKey === true).length,
    fk: fks.filter(k => k.from === i).length,
    rules: rulesOf(o).length,
    description: text(o?.description),
  }));
}
type RecordColumns = [string, string][];
// A table for an object-like section (servers, support channels, roles, …). Columns that no row
// fills are not drawn.
function Records({ items, columns }: { items: any[]; columns: RecordColumns }) {
  const used = columns.filter(([key]) => items.some(item => text(item?.[key]) !== ''));
  return (
    <div className="odcs-table-wrap">
      <table className="odcs-table compact stack">
        <thead>
          <tr>
            {used.map(([, label]) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              {used.map(([key, label]) => (
                <td key={key} data-label={label}>
                  {text(item?.[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
/** One contract-level section: its name, how many entries it has and the detail for its dialog. */
type SectionSummary = { label: string; count: number; detail: React.ReactNode };

const SERVER_COLUMNS: RecordColumns = [
  ['server', 'Server'],
  ['type', 'Type'],
  ['environment', 'Environment'],
  ['host', 'Host'],
  ['database', 'Database'],
  ['schema', 'Schema'],
  ['description', 'Description'],
];
const MEMBER_COLUMNS: RecordColumns = [
  ['username', 'Member'],
  ['name', 'Name'],
  ['role', 'Role'],
  ['dateIn', 'Since'],
  ['dateOut', 'Until'],
];
const ROLE_COLUMNS: RecordColumns = [
  ['role', 'Access role'],
  ['access', 'Access'],
  ['firstLevelApprovers', 'Approvers'],
  ['secondLevelApprovers', 'Second-level approvers'],
  ['description', 'Description'],
];
const SERVICE_LEVEL_COLUMNS: RecordColumns = [
  ['property', 'Property'],
  ['value', 'Value'],
  ['unit', 'Unit'],
  ['element', 'Applies to'],
  ['driver', 'Driver'],
  ['description', 'Description'],
];
const QUALITY_COLUMNS: RecordColumns = [
  ['name', 'Rule'],
  ['dimension', 'Dimension'],
  ['severity', 'Severity'],
  ['type', 'Type'],
  ['description', 'Description'],
];
const SUPPORT_COLUMNS: RecordColumns = [
  ['channel', 'Channel'],
  ['tool', 'Tool'],
  ['scope', 'Scope'],
  ['url', 'URL'],
  ['description', 'Description'],
];
const PRICE_COLUMNS: RecordColumns = [
  ['priceAmount', 'Amount'],
  ['priceCurrency', 'Currency'],
  ['priceUnit', 'Unit'],
];
const CUSTOM_COLUMNS: RecordColumns = [
  ['property', 'Property'],
  ['value', 'Value'],
  ['description', 'Description'],
];

function qualityDetail(quality: any[], objectRules: number) {
  return (
    <>
      <p className="odcs-note">
        {quality.length} contract-level rule{quality.length === 1 ? '' : 's'} and {objectRules} on
        objects and properties, as declared; the workbench does not run them.
      </p>
      {quality.length > 0 && <Records items={quality} columns={QUALITY_COLUMNS} />}
    </>
  );
}

function teamDetail(team: any[], roles: any[]) {
  return (
    <>
      {team.length > 0 && <Records items={team} columns={MEMBER_COLUMNS} />}
      {roles.length > 0 && <Records items={roles} columns={ROLE_COLUMNS} />}
    </>
  );
}

/** Lists the contract-level sections the contract declares; absent sections are left out. */
function sectionSummaries(data: any, objectRules: number): SectionSummary[] {
  const team = list(data?.team);
  const roles = list(data?.roles);
  const quality = list(data?.quality);
  const all: (SectionSummary | null)[] = [
    sectionOf('Servers', list(data?.servers), items => (
      <Records items={items} columns={SERVER_COLUMNS} />
    )),
    team.length + roles.length > 0
      ? {
          label: 'Team and roles',
          count: team.length + roles.length,
          detail: teamDetail(team, roles),
        }
      : null,
    sectionOf('Service levels', list(data?.slaProperties), items => (
      <Records items={items} columns={SERVICE_LEVEL_COLUMNS} />
    )),
    quality.length + objectRules > 0
      ? {
          label: 'Quality',
          count: quality.length + objectRules,
          detail: qualityDetail(quality, objectRules),
        }
      : null,
    sectionOf('Support', list(data?.support), items => (
      <Records items={items} columns={SUPPORT_COLUMNS} />
    )),
    sectionOf('Pricing', data?.price ? [data.price] : [], items => (
      <Records items={items} columns={PRICE_COLUMNS} />
    )),
    sectionOf('Custom properties', list(data?.customProperties), items => (
      <Records items={items} columns={CUSTOM_COLUMNS} />
    )),
  ];
  return all.filter((section): section is SectionSummary => section !== null);
}

function sectionOf(
  label: string,
  items: any[],
  detail: (items: any[]) => React.ReactNode,
): SectionSummary | null {
  return items.length ? { label, count: items.length, detail: detail(items) } : null;
}

function SectionRows({ sections }: { sections: SectionSummary[] }) {
  const [open, setOpen] = useState<SectionSummary | null>(null);
  if (!sections.length) return null;
  return (
    <>
      <ul className="odcs-section-rows" aria-label="Contract sections">
        {sections.map(section => (
          <li key={section.label}>
            <button type="button" onClick={() => setOpen(section)}>
              <span>{section.label}</span>
              <small>{section.count}</small>
              <ChevronRight size={14} />
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <Modal
          title={open.label}
          size="large"
          className="odcs-section-dialog"
          onCancel={() => setOpen(null)}
          footer={
            <>
              <span className="dialog-footer-spacer" />
              <button type="button" onClick={() => setOpen(null)}>
                Close
              </button>
            </>
          }
        >
          {open.detail}
        </Modal>
      )}
    </>
  );
}

function ContractHead({ data }: { data: any }) {
  const description = data?.description;
  const identity: [string, unknown][] = [
    ['Version', data?.version],
    ['Status', data?.status],
    ['Domain', data?.domain],
    ['Data product', data?.dataProduct],
    ['Tenant', data?.tenant],
    ['ODCS', data?.apiVersion],
    ['Id', data?.id],
  ];
  return (
    <header className="odcs-head">
      <div className="odcs-title">
        <FileCheck2 size={20} />
        <div>
          <h2>{text(data?.name) || 'Unnamed contract'}</h2>
          <small>ODCS data contract</small>
        </div>
      </div>
      <dl className="odcs-facts odcs-identity">
        {identity
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                <IdentityValue label={k} value={v} />
              </dd>
            </div>
          ))}
      </dl>
      {typeof description === 'string' && <ReadMore>{description}</ReadMore>}
      {description && typeof description === 'object' && <PurposeList description={description} />}
    </header>
  );
}

function IdentityValue({ label, value }: { label: string; value: unknown }) {
  if (label === 'Status')
    return <span className={`odcs-status s-${text(value)}`}>{text(value)}</span>;
  if (label === 'Id') return <ContractId id={text(value)} />;
  return <>{text(value)}</>;
}

function PurposeList({ description }: { description: Record<string, unknown> }) {
  return (
    <dl className="odcs-purpose">
      {(['purpose', 'limitations', 'usage'] as const)
        .filter(k => description[k])
        .map(k => (
          <div key={k}>
            <dt>{k[0].toUpperCase() + k.slice(1)}</dt>
            <dd>
              <ReadMore>{text(description[k])}</ReadMore>
            </dd>
          </div>
        ))}
    </dl>
  );
}

type ObjectFacts = ReturnType<typeof objectFacts>[number];
const matchesQuery = (fact: ObjectFacts, query: string) =>
  `${fact.name} ${fact.physicalName} ${fact.description}`.toLowerCase().includes(query);

function KeyChips({ fact }: { fact: ObjectFacts }) {
  if (!fact.pk && !fact.fk) return <span className="muted">—</span>;
  return (
    <span className="prop-badges">
      {fact.pk > 0 && (
        <Badge
          kind="pk"
          title={`${fact.pk} primary key ${fact.pk === 1 ? 'property' : 'properties'}`}
        >
          {fact.pk} PK
        </Badge>
      )}
      {fact.fk > 0 && (
        <Badge kind="fk" title={`${fact.fk} foreign ${fact.fk === 1 ? 'key' : 'keys'}`}>
          {fact.fk} FK
        </Badge>
      )}
    </span>
  );
}

type ObjectRowProps = {
  fact: ObjectFacts;
  showKind: boolean;
  showRules: boolean;
  onOpen: (name: string) => void;
  onOpenInLineage?: (name: string) => void;
};
function ObjectRow({ fact, showKind, showRules, onOpen, onOpenInLineage }: ObjectRowProps) {
  return (
    <tr>
      <td data-label="Table">
        <span className="odcs-object-cell">
          <button
            className="odcs-link"
            aria-label={`Open ${fact.name}`}
            onClick={() => onOpen(fact.name)}
          >
            {fact.name}
          </button>
          {onOpenInLineage && (
            <button
              className="odcs-lineage-link"
              aria-label={`Open ${fact.name} in lineage`}
              title="Open in lineage (Graph)"
              onClick={() => onOpenInLineage(fact.name)}
            >
              <Workflow size={13} />
            </button>
          )}
        </span>
        {fact.physicalName && (
          <small className="odcs-secondary">
            <code>{fact.physicalName}</code>
          </small>
        )}
      </td>
      {showKind && (
        <td data-label="Type">
          {fact.type && <span className="odcs-type-badge">{fact.type}</span>}
        </td>
      )}
      <td className="num" data-label="Properties">
        {fact.properties}
      </td>
      <td data-label="Keys">
        <KeyChips fact={fact} />
      </td>
      {showRules && (
        <td className="num" data-label="Quality rules">
          {fact.rules || <span className="muted">0</span>}
        </td>
      )}
      <td className="odcs-desc" data-label="Description">
        {fact.description}
      </td>
    </tr>
  );
}

/** Displays declared contract sections and a searchable table summary. */
export function ContractOverview({
  data,
  onOpen,
  onOpenInLineage,
}: {
  data: any;
  onOpen: (name: string) => void;
  onOpenInLineage?: (name: string) => void;
}) {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const facts = useMemo(() => objectFacts(data), [data]);
  const shown = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    return needle ? facts.filter(fact => matchesQuery(fact, needle)) : facts;
  }, [facts, deferred]);
  const objectRules = facts.reduce((n, f) => n + f.rules, 0);
  const sections = useMemo(() => sectionSummaries(data, objectRules), [data, objectRules]);
  const showKind = facts.some(fact => fact.type !== '');
  const showRules = objectRules > 0;
  return (
    <section className="odcs-page odcs-overview" aria-label="Contract overview">
      <ContractHead data={data} />
      <SectionRows sections={sections} />
      <section className="odcs-objects" aria-label="Tables">
        <div className="odcs-objects-head">
          <h3>
            <Table2 size={15} />
            Tables{' '}
            <small>
              {shown.length === facts.length ? facts.length : `${shown.length} of ${facts.length}`}
            </small>
          </h3>
          <label className="odcs-search">
            <Search size={14} />
            <input
              type="search"
              aria-label="Find a table"
              placeholder="Find a table…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="odcs-table-wrap">
          <table className="odcs-table odcs-objects-table stack" aria-label="Tables">
            <thead>
              <tr>
                <th>Table</th>
                {showKind && <th>Type</th>}
                <th className="num">Properties</th>
                <th>Keys</th>
                {showRules && <th className="num">Quality rules</th>}
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(fact => (
                <ObjectRow
                  key={fact.index}
                  fact={fact}
                  showKind={showKind}
                  showRules={showRules}
                  onOpen={onOpen}
                  onOpenInLineage={onOpenInLineage}
                />
              ))}
            </tbody>
          </table>
        </div>
        {!shown.length && <p className="odcs-note">No table matches “{query}”.</p>}
      </section>
    </section>
  );
}
