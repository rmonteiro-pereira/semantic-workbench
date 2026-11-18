// Plans the file text of a governance change for an ontology item or a metric. Nothing is written here; the caller saves the text through the item save path.
import { applyPatches } from '../../shared/editor/patch';
import type { Path } from '../../shared/edit/item-model';
import { itemValue, valuePatches } from '../../shared/edit/yaml-patch';
import { metricAttributesFromEdit, withGovernance, type GovernanceEdit } from '../../shared/governance/item-governance';
import { withMetricAttributes } from '../../shared/metrics/metric-save';
import { GOVERNANCE_PROPERTY } from '../../shared/tessera/additions/governance';
import { validateInput } from '../../shared/validation/input';

/** The new text of the file, or the reason the change cannot be made. */
export type GovernancePlan = { source: string } | { refusal: string };

function checked(filename: string, source: string): GovernancePlan {
  const errors = validateInput(source, filename).issues.filter(issue => issue.severity === 'error');
  return errors.length ? { refusal: `The change would not be valid: ${errors[0].message}` } : { source };
}

/** The refusal for values that break a rule before the file is checked, or nothing. */
function editRefusal(edit: GovernanceEdit): string | null {
  const status = edit.status;
  if (status !== undefined && status !== 'deprecated' && (edit.replacedBy || edit.deprecationReason))
    return 'A replacement and a reason belong to a deprecated item. Set the status to deprecated first.';
  return null;
}

/** Writes the governance entry of a concept or relationship. `raise` moves the file to the revision the entry needs before the text is checked. */
export function planItemGovernance(source: string, filename: string, itemPath: Path, edit: GovernanceEdit, raise: (text: string) => string = text => text): GovernancePlan {
  const refusal = editRefusal(edit);
  if (refusal) return { refusal };
  const item = itemValue(source, itemPath) ?? {};
  const entry = withGovernance(item, edit)[GOVERNANCE_PROPERTY];
  const written = applyPatches(source, valuePatches(source, [...itemPath, GOVERNANCE_PROPERTY], entry, filename));
  return checked(filename, raise(written));
}

/** Writes the governance of a metric through the metric writer, which keeps the other attributes and the other vendors' entries. */
export function planMetricGovernance(source: string, filename: string, metricPath: Path, edit: GovernanceEdit): GovernancePlan {
  const refusal = editRefusal(edit);
  if (refusal) return { refusal };
  return checked(filename, withMetricAttributes(source, filename, metricPath, metricAttributesFromEdit(edit)));
}
