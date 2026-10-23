/** Approve and Deprecate actions of a metric for the people who may approve it (server mode). */
import React, { useState } from 'react';
import { BadgeCheck, Archive } from 'lucide-react';
import type { KpiSummary } from '../../server/agent/explain';
import { useCapabilities } from '../auth/Capabilities';
import { approvalControl } from '../auth/guards-client';
import { useMe } from '../auth/useMe';
import { diffPatches } from '../editor/patch';
import { api } from '../projects/api';
import { metricPathIn, withMetricAttributes } from './metric-save';

/** Changes a metric's workbench attributes in its file with the item-level edit. */
async function saveAttributes(project: string, kpi: KpiSummary, changes: Record<string, string>) {
  const file = await api.file(project, kpi.file);
  const path = metricPathIn(file.source, kpi.modelPath, kpi.name);
  if (!path) throw Error(`${kpi.name} is no longer in ${kpi.file}. Reload and try again.`);
  const next = withMetricAttributes(file.source, kpi.file, path, changes);
  await api.save(project, kpi.file, file.hash, next, diffPatches(file.source, next));
}

/**
 * The Approve button of a proposed metric or the Deprecate button of an approved one. It is
 * disabled with the reason for people who may not approve it, and for its own owner.
 */
export function MetricApproval({ project, kpi }: { project: string; kpi: KpiSummary }) {
  const { me } = useMe();
  const access = useCapabilities(project);
  const permission = access.control('approveMetric');
  const control = approvalControl(me, kpi, {
    can: !permission.disabled,
    requirement: permission.title ?? '',
  });
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // Local mode keeps its single-person workflow, where the wizard and item editor set statuses.
  if (access.local || !control) return null;

  async function apply(changes: Record<string, string>, done: string) {
    setBusy(true);
    setMessage('');
    try {
      await saveAttributes(project, kpi, changes);
      setReason(null);
      setMessage(done);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function start() {
    if (control!.action === 'approve') void apply({ status: 'approved' }, 'Approved.');
    else {
      // The result of the earlier action would read as this form's outcome.
      setMessage('');
      setReason('');
    }
  }

  function deprecate(event: React.FormEvent) {
    event.preventDefault();
    if (!reason?.trim()) return;
    void apply({ status: 'deprecated', deprecation_reason: reason.trim() }, 'Deprecated.');
  }

  const Icon = control.action === 'approve' ? BadgeCheck : Archive;
  return (
    <div className="kpi-approval">
      <button
        className="kpi-edit"
        onClick={start}
        disabled={control.disabled || busy || reason !== null}
        title={control.reason}
      >
        <Icon size={13} />
        {control.label}
      </button>
      {control.disabled && control.reason && (
        <small className="kpi-approval-reason">{control.reason}.</small>
      )}
      {reason !== null && (
        <form className="kpi-deprecate" onSubmit={deprecate}>
          <input
            aria-label="Reason for deprecating"
            placeholder="Why it is deprecated, or what replaces it"
            value={reason}
            onChange={event => setReason(event.target.value)}
            autoFocus
          />
          <button type="submit" className="primary" disabled={busy || !reason.trim()}>
            Deprecate metric
          </button>
          <button type="button" onClick={() => setReason(null)}>
            Cancel
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
