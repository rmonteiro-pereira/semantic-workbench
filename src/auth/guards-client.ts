// Applies the server's governance rules in the browser so controls the server would refuse are
// disabled before a save: approval of metrics, and classification and protected properties of
// data contracts. The server decides again on every save.
import {
  classificationLevel,
  levelNumber,
  ownerMatches,
  type ClassificationSettings,
} from '../governance/guards';
import type { KpiSummary } from '../../server/agent/explain';
import type { Me } from './useMe';

/** The approval action a metric offers, and why it is disabled when it is. */
export type ApprovalControl = {
  action: 'approve' | 'deprecate';
  label: 'Approve' | 'Deprecate';
  disabled: boolean;
  reason?: string;
};

/** Whether a metric's owner value names the signed-in person, by address or username. */
export function ownsMetric(me: Me | null, owner: string | undefined): boolean {
  if (!me || !owner) return false;
  return ownerMatches(owner, me);
}

/** The status a metric moves to through Approve or Deprecate, or null when neither applies. */
function nextAction(status: string | undefined): ApprovalControl['action'] | null {
  if (status === 'proposed') return 'approve';
  if (status === 'approved') return 'deprecate';
  return null;
}

/**
 * The Approve or Deprecate control of a metric. It is disabled with the reason when the person
 * lacks the approval permission or owns the metric; nobody approves their own metric.
 */
export function approvalControl(
  me: Me | null,
  kpi: Pick<KpiSummary, 'status' | 'owner'>,
  allowed: { can: boolean; requirement: string },
): ApprovalControl | null {
  const action = nextAction(kpi.status);
  if (!action) return null;
  const label = action === 'approve' ? 'Approve' : 'Deprecate';
  if (!allowed.can) return { action, label, disabled: true, reason: allowed.requirement };
  if (ownsMetric(me, kpi.owner)) {
    return {
      action,
      label,
      disabled: true,
      reason: 'You own this metric; another Steward decides',
    };
  }
  return { action, label, disabled: false };
}

/** Whether a property's classification is at or above the project's protected level. */
export function isProtected(
  classification: unknown,
  settings: ClassificationSettings | undefined,
): boolean {
  if (!settings) return false;
  const level = classificationLevel(classification, settings.aliases);
  return levelNumber(level) >= levelNumber(settings.protectedLevel);
}
