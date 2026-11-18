// Which statuses a person may move an item to, and why the others are off. The server judges every save again; this keeps the controls honest.
import { ownsMetric } from '../auth/guards-client';
import { statusLabel } from '../../shared/governance/item-governance';
import type { Me } from '../auth/useMe';

/** One status in the control. */
export type StatusChoice = { value: string; label: string; disabled: boolean; reason?: string };

/** What the control needs to know about the person and the item. */
export type StatusContext = { me: Me | null; local: boolean; canApprove: boolean; approveRequirement: string; owner?: string };

/** The moves the lifecycle allows from a status: proposed and approved items can go forward, approved ones can be deprecated, and anything can return to proposed. */
function reachable(current: string | undefined): string[] {
  if (current === 'approved') return ['approved', 'proposed', 'deprecated'];
  if (current === 'deprecated') return ['deprecated', 'proposed'];
  return ['proposed', 'approved'];
}

/** The choices of the status control for an item in its current status. */
export function statusChoices(current: string | undefined, context: StatusContext): StatusChoice[] {
  const owns = !context.local && ownsMetric(context.me, context.owner);
  const choices: StatusChoice[] = [];
  if (current === undefined || !['proposed', 'approved', 'deprecated'].includes(current)) choices.push({ value: current ?? '', label: statusLabel(current), disabled: false });
  for (const value of reachable(current)) {
    const needsApprover = value === 'approved' || value === 'deprecated';
    const changes = value !== current;
    let reason: string | undefined;
    if (needsApprover && changes && !context.canApprove) reason = context.approveRequirement;
    else if (needsApprover && changes && owns) reason = 'You own this item; another Steward decides';
    choices.push({ value, label: statusLabel(value), disabled: reason !== undefined, reason });
  }
  return choices;
}
