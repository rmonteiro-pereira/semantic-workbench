// One governance view for ontology items and metrics. Ontology items keep it in an added property and metrics keep it in their extension; callers see one shape.
import { extensionOf } from '../edit/item-model';
import { isObject } from '../edit/source-text';
import { VENDOR, extensionFormOf } from '../metrics/extension';
import { GOVERNANCE_KEYS, GOVERNANCE_PROPERTY, GOVERNANCE_STATUSES } from '../tessera/additions/governance';

/** Where an item keeps its governance. */
export type GovernanceSource = 'ontology-item' | 'metric';

/** The governance of one item, with the status exactly as it is stored so odd values stay visible. */
export type ItemGovernance = {
  source: GovernanceSource;
  status?: string;
  owner?: string;
  steward?: string;
  classification?: string;
  replacedBy?: string;
  deprecationReason?: string;
  /** True when a metric has a second workbench entry that the reader ignores. */
  secondEntryIgnored: boolean;
};

/** What an author may change. A missing field is left as it is; an empty text removes the field. */
export type GovernanceEdit = Partial<Record<'status' | 'owner' | 'steward' | 'classification' | 'replacedBy' | 'deprecationReason', string>>;

/** The stored keys by the name each field has in this module. */
const STORED_KEYS: Record<keyof GovernanceEdit, (typeof GOVERNANCE_KEYS)[number]> = {
  status: 'status',
  owner: 'owner',
  steward: 'steward',
  classification: 'classification',
  replacedBy: 'replaced_by',
  deprecationReason: 'deprecation_reason',
};

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function fromStored(source: GovernanceSource, stored: Record<string, unknown>, secondEntryIgnored: boolean): ItemGovernance {
  return {
    source,
    status: textOf(stored.status),
    owner: textOf(stored.owner),
    steward: textOf(stored.steward),
    classification: textOf(stored.classification),
    replacedBy: textOf(stored.replaced_by),
    deprecationReason: textOf(stored.deprecation_reason),
    secondEntryIgnored,
  };
}

/** Reads the governance of a concept or a relationship. An item without the property reads as empty. */
export function governanceOf(item: unknown): ItemGovernance {
  const stored = isObject(item) && isObject(item[GOVERNANCE_PROPERTY]) ? item[GOVERNANCE_PROPERTY] : {};
  return fromStored('ontology-item', stored, false);
}

/** Reads the governance of a metric from its first workbench extension, the way the existing reader does. Nothing is written. */
export function metricGovernanceOf(metric: unknown): ItemGovernance {
  const list = isObject(metric) ? metric[extensionFormOf(metric).list] : undefined;
  const entries = Array.isArray(list) ? list.filter(entry => entry?.vendor_name === VENDOR) : [];
  const stored = extensionOf(metric)?.value ?? {};
  return fromStored('metric', stored, entries.length > 1);
}

/** Returns the item with its governance entry changed. The property is removed when no key is left, because an empty entry is a finding. */
export function withGovernance<Item extends Record<string, unknown>>(item: Item, edit: GovernanceEdit): Item {
  const existing = item[GOVERNANCE_PROPERTY];
  const current: Record<string, unknown> = isObject(existing) ? { ...existing } : {};
  for (const [field, key] of Object.entries(STORED_KEYS) as [keyof GovernanceEdit, string][]) {
    if (!(field in edit)) continue;
    const value = edit[field];
    if (value === undefined || value === '') delete current[key];
    else current[key] = value;
  }
  const { [GOVERNANCE_PROPERTY]: _previous, ...rest } = item;
  return (Object.keys(current).length ? { ...rest, [GOVERNANCE_PROPERTY]: current } : rest) as Item;
}

/** The metric attributes a governance edit writes through the existing metric writer. Classification has no place in a metric. */
export function metricAttributesFromEdit(edit: GovernanceEdit): Record<string, string | undefined> {
  const attributes: Record<string, string | undefined> = {};
  for (const field of ['status', 'owner', 'steward', 'replacedBy', 'deprecationReason'] as const) {
    if (field in edit) attributes[STORED_KEYS[field]] = edit[field] === '' ? undefined : edit[field];
  }
  return attributes;
}

/** Tells whether an item counts as approved. Only the word approved does; a missing, legacy or unknown status never does. */
export function isApproved(governance: ItemGovernance): boolean {
  return governance.status === 'approved';
}

/** The words a person reads for a status, including the cases that are not part of the vocabulary. */
export function statusLabel(status: string | undefined): string {
  if (status === undefined) return 'not set';
  if ((GOVERNANCE_STATUSES as readonly string[]).includes(status)) return status;
  if (status === 'draft') return 'draft (older value)';
  return 'unknown value';
}

/** What an agent is told about an item: the status word, and for a deprecated item the replacement and the reason. Owner, steward and classification are never part of it. */
export type AgentGovernance = { status: string; replacedBy?: string; reason?: string };

/** The flag an agent receives for an item that carries governance. A missing status reads as "not set", never as approved. */
export function agentGovernanceFlag(governance: ItemGovernance): AgentGovernance {
  const status = governance.status === undefined ? 'not set' : governance.status;
  const flag: AgentGovernance = { status };
  if (status === 'deprecated' && governance.replacedBy) flag.replacedBy = governance.replacedBy;
  if (status === 'deprecated' && governance.deprecationReason) flag.reason = governance.deprecationReason;
  return flag;
}
