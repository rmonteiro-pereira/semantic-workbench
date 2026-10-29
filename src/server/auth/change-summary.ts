// Describes an administration change in one line, used as the commit message of that change.
import type { AccessConfig, Grant } from './access-config';

/** Items added, removed and changed between two versions of one list, by identifier. */
type ListChange = { added: string[]; removed: string[]; changed: string[] };

const MAX_SUMMARY_LENGTH = 200;

function compareLists<Item>(before: Item[], after: Item[], key: (item: Item) => string): ListChange {
  const previous = new Map(before.map(item => [key(item), JSON.stringify(item)]));
  const next = new Map(after.map(item => [key(item), JSON.stringify(item)]));
  const added = [...next.keys()].filter(id => !previous.has(id));
  const removed = [...previous.keys()].filter(id => !next.has(id));
  const changed = [...next.keys()].filter(id => previous.has(id) && previous.get(id) !== next.get(id));
  return { added, removed, changed };
}

function listPhrases(change: ListChange, verbs: [string, string, string]): string[] {
  const [addVerb, removeVerb, changeVerb] = verbs;
  const phrases: string[] = [];
  if (change.added.length) phrases.push(`${addVerb} ${change.added.join(', ')}`);
  if (change.removed.length) phrases.push(`${removeVerb} ${change.removed.join(', ')}`);
  if (change.changed.length) phrases.push(`${changeVerb} ${change.changed.join(', ')}`);
  return phrases;
}

function grantLabel(grant: Grant): string {
  const member = grant.member.kind === 'email' ? grant.member.email : grant.member.groupId;
  return `${grant.id} (${grant.roleId} to ${member})`;
}

function grantPhrases(before: AccessConfig, after: AccessConfig): string[] {
  const change = compareLists(before.grants, after.grants, grant => grant.id);
  const labels = new Map(after.grants.map(grant => [grant.id, grantLabel(grant)]));
  const added = change.added.map(id => labels.get(id) ?? id);
  return listPhrases({ ...change, added }, ['add grant', 'remove grant', 'change grant']);
}

function rolePhrases(before: AccessConfig, after: AccessConfig): string[] {
  const change = compareLists(before.roles, after.roles, role => role.id);
  const phrases = listPhrases(change, ['create role', 'delete role', 'change role']);
  const removedGrants = before.grants.filter(grant => change.removed.includes(grant.roleId));
  if (removedGrants.length) phrases.push(`remove ${removedGrants.length} grant(s) of deleted roles`);
  return phrases;
}

function projectPhrases(before: AccessConfig, after: AccessConfig): string[] {
  const domains = compareLists(before.projects.domains, after.projects.domains, domain => domain.id);
  const projects = compareLists(Object.entries(before.projects.projects), Object.entries(after.projects.projects), ([slug]) => slug);
  const classificationChanged = JSON.stringify(before.projects.classification) !== JSON.stringify(after.projects.classification);
  return [
    ...listPhrases(domains, ['add domain', 'remove domain', 'change domain']),
    ...listPhrases(projects, ['add project access', 'remove project access', 'change project']),
    ...(classificationChanged ? ['change classification'] : []),
  ];
}

function agentPhrases(before: AccessConfig, after: AccessConfig): string[] {
  const change = compareLists(before.agents.clients, after.agents.clients, client => client.clientId);
  return listPhrases(change, ['add client', 'remove client', 'change client']);
}

function policyPhrases(before: AccessConfig, after: AccessConfig): string[] {
  const change = compareLists(Object.entries(before.adminRules ?? {}), Object.entries(after.adminRules ?? {}), ([id]) => id);
  return listPhrases(change, ['add rule', 'remove rule', 'change rule']);
}

const AREA_PHRASES: Record<string, (before: AccessConfig, after: AccessConfig) => string[]> = {
  grants: grantPhrases,
  roles: rolePhrases,
  projects: projectPhrases,
  agents: agentPhrases,
  policies: policyPhrases,
};

/** Keeps the message on one line and within a length a history list can show. */
export function commitMessage(area: string, summary: string): string {
  const singleLine = summary.replace(/\s+/g, ' ').trim();
  const shortened = singleLine.length > MAX_SUMMARY_LENGTH ? singleLine.slice(0, MAX_SUMMARY_LENGTH - 1) + '…' : singleLine;
  return `${area}: ${shortened || 'No effective change'}`;
}

/** Names what a saved document adds, removes or changes compared with the active version. */
export function describeChange(area: string, before: AccessConfig, after: AccessConfig): string {
  const phrases = AREA_PHRASES[area]?.(before, after);
  if (!phrases) return commitMessage(area, `Update ${area}`);
  const summary = phrases.join('; ');
  return commitMessage(area, summary.charAt(0).toUpperCase() + summary.slice(1));
}
