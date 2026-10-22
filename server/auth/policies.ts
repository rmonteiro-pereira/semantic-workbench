// Converts structured rules to Cedar and reports complete-set validation failures.
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import * as cedar from '@cedar-policy/cedar-wasm/nodejs';
import builtin from '../../policies/builtin-roles.json';
import { loadPolicySet } from './cedar';
import { compileRoles } from './role-compiler';
import { AdminConfigError } from './admin-repo';
import type { Role } from './access-config';
import { isAction, type Action } from './actions';

/** One editable administrator rule; metadata is stored as Cedar annotations. */
export type AdminRule = {
  id: string;
  text: string;
  enabled: boolean;
  template?: string;
  description?: string;
};
/** Structured rule parameters used by the editor's policy templates. */
export type PolicyTemplate =
  | { template: 'git-limits'; id: string; role: string; actions: Action[]; branch: string }
  | { template: 'metric-ownership'; id: string; domain: string; groups: string[] }
  | { template: 'classification'; id: string; domain: string; level: number }
  | { template: 'time'; id: string; actions: Action[]; hours: number[] }
  | { template: 'network'; id: string; actions: Action[]; ranges: string[] };

const TEMPLATE_NAMES = ['git-limits', 'metric-ownership', 'classification', 'time', 'network'];
const quote = JSON.stringify;

function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) throw new AdminConfigError(`Expected ${key}.`);
  return value.trim();
}
function stringList(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new AdminConfigError(`Expected ${key} as a list of text.`);
  }
  return [...new Set(value.map(entry => entry.trim()).filter(Boolean))];
}
function actionList(input: Record<string, unknown>): Action[] {
  const actions = stringList(input, 'actions');
  if (!actions.length) throw new AdminConfigError('Expected at least one action.');
  const unknown = actions.find(action => !isAction(action));
  if (unknown !== undefined) throw new AdminConfigError(`Unknown action: ${unknown}`);
  return actions as Action[];
}
function numberList(input: Record<string, unknown>, key: string): number[] {
  const value = input[key];
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'number')) {
    throw new AdminConfigError(`Expected ${key} as a list of numbers.`);
  }
  return value;
}

/** Validates a template request from the panel into typed parameters. */
export function policyTemplateFrom(input: unknown): PolicyTemplate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AdminConfigError('Expected a policy template.');
  }
  const body = input as Record<string, unknown>;
  const template = body.template;
  if (typeof template !== 'string' || !TEMPLATE_NAMES.includes(template)) {
    throw new AdminConfigError('Unknown policy template.');
  }
  const id = stringField(body, 'id');
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new AdminConfigError('Invalid policy ID.');
  if (template === 'metric-ownership') {
    return {
      template,
      id,
      domain: stringField(body, 'domain'),
      groups: stringList(body, 'groups'),
    };
  }
  if (template === 'classification') {
    const level = body.level;
    if (typeof level !== 'number') throw new AdminConfigError('Expected level.');
    return { template, id, domain: stringField(body, 'domain'), level };
  }
  const actions = actionList(body);
  if (template === 'git-limits') {
    const role = stringField(body, 'role');
    return { template, id, actions, role, branch: stringField(body, 'branch') };
  }
  if (template === 'time') return { template, id, actions, hours: numberList(body, 'hours') };
  return { template: 'network', id, actions, ranges: stringList(body, 'ranges') };
}

/** Checks one CIDR range such as `10.0.0.0/8` or `2001:db8::/32`; a bare address is one host. */
function validRange(range: string): boolean {
  const [address, prefix, ...rest] = range.split('/');
  const version = isIP(address);
  if (!version || rest.length) return false;
  if (prefix === undefined) return true;
  const bits = Number(prefix);
  return /^\d{1,3}$/.test(prefix) && bits <= (version === 4 ? 32 : 128);
}

function metricOwnershipText(domain: string, groups: string[]): string {
  if (!groups.length) throw new AdminConfigError('Expected at least one approver group.');
  const members = groups.map(group => `principal in SW::Group::${quote(group)}`).join(' || ');
  return (
    `permit(principal, action == SW::Action::"approveMetric", resource)\n` +
    `when { resource.domain == ${quote(domain)} && (${members}) };`
  );
}

function classificationText(domain: string, level: number): string {
  if (!Number.isInteger(level) || level < 0 || level > 3) {
    throw new AdminConfigError('Invalid classification level.');
  }
  return (
    'forbid(principal, action == SW::Action::"editGuarded", resource)\n' +
    `when { resource.domain == ${quote(domain)} && context.level >= ${level}` +
    ' && !(principal in resource.holders.steward) &&' +
    ' !(principal in SW::RoleHolder::"admin@workspace") };'
  );
}

/**
 * Allowed UTC hours, each from 0 through 23. A window that runs past midnight is just its hours,
 * for example 22, 23, 0 and 1, so overnight windows need no special case.
 */
function allowedHours(hours: number[]): number[] {
  const invalid = hours.some(hour => !Number.isInteger(hour) || hour < 0 || hour > 23);
  if (!hours.length || invalid) {
    throw new AdminConfigError('Expected UTC hours from zero through twenty-three.');
  }
  return [...new Set(hours)].sort((left, right) => left - right);
}

/** Restricting rules forbid the listed actions; the admin action can never be one of them. */
function restrictingText(input: Exclude<PolicyTemplate, { template: 'metric-ownership' }>) {
  if (input.template === 'classification') return classificationText(input.domain, input.level);
  if (input.actions.includes('admin')) {
    throw new AdminConfigError('A template cannot restrict the admin action.');
  }
  const actions = input.actions.map(action => `SW::Action::${quote(action)}`).join(', ');
  const head = `forbid(principal, action in [${actions}], resource)\n`;
  if (input.template === 'git-limits') {
    if (!/^[a-z][a-z0-9_]*$/.test(input.role)) throw new AdminConfigError('Invalid role.');
    return (
      head +
      `when { principal in resource.holders.${input.role} && ` +
      `context.branch like ${quote(input.branch)} };`
    );
  }
  if (input.template === 'time') {
    return head + `unless { ${quote(allowedHours(input.hours))}.contains(context.hour) };`;
  }
  if (!input.ranges.length) throw new AdminConfigError('Expected at least one network range.');
  const invalid = input.ranges.find(range => !validRange(range));
  if (invalid !== undefined) throw new AdminConfigError(`Invalid network range: ${invalid}`);
  // The schema declares sourceIp as an ipaddr, so it is compared directly without ip().
  const ranges = input.ranges.map(range => `context.sourceIp.isInRange(ip(${quote(range)}))`);
  return head + `unless { ${ranges.join(' || ')} };`;
}

/** Generates policy text; Cedar still gives baseline prohibitions precedence over permits. */
export function policyTemplate(input: PolicyTemplate): AdminRule {
  const text =
    input.template === 'metric-ownership'
      ? metricOwnershipText(input.domain, input.groups)
      : restrictingText(input);
  return { id: input.id, enabled: true, template: input.template, text };
}

/** True when a forbid's action scope is every action or names the `admin` action. */
function forbidsAdminAction(policy: cedar.PolicyJson): boolean {
  if (policy.effect !== 'forbid') return false;
  const scope = policy.action;
  if (scope.op === 'All') return true;
  let named: cedar.EntityUidJson[] = [];
  if ('entities' in scope) named = scope.entities;
  else if ('entity' in scope) named = [scope.entity];
  return named.some(uid => ('__entity' in uid ? uid.__entity.id : uid.id) === 'admin');
}

/**
 * Refuses rule text that could take the `admin` action away from every Admin. Such a rule could
 * lock everyone out of the panel that removes it, so no condition makes it acceptable.
 */
function checkAdminRecovery(text: string) {
  const parsed = cedar.policyToJson(text);
  if (parsed.type !== 'success') return;
  if (forbidsAdminAction(parsed.json)) {
    throw new AdminConfigError(
      'A forbid rule must list its actions and cannot include admin; Admins must keep access.',
    );
  }
  const namesAdmins = JSON.stringify(parsed.json.principal).includes('admin@workspace');
  if (parsed.json.effect === 'forbid' && namesAdmins && parsed.json.conditions.length === 0) {
    throw new AdminConfigError('An Admin forbid requires a narrowing condition.');
  }
}

/** Validates boundary input and writes canonical metadata into each rule. */
export function policyTexts(input: unknown): Record<string, string> {
  if (!Array.isArray(input)) throw new AdminConfigError('Expected rules array.');
  const result: Record<string, string> = {};
  for (const rule of input) {
    if (
      !rule ||
      typeof rule !== 'object' ||
      !/^[a-zA-Z0-9_-]+$/.test(rule.id) ||
      typeof rule.text !== 'string' ||
      typeof rule.enabled !== 'boolean' ||
      (rule.description !== undefined && typeof rule.description !== 'string') ||
      (rule.template !== undefined && typeof rule.template !== 'string')
    ) {
      throw new AdminConfigError('Invalid policy rule.');
    }
    if (Object.hasOwn(result, rule.id)) throw new AdminConfigError('Duplicate policy ID.');
    const text = rule.text.replace(
      /@(id|enabled|template|description)\("(?:[^"\\]|\\.)*"\)\s*/g,
      '',
    );
    checkAdminRecovery(text);
    const metadata = {
      id: rule.id,
      enabled: String(rule.enabled),
      template: rule.template,
      description: rule.description,
    };
    result[rule.id] =
      Object.entries(metadata)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `@${key}(${JSON.stringify(value)})`)
        .join('\n') +
      '\n' +
      text;
  }
  return result;
}

/** Checks disabled rules too, then validates the whole enabled policy set against its schema. */
export function validatePolicies(input: unknown, roles: Role[]) {
  try {
    if (Array.isArray(input)) {
      const errors = input.flatMap(rule => {
        if (typeof rule?.text !== 'string') return [];
        const parsed = cedar.checkParsePolicySet({ staticPolicies: { [rule.id]: rule.text } });
        if (parsed.type === 'success') return [];
        return parsed.errors.map(error => {
          const prefix = Buffer.from(rule.text)
            .subarray(0, error.sourceLocations?.[0]?.start ?? 0)
            .toString();
          const lines = prefix.split('\n');
          return {
            id: String(rule.id),
            line: lines.length,
            column: lines.at(-1)!.length + 1,
            message: error.message,
          };
        });
      });
      if (errors.length) return { ok: false, errors };
    }
    const rules = policyTexts(input);
    for (const [id, text] of Object.entries(rules)) {
      const parsed = cedar.checkParsePolicySet({ staticPolicies: { [id]: text } });
      if (parsed.type === 'failure') throw new AdminConfigError(JSON.stringify(parsed.errors));
      loadPolicySet({
        builtinRoles: builtin.roles as Role[],
        customRoles: roles,
        adminRules: { [id]: text.replace('@enabled("false")', '@enabled("true")') },
      });
    }
    loadPolicySet({ builtinRoles: builtin.roles as Role[], customRoles: roles, adminRules: rules });
    return { ok: true, errors: [] };
  } catch (error) {
    return { ok: false, errors: policyErrors(error as Error, input) };
  }
}

/** Lists shipped baseline text separately from editable administrator rules. */
export function listPolicies(rules: Record<string, string> = {}, roles: Role[] = []) {
  const source = readFileSync(new URL('../../policies/baseline.cedar', import.meta.url), 'utf8');
  const parts = cedar.policySetTextToParts(source);
  if (parts.type === 'failure') throw new AdminConfigError('Invalid shipped baseline.');
  const annotation = (text: string, key: string) =>
    new RegExp(`@${key}\\("([^"\\n]*)"\\)`).exec(text)?.[1];
  return {
    baseline: parts.policies.map(text => ({
      id: annotation(text, 'id')!,
      text,
      description: annotation(text, 'description') ?? '',
    })),
    rules: Object.entries(rules).map(([id, text]) => ({
      id,
      text,
      enabled: annotation(text, 'enabled') !== 'false',
      template: annotation(text, 'template'),
      description: annotation(text, 'description') ?? '',
    })),
    schema:
      readFileSync(new URL('../../policies/schema.cedarschema', import.meta.url), 'utf8') +
      '\n' +
      compileRoles([...(builtin.roles as Role[]), ...roles]).holdersFragment,
  };
}

/** Data-backed templates keep branch protection and client scope out of policy text. */
export type PolicyDataTemplate =
  | { template: 'branch-protection'; projects: string[]; patterns: string[] }
  | {
      template: 'agent-scope';
      clientId: string;
      name: string;
      projects: string[];
      domains: string[];
    };

/** Produces a proposed document for the ordinary validation and dry-run save path. */
export function policyDataTemplate(
  config: import('./access-config').AccessConfig,
  input: PolicyDataTemplate,
) {
  if (input.template === 'branch-protection') {
    const projects = structuredClone(config.projects);
    for (const slug of input.projects) {
      if (!projects.projects[slug]) throw new AdminConfigError(`Unknown project: ${slug}`);
      projects.projects[slug].protectedBranches = [...input.patterns];
    }
    return projects;
  }
  const clients = config.agents.clients.filter(client => client.clientId !== input.clientId);
  clients.push({
    clientId: input.clientId,
    name: input.name,
    projects: input.projects,
    domains: input.domains,
  });
  return { clients };
}

function policyErrors(error: Error, input: unknown) {
  const fallback = [{ id: '', line: 1, column: 1, message: error.message }];
  if (!Array.isArray(input) || !error.message.startsWith('[')) return fallback;
  let details: { policyId?: string; error?: cedar.DetailedError }[];
  try {
    details = JSON.parse(error.message);
  } catch {
    return fallback;
  }
  return details.map(detail => {
    const rule = input.find(rule => rule.id === detail.policyId);
    if (!rule || !detail.error) return fallback[0];
    const canonical = policyTexts([rule])[rule.id];
    const addedBytes = Buffer.byteLength(canonical) - Buffer.byteLength(rule.text);
    const offset = Math.max(
      0,
      (detail.error.sourceLocations?.[0]?.start ?? addedBytes) - addedBytes,
    );
    const prefix = Buffer.from(rule.text).subarray(0, offset).toString().split('\n');
    return {
      id: rule.id,
      line: prefix.length,
      column: prefix.at(-1)!.length + 1,
      message: detail.error.message,
    };
  });
}
