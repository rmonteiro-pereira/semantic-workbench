// Parses the reviewed operation contract without importing HTTP route implementations.
import inventory from '../../../policies/operation-inventory.json';
import { isAction, type Action } from '../../shared/auth/actions';
import { REQUEST_LIMITS } from '../request';

/** Effects a connection may consent to independently of role permissions. */
export const OPERATION_EFFECTS = ['read', 'localWrite', 'commit', 'remote', 'publish', 'administration', 'destroy', 'credential'] as const;
/** Effect of one operation or a dynamic handler step. */
export type OperationEffect = (typeof OPERATION_EFFECTS)[number];
/** Handler authorization steps whose coverage is required by the parity table. */
export const HANDLER_CHECKS = [
  'authorizeWrite',
  'authorizeGitPaths',
  'authorizeGitPush',
  'authorizeRepository',
  'authorizeCheckout',
  'authorizePublish',
  'creationDomain',
  'remoteAddress',
  'trashTarget',
  'bodyTargets',
] as const;
/** Audit transport origins. */
export const CALLER_ORIGINS = ['http', 'mcp'] as const;
const DISPATCH_REASONS = ['public', 'stream', 'page', 'redirect', 'browser-only'] as const;
const INCREMENTS = ['local-edit', 'team-sign-in', 'workspace-scm', 'resources-prompts', 'administration', 'later', 'never'] as const;

/** Reviewed metadata for one route and its in-process twin. */
export type OperationEntry = {
  id: string;
  service: string;
  action: Action;
  clientAction?: 'agentRead';
  targets: 'workspace' | 'project' | 'file' | 'path' | 'body' | 'handler';
  handlerChecks: (typeof HANDLER_CHECKS)[number][];
  input: { query: string[]; body: string[] };
  limits: { request: keyof typeof REQUEST_LIMITS | 'none'; response: 'bounded' | 'paged' | 'binary' | 'stream'; work: 'light' | 'scan' | 'git' | 'network' };
  effects: OperationEffect[];
  dispatch: 'twin' | { no: (typeof DISPATCH_REASONS)[number] };
  outcomeClassifier?: string;
  exposure: { increment: (typeof INCREMENTS)[number]; reason?: string };
};
/** A browser derivation that is deliberately absent from route dispatch. */
export type BrowserCapability = {
  id: string;
  summary: string;
  status: 'needs-shared-implementation' | 'browser-only-by-design';
  reason: string;
  increment: (typeof INCREMENTS)[number];
  source: string;
};
/** Validated route operations and remaining browser capabilities. */
export type OperationInventory = { operations: Record<string, OperationEntry>; browserCapabilities: BrowserCapability[] };

function object(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${where}: expected an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${where}: expected nonempty text.`);
  return value;
}
function member<T extends string>(value: unknown, choices: readonly T[], where: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new Error(`${where}: unsupported value ${String(value)}.`);
  return value as T;
}
function strings(value: unknown, where: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${where}: expected an array.`);
  return value.map((item, index) => text(item, `${where}[${index}]`));
}
function parseEntry(value: unknown, row: string): OperationEntry {
  const entry = object(value, row);
  const id = text(entry.id, row + '.id');
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(id)) throw new Error(`${row}: invalid operation id ${id}.`);
  if (!isAction(entry.action)) throw new Error(`${row}: invalid action.`);
  const input = object(entry.input, row + '.input');
  const limits = object(entry.limits, row + '.limits');
  const exposure = object(entry.exposure, row + '.exposure');
  const dispatch = entry.dispatch === 'twin' ? 'twin' : { no: member(object(entry.dispatch, row + '.dispatch').no, DISPATCH_REASONS, row + '.dispatch.no') };
  const increment = member(exposure.increment, INCREMENTS, row + '.exposure.increment');
  const reason = exposure.reason === undefined ? undefined : text(exposure.reason, row + '.exposure.reason');
  if ((dispatch !== 'twin' || ['later', 'never'].includes(increment)) && !reason) throw new Error(`${row}: exposure reason is required.`);
  if (entry.clientAction !== undefined && entry.clientAction !== 'agentRead') throw new Error(`${row}: invalid client action.`);
  const request = member(limits.request, ['none', ...Object.keys(REQUEST_LIMITS)] as (keyof typeof REQUEST_LIMITS | 'none')[], row + '.limits.request');
  return {
    id,
    service: text(entry.service, row + '.service'),
    action: entry.action,
    ...(entry.clientAction === undefined ? {} : { clientAction: entry.clientAction }),
    targets: member(entry.targets, ['workspace', 'project', 'file', 'path', 'body', 'handler'], row + '.targets'),
    handlerChecks: strings(entry.handlerChecks, row + '.handlerChecks').map(check => member(check, HANDLER_CHECKS, row + '.handlerChecks')),
    input: { query: strings(input.query, row + '.input.query'), body: strings(input.body, row + '.input.body') },
    limits: {
      request,
      response: member(limits.response, ['bounded', 'paged', 'binary', 'stream'], row + '.limits.response'),
      work: member(limits.work, ['light', 'scan', 'git', 'network'], row + '.limits.work'),
    },
    effects: strings(entry.effects, row + '.effects').map(effect => member(effect, OPERATION_EFFECTS, row + '.effects')),
    dispatch,
    exposure: { increment, ...(reason === undefined ? {} : { reason }) },
    ...(entry.outcomeClassifier === undefined ? {} : { outcomeClassifier: text(entry.outcomeClassifier, row + '.outcomeClassifier') }),
  };
}
/** Validates an inventory and names the row and field in every parser error. */
export function parseOperationInventory(value: unknown): OperationInventory {
  const root = object(value, 'inventory');
  const operations = Object.fromEntries(Object.entries(object(root.operations, 'operations')).map(([row, entry]) => [row, parseEntry(entry, row)]));
  const seen = new Set<string>();
  for (const [row, entry] of Object.entries(operations)) {
    if (seen.has(entry.id)) throw new Error(`${row}: duplicate operation id ${entry.id}.`);
    seen.add(entry.id);
  }
  if (!Array.isArray(root.browserCapabilities)) throw new Error('browserCapabilities: expected an array.');
  const browserCapabilities = root.browserCapabilities.map(value => {
    const capability = object(value, 'browserCapability');
    const id = text(capability.id, 'browserCapability.id');
    if (seen.has(id)) throw new Error(`Duplicate capability id ${id}.`);
    seen.add(id);
    return {
      id,
      summary: text(capability.summary, id + '.summary'),
      reason: text(capability.reason, id + '.reason'),
      source: text(capability.source, id + '.source'),
      status: member(capability.status, ['needs-shared-implementation', 'browser-only-by-design'], id + '.status'),
      increment: member(capability.increment, INCREMENTS, id + '.increment'),
    };
  });
  return { operations, browserCapabilities };
}
/** The checked-in operation contract, validated before it can be consumed. */
export const operationInventory = parseOperationInventory(inventory);
const byId = new Map(Object.entries(operationInventory.operations).map(([row, entry]) => [entry.id, { row, entry }]));
/** Finds a route's reviewed operation metadata. */
export function operationForRow(row: string): OperationEntry | undefined {
  return operationInventory.operations[row];
}
/** Finds an operation and its exact method/path row. */
export function operationById(id: string): { row: string; entry: OperationEntry } | undefined {
  return byId.get(id);
}
