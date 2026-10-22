// Coordinates validated proposals, dry-run receipts and atomic administration commits.
import { randomUUID, createHash } from 'node:crypto';
import { AdminConfigError, AdminStaleError, type AdminRepository } from './admin-repo';
import {
  validateAccessDocument,
  validateAgentReferences,
  type AccessConfig,
} from './access-config';
import { BUILTIN_ROLE_IDS } from './actions';
import { checkLastAdmin, isBootstrapAdmin } from './admin-guard';
import { commitMessage, describeChange } from './change-summary';
import { compareAccess, isReplayable, MAX_AUDIT_SNAPSHOTS } from './dry-run';
import {
  createGroupNameCache,
  unresolvedGroupName,
  type GroupLookup,
  type GroupName,
} from './directory';
import { listPolicies, policyTexts, validatePolicies } from './policies';
import type { AccessControl } from './middleware';
import type { UserRecord } from '../projects/state';
import type { Principal } from './principal';
import { reportAuditFailure, type AuditLog } from './audit';
import type { SessionStore } from './sessions';

/** A refused write that carries a structured response for the administration UI. */
export class AdminRefusal extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(String(body.error ?? 'Administration change refused.'));
  }
}
/** Dependencies at the administrative persistence and notification edges. */
export type AccessAdminOptions = {
  /** The process's one administration repository; its commit listener reloads `access`. */
  repository: AdminRepository;
  access: AccessControl;
  users: () => UserRecord[];
  audit: AuditLog;
  sessions?: SessionStore;
  /** Directory lookup of group names; without one, names are reported as unresolved. */
  groupName?: GroupLookup;
  now?: () => Date;
};
/** A schema-validated proposal with the exact complete files that will be committed. */
type Proposal = { config: AccessConfig; files: Record<string, string>; area: string };
/** Proof that a proposal was previewed against one administration version. */
type Receipt = { version: string; hash: string; expires: number; affected: string[] };
/** The signed-in Admin making a change and the request it belongs to. */
export type AdminActor = { principal: Principal; requestId: string };
/** What a commit records, who makes it and whose live-update streams it closes. */
type ChangeEffect = AdminActor & { baseVersion: string; message: string; affected: string[] };

const RECEIPT_LIFETIME_MS = 15 * 60_000;
const MAX_RECEIPTS = 100;
/**
 * The field that identifies each area's document in a dry-run body. The body is the document the
 * area's PUT takes, so agents are recognised by `clients` and policies by `rules`.
 */
const DOCUMENT_KEYS: Record<string, string> = {
  roles: 'roles',
  grants: 'grants',
  projects: 'projects',
  clients: 'agents',
  rules: 'policies',
};
const REQUEST_FIELDS = new Set(['baseVersion', 'dryRunId', 'confirmDeleteInUse']);

function digest(proposal: Proposal): string {
  const files = Object.entries(proposal.files).sort(([left], [right]) => left.localeCompare(right));
  return createHash('sha256').update(JSON.stringify(files)).digest('hex');
}
function encode(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}
function documentFields(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([key]) => !REQUEST_FIELDS.has(key)));
}
function lowerCaseEmails(document: Record<string, unknown>) {
  if (!Array.isArray(document.grants)) return;
  for (const grant of document.grants as AccessConfig['grants']) {
    if (grant?.member?.kind === 'email' && typeof grant.member.email === 'string')
      grant.member.email = grant.member.email.trim().toLowerCase();
  }
}
/** Directory groups named by the group grants of a proposed grants document. */
function proposedGroupIds(body: Record<string, unknown>): string[] {
  if (!Array.isArray(body.grants)) return [];
  return body.grants.flatMap(grant => {
    const member = (grant as { member?: { kind?: unknown; groupId?: unknown } } | null)?.member;
    return member?.kind === 'group' && typeof member.groupId === 'string' ? [member.groupId] : [];
  });
}
/** The version a rollback request names; the repository checks its format. */
function rollbackTarget(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new AdminConfigError('Expected the version to roll back to.');
  }
  return value;
}
/** Maps a dry-run body to the area whose document it is; project documents carry domains too. */
function proposalArea(body: Record<string, unknown>): string {
  const keys = Object.keys(DOCUMENT_KEYS).filter(key => Object.hasOwn(body, key));
  if (keys.length !== 1) throw new AdminConfigError('Expected one proposed document.');
  return DOCUMENT_KEYS[keys[0]];
}

/** Opens the service shared by all administration save paths. */
export function createAccessAdmin(options: AccessAdminOptions) {
  const { repository, access } = options;
  const now = options.now ?? (() => new Date());
  const receipts = new Map<string, Receipt>();
  const groups = createGroupNameCache(options.groupName ?? unresolvedGroupName);
  let pending: Promise<unknown> = Promise.resolve();
  function serialized<Result>(run: () => Promise<Result>): Promise<Result> {
    const result = pending.then(run);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  function users() {
    return options.users().map(user => ({ ...user, groupOverage: false }));
  }
  function policyFiles(files: Record<string, string>, rules: unknown, config: AccessConfig) {
    const result = validatePolicies(rules, config.roles);
    if (!result.ok) throw new AdminRefusal(400, { error: 'Invalid policies.', ...result });
    for (const name of Object.keys(files)) if (name.startsWith('policies/')) delete files[name];
    for (const [id, text] of Object.entries(policyTexts(rules)))
      files[`policies/${id}.cedar`] = text;
  }
  function documentFiles(
    area: string,
    body: Record<string, unknown>,
    files: Record<string, string>,
    config: AccessConfig,
  ) {
    const document = documentFields(body);
    if (area === 'grants') lowerCaseEmails(document);
    validateAccessDocument(`${area}File`, document);
    files[`${area}.json`] = encode(document);
    if (area !== 'roles') return;
    // A deleted custom role takes its grants with it, in the same commit.
    const ids = new Set((document.roles as AccessConfig['roles']).map(role => role.id));
    const grants = config.grants.filter(
      grant => ids.has(grant.roleId) || BUILTIN_ROLE_IDS.includes(grant.roleId),
    );
    files['grants.json'] = encode({ grants });
  }
  function proposal(area: string, body: Record<string, unknown>): Proposal {
    const files = repository.files();
    const config = repository.load();
    if (area === 'policies') policyFiles(files, body.rules, config);
    else documentFiles(area, body, files, config);
    return checkedProposal(files, area);
  }
  /** Every proposal, edited or restored from an earlier version, passes these checks. */
  function checkedProposal(files: Record<string, string>, area: string): Proposal {
    const validated = repository.validate(files);
    validateAgentReferences(validated);
    const known = new Set(access.snapshot().knownProjects());
    for (const slug of Object.keys(validated.projects.projects)) {
      if (!known.has(slug)) throw new AdminConfigError(`Unknown project: ${slug}`);
    }
    return { files, config: validated, area };
  }
  async function rollbackProposal(target: string): Promise<Proposal> {
    return checkedProposal(await repository.versionFiles(target), 'rollback');
  }
  function compare(next: AccessConfig) {
    const audit = options.audit.recent(MAX_AUDIT_SNAPSHOTS, isReplayable);
    const names = identityNames(next.agents.clients);
    return compareAccess(access.snapshot(), next, { users: users(), audit, names });
  }
  function storeReceipt(receipt: Receipt): string {
    const dryRunId = randomUUID();
    for (const [id, stored] of receipts) if (stored.expires <= now().getTime()) receipts.delete(id);
    if (receipts.size >= MAX_RECEIPTS) receipts.delete(receipts.keys().next().value!);
    receipts.set(dryRunId, receipt);
    return dryRunId;
  }
  /** The proposal a dry-run body describes: an edited document or an earlier version. */
  async function proposalFor(body: Record<string, unknown>): Promise<Proposal> {
    if (Object.hasOwn(body, 'rollbackTo')) return rollbackProposal(rollbackTarget(body.rollbackTo));
    return proposal(proposalArea(body), body);
  }
  async function dryRun(body: Record<string, unknown>) {
    // Only reading the version and its files waits for the save lock. The replay runs outside it,
    // and a save made meanwhile moves the version, so this receipt no longer matches.
    const { version, next } = await serialized(async () => {
      await repository.ensure();
      return { version: await repository.version(), next: await proposalFor(body) };
    });
    const result = compare(next.config);
    const dryRunId = storeReceipt({
      version,
      hash: digest(next),
      expires: now().getTime() + RECEIPT_LIFETIME_MS,
      affected: [...new Set(result.people.map(change => change.principal))],
    });
    return { dryRunId, ...result };
  }
  function matchingReceipt(body: Record<string, unknown>, version: string, next: Proposal) {
    const receipt = receipts.get(String(body.dryRunId));
    const matches =
      receipt !== undefined &&
      receipt.version === version &&
      receipt.hash === digest(next) &&
      receipt.expires > now().getTime();
    if (!matches) throw new AdminConfigError('A matching dry run is required.');
    return receipt;
  }
  function checkPolicySet(next: Proposal) {
    validateAgentReferences(next.config);
    const rules = listPolicies(next.config.adminRules).rules;
    const validation = validatePolicies(rules, next.config.roles);
    if (!validation.ok) throw new AdminRefusal(400, { error: 'Invalid policies.', ...validation });
  }
  function checkBootstrapStaysActive(next: Proposal) {
    const bootstrap = access.snapshot().bootstrap;
    const disabled = new Set(next.config.deactivated.principals.map(principal => principal.id));
    const refused = users().some(
      user => disabled.has(user.id) && isBootstrapAdmin(user, bootstrap),
    );
    if (refused) {
      throw new AdminRefusal(400, {
        error: 'bootstrap-admin',
        message: 'Bootstrap Admins cannot be deactivated.',
      });
    }
  }
  function checkAdminRemains(next: Proposal) {
    const snapshot = access.snapshot();
    const settings = JSON.parse(next.files['settings.json']);
    const result = checkLastAdmin(next.config, {
      users: users(),
      bootstrap: snapshot.bootstrap,
      groupMatch: snapshot.groupMatch,
      sessionLifetimeHours: settings.session?.absoluteHours ?? 24,
      now: now(),
    });
    if (result.ok) return;
    const bootstrapCount = snapshot.bootstrap.ids.length + snapshot.bootstrap.emails.length;
    throw new AdminRefusal(400, {
      error: 'last-admin',
      message: `${next.area}: this change would remove the last active Admin.`,
      bootstrap: bootstrapCount > 0,
    });
  }
  /** Every save path runs these checks; local mode has its implicit Admin and needs no guard. */
  function guard(next: Proposal) {
    checkPolicySet(next);
    if (access.snapshot().mode === 'local') return;
    checkBootstrapStaysActive(next);
    checkAdminRemains(next);
  }
  /** Display names of recorded people and agent clients, plus any clients a proposal adds. */
  function identityNames(proposedClients: AccessConfig['agents']['clients'] = []) {
    const names = new Map(users().map(user => [user.id, user.name]));
    for (const client of [...repository.load().agents.clients, ...proposedClients])
      names.set(`client:${client.clientId}`, client.name);
    return names;
  }
  function deletionGuard(next: Proposal, confirm: unknown, affected: string[]) {
    const previous = repository.load();
    for (const role of previous.roles) {
      if (next.config.roles.some(candidate => candidate.id === role.id)) continue;
      const grants = previous.grants.filter(grant => grant.roleId === role.id);
      if (!grants.length || confirm === true) continue;
      const names = identityNames();
      const people = affected.map(id => ({ id, name: names.get(id) ?? id }));
      throw new AdminRefusal(409, { inUse: { roleId: role.id, grants: grants.length, people } });
    }
  }
  /**
   * Looks up the directory names of a grants proposal's groups. It runs before the save waits for
   * the write lock, so a slow directory never holds up other administration changes.
   */
  async function proposedGroupNames(area: string, body: Record<string, unknown>) {
    if (area !== 'grants' || !options.groupName) return null;
    return groups.names(proposedGroupIds(body));
  }
  /** Stores the directory name of each group grant so the panel can show it later. */
  function storeGroupNames(next: Proposal, names: Map<string, GroupName> | null) {
    if (next.area !== 'grants' || !names) return;
    for (const grant of next.config.grants) {
      if (grant.member.kind !== 'group') continue;
      const name = names.get(grant.member.groupId);
      delete grant.member.displayName;
      delete grant.member.resolvedAt;
      if (name?.resolved && name.displayName) {
        grant.member.displayName = name.displayName;
        grant.member.resolvedAt = now().toISOString();
      }
    }
    next.files['grants.json'] = encode({ grants: next.config.grants });
  }
  function recordChange(actor: Principal, area: string, version: string, requestId: string) {
    // The commit is already active, so a failed audit write is reported rather than undone.
    try {
      options.audit.append({
        requestId,
        principal: actor,
        action: 'adminChange',
        resource: { type: 'workspace', area },
        decision: 'allow',
        rules: [],
        outcome: 'ok',
        version,
      });
    } catch (error) {
      reportAuditFailure({ requestId, action: 'adminChange', version, error });
    }
  }
  async function applyToSessions(next: Proposal, affected: string[]) {
    // Without server sessions, every live-update stream closes on the policy reload itself.
    if (!options.sessions) return;
    options.sessions.notifyAccessChanged(affected);
    options.sessions.configure(repository.settings().session);
    for (const principal of next.config.deactivated.principals) {
      await options.sessions.endPrincipal(principal.id);
    }
  }
  async function activate(
    next: Proposal,
    effect: ChangeEffect,
    names: Map<string, GroupName> | null = null,
  ) {
    guard(next);
    storeGroupNames(next, names);
    const actor = effect.principal;
    const version = await repository.replace(next.files, {
      baseVersion: effect.baseVersion,
      author: { name: actor.name, email: actor.verifiedEmail ?? `${actor.key}@workbench.local` },
      message: effect.message,
    });
    // The repository's commit listener has already reloaded the shared access boundary.
    receipts.clear();
    await applyToSessions(next, effect.affected);
    recordChange(actor, next.area, version, effect.requestId);
    return { version };
  }
  async function save(area: string, body: Record<string, unknown>, actor: AdminActor) {
    const names = await proposedGroupNames(area, body);
    return serialized(async () => {
      await repository.ensure();
      const version = await repository.version();
      if (body.baseVersion !== version) throw new AdminStaleError();
      const next = proposal(area, structuredClone(body));
      let affected: string[] = [];
      // Settings change no decision, so they are the one area saved without a dry run.
      if (area !== 'settings') {
        affected = matchingReceipt(body, version, next).affected;
      }
      deletionGuard(next, body.confirmDeleteInUse, affected);
      const message = describeChange(area, repository.load(), next.config);
      return activate(next, { ...actor, baseVersion: version, message, affected }, names);
    });
  }
  /** Deactivates or reactivates one recorded person; `reason` is kept in the version. */
  async function setDeactivated(
    id: string,
    change: { disabled: boolean; reason: string },
    actor: AdminActor,
  ) {
    return serialized(async () => {
      await repository.ensure();
      const user = users().find(candidate => candidate.id === id);
      if (!user) throw new AdminRefusal(404, { error: 'Unknown principal.' });
      if (change.disabled && isBootstrapAdmin(user, access.snapshot().bootstrap)) {
        throw new AdminRefusal(400, {
          error: 'bootstrap-admin',
          message: 'Bootstrap Admins cannot be deactivated.',
        });
      }
      const current = repository.load().deactivated.principals;
      const principals = current.filter(principal => principal.id !== id);
      if (change.disabled) {
        const by = actor.principal.id;
        principals.push({ id, at: now().toISOString(), by, reason: change.reason });
      }
      const next = proposal('deactivated', { principals });
      const verb = change.disabled ? 'Deactivate' : 'Reactivate';
      const message = commitMessage('deactivated', `${verb} ${user.name}: ${change.reason}`);
      const baseVersion = await repository.version();
      // Ending the person's sessions closes their streams with `session-ended` instead.
      const result = await activate(next, { ...actor, baseVersion, message, affected: [] });
      await options.sessions?.endPrincipal(id);
      return result;
    });
  }
  /** Restores an earlier version as a new commit, after the Admin reviewed its dry run. */
  async function rollback(target: string, body: Record<string, unknown>, actor: AdminActor) {
    return serialized(async () => {
      await repository.ensure();
      const version = await repository.version();
      if (body.baseVersion !== version) throw new AdminStaleError();
      const next = await rollbackProposal(rollbackTarget(target));
      const { affected } = matchingReceipt(body, version, next);
      const message = commitMessage('rollback', `Roll back to ${target.slice(0, 12)}`);
      return activate(next, { ...actor, baseVersion: version, message, affected });
    });
  }
  return {
    repository,
    access,
    users,
    groupName: groups.name,
    groupNames: groups.names,
    dryRun,
    save,
    setDeactivated,
    rollback,
  };
}
/** The administration service exposed to HTTP routing. */
export type AccessAdmin = ReturnType<typeof createAccessAdmin>;
