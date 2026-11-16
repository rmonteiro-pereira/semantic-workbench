// Parses the reviewed operation contract without importing HTTP route implementations.
import inventory from '../../../policies/operation-inventory.json';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../../../schemas/semantic-workbench-operations-v1.json';
import type { operationClassifiers } from './operation-classifiers';
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
export { CALLER_ORIGINS } from '../../shared/observability/operation';
const DISPATCH_REASONS = ['public', 'stream', 'page', 'redirect', 'browser-only'] as const;
const INCREMENTS = ['local-edit', 'team-sign-in', 'workspace-scm', 'resources-prompts', 'administration', 'later', 'never'] as const;

/** Reviewed metadata for one route and its in-process twin. */
export type OperationEntry = {
  id: string;
  handlerChecks: (typeof HANDLER_CHECKS)[number][];
  limits: { request: keyof typeof REQUEST_LIMITS | 'none'; response: 'bounded' | 'paged' | 'binary' | 'stream'; work: 'light' | 'scan' | 'git' | 'network' };
  effects: OperationEffect[];
  dispatch: 'twin' | { no: (typeof DISPATCH_REASONS)[number] };
  outcomeClassifier?: keyof typeof operationClassifiers;
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

/** Invalid reviewed inventory data, including the row and schema failure. */
export class OperationInventoryError extends Error {}

const validator = new Ajv2020({ allErrors: true });
addFormats(validator);
const validate = validator.compile<OperationInventory>(schema);

/** Validates inventory structure with the shipped schema and refuses duplicate public ids. */
export function parseOperationInventory(value: unknown): OperationInventory {
  if (!validate(value)) throw new OperationInventoryError(validator.errorsText(validate.errors).replaceAll('~1', '/').replaceAll('~0', '~'));
  const seen = new Set<string>();
  for (const [row, entry] of Object.entries(value.operations)) {
    if (seen.has(entry.id)) throw new OperationInventoryError(`${row}: duplicate operation id ${entry.id}.`);
    seen.add(entry.id);
  }
  for (const capability of value.browserCapabilities) {
    if (seen.has(capability.id)) throw new OperationInventoryError(`Duplicate capability id ${capability.id}.`);
    seen.add(capability.id);
  }
  return structuredClone(value);
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
