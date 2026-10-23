// Binds the shared governance rules to a request: each guarded change of a write is decided by
// the access policies (`approveMetric` or `editGuarded`), and a refusal names what was guarded.
// The pure rules live in src/governance/guards.ts, which this module re-exports.
import { levelNumber, type Action } from './actions';
import { NEW_PROJECT, type Decision, type ResourceRef } from './resource';
import type { AccessScope } from './authorize';
import { WriteAccessError } from './write-access-error';
import {
  applyGuards,
  type ContentGuard,
  type GuardedChange,
  type GuardKind,
  type GuardOperation,
} from '../../src/governance/guards';

export * from '../../src/governance/guards';

/** A guarded part of a readable file that the refused write would have changed. */
export type GuardedItem = { file: string; pointer: string; kind: GuardKind };

/** What each guarded change is, in the words of a refusal. */
const GUARD_TEXT: Record<GuardKind, string> = {
  'metric-status': 'approving or deprecating a metric',
  'metric-body': 'changing or removing an approved metric',
  classification: 'changing a classification',
  'critical-data-element': 'changing a critical data element',
  team: 'changing the contract team',
  roles: 'changing the contract roles',
  'protected-property': 'changing a property at or above the protected classification level',
};

/** Who may do an operation that brings in text the person did not type, in a refusal. */
const OPERATION_TEXT: Record<GuardOperation, string> = {
  pull: "Ask a Steward of this project's domain, or an Admin, to pull these changes.",
  revert: "Ask a Steward of this project's domain, or an Admin, to revert this file.",
  delete: "Ask a Steward of this project's domain, or an Admin, to delete this file.",
  restore: "Ask a Steward of this project's domain, or an Admin, to restore it.",
  import: 'Remove the approval or classification from the files, or ask a Steward to import them.',
  move: "Ask a Steward of both projects' domains, or an Admin, to move this file.",
  switch: "Ask a Steward of this project's domain, or an Admin, to switch to this branch.",
  publish: 'Ask another Steward of this domain, or an Admin, to publish these changes.',
};

// The words of a refusal for a change the person cannot read: it names no metric and no kind of
// change, which would reveal what a file they may not read contains.
function genericRefusalText(operation?: GuardOperation) {
  const next = operation ? ' ' + OPERATION_TEXT[operation] : '';
  return `Refused: this would include a guarded change, which needs Steward in this project's domain, or Admin.${next}`;
}

function refusalText(change: GuardedChange, decision: Decision, operation?: GuardOperation) {
  const next = operation ? ' ' + OPERATION_TEXT[operation] : '';
  if (decision.rules.includes('F1-no-self-approval')) {
    const metric = change.metric?.name;
    return `Refused: nobody approves or deprecates a metric they own (${metric}).${next}`;
  }
  const what = GUARD_TEXT[change.kind];
  const who = "needs Steward in this project's domain, or Admin";
  return `Refused: this would include ${what}, which ${who}.${next}`;
}

/** A write refused as a whole because it would make guarded changes the person may not make. */
export class GuardedChangeError extends WriteAccessError {
  public guarded: GuardedItem[];

  constructor(
    action: Action,
    resource: ResourceRef,
    decision: Decision,
    refused: { guarded: GuardedItem[]; message: string },
  ) {
    super(action, resource, decision);
    this.name = 'GuardedChangeError';
    this.message = refused.message;
    this.guarded = refused.guarded;
  }
}

/** The request a guard decides for, and the domain of a project the write is creating. */
type GuardBinding = { scope: AccessScope; domain?: string };

type FileResource = Extract<ResourceRef, { type: 'file' }>;

/** The file a guarded change is decided on; a file of a project being created carries its domain. */
function guardedFile(binding: GuardBinding, change: GuardedChange): FileResource {
  const creating = change.project === NEW_PROJECT && binding.domain !== undefined;
  return {
    type: 'file',
    project: change.project,
    path: change.file,
    ...(creating ? { domain: binding.domain } : {}),
  };
}

function metricDecision(binding: GuardBinding, change: GuardedChange): Decision {
  const context = { guardKind: change.kind, level: levelNumber(change.level) };
  const metric = change.metric!;
  // An owner before or after the write both count, so changing the owner cannot hide one.
  const owners = metric.owners.length ? metric.owners : [undefined];
  let decision: Decision | undefined;
  for (const owner of owners) {
    const resource: ResourceRef = {
      ...guardedFile(binding, change),
      docType: 'metric',
      metric: { name: metric.name, status: metric.status, owner },
    };
    decision = binding.scope.authorize('approveMetric', resource, context);
    if (!decision.allow) return decision;
  }
  return decision!;
}

function guardDecision(binding: GuardBinding, change: GuardedChange): Decision {
  if (change.metric) return metricDecision(binding, change);
  const resource: ResourceRef = { ...guardedFile(binding, change), level: change.level };
  const context = { guardKind: change.kind, level: levelNumber(change.level) };
  return binding.scope.authorize('editGuarded', resource, context);
}

function guardRefusal(
  scope: AccessScope,
  refused: GuardedChange[],
  decisions: Map<GuardedChange, Decision>,
  operation?: GuardOperation,
): GuardedChangeError {
  const first = refused[0];
  const decision = decisions.get(first)!;
  const view = scope.view();
  // Pointers inside files the person cannot read stay unnamed; files they are creating are theirs.
  const readable = (change: GuardedChange) =>
    change.project === NEW_PROJECT || view.canRead(change.project, change.file);
  const guarded = refused
    .filter(readable)
    .map(change => ({ file: change.file, pointer: change.pointer, kind: change.kind }));
  const action: Action = first.metric ? 'approveMetric' : 'editGuarded';
  const resource: ResourceRef = { type: 'file', project: first.project, path: first.file };
  const denied: Decision = {
    allow: false,
    status: 403,
    rules: decision.rules,
    reason: `guarded:${first.kind}`,
  };
  // The message names the first refused change the person can read, never a hidden one; the audit
  // above keeps the first refused change whatever it is.
  const shown = refused.find(readable);
  const message = shown
    ? refusalText(shown, decisions.get(shown)!, operation)
    : genericRefusalText(operation);
  return new GuardedChangeError(action, resource, denied, { guarded, message });
}

/**
 * The guard one signed-in principal's content writes apply. `requestReader` carries it to the
 * workspace; local mode has no guard and writes exactly as it always has. A write that creates a
 * project names its domain, so its files are decided as files of that domain.
 */
export function guardFor(scope: AccessScope): ContentGuard {
  return (changes, options = {}) => {
    const binding = { scope, domain: options.domain };
    const decisions = new Map<GuardedChange, Decision>();
    const allowed = (change: GuardedChange) => {
      const decision = guardDecision(binding, change);
      decisions.set(change, decision);
      return decision.allow;
    };
    // Only a save demotes; an operation that brings in other text is decided as it is.
    const demote = options.demote ?? options.operation === undefined;
    const outcome = applyGuards(changes, scope.classification, allowed, { demote });
    if (outcome.refused.length) {
      throw guardRefusal(scope, outcome.refused, decisions, options.operation);
    }
    return outcome;
  };
}
