// Decides whether a compile may release its files: a failure never can, and a loss only when the person accepted it exactly.
import type { CompileFailure } from '../../shared/tessera/compile-document';
import { LossPolicyError, acceptLoss, parseLossPolicy, type Acceptance, type AcceptanceOffer, type LossPolicy, type LossReport } from '../../shared/tessera/loss-report';
import { REGISTRY } from '../../shared/tessera/registry';

/** The answer for one compile: release it, ask the person to accept the loss, or refuse it outright. */
export type AcceptanceDecision = { decision: 'accepted'; accepted: Acceptance } | { decision: 'needs-acceptance'; reason: string } | { decision: 'refused' };

/** Reads a loss policy that arrived inside a request, with the same rules as a policy file. */
export function readInlinePolicy(value: unknown): LossPolicy {
  return parseLossPolicy(JSON.stringify(value ?? null), REGISTRY);
}

/** Tells whether an error means the supplied policy is not usable, so the caller can answer with a bad request. */
export function isPolicyError(error: unknown): error is LossPolicyError {
  return error instanceof LossPolicyError;
}

/** Applies the acceptance rules to a report. Failures of the compile come first and cannot be overridden. */
export function decideAcceptance(report: LossReport, failures: CompileFailure[], offer: AcceptanceOffer): AcceptanceDecision {
  if (failures.length) return { decision: 'refused' };
  const outcome = acceptLoss(report, offer);
  if ('refusal' in outcome) return { decision: 'needs-acceptance', reason: outcome.refusal };
  return { decision: 'accepted', accepted: outcome.accepted };
}
