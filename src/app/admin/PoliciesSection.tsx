import { SavedNote, useSavedAt } from './SaveStatus';
import { useState } from 'react';
import { AdminConfirmation } from './AdminConfirmation';
import { newIdentifier } from './helpers';
import { adminApi } from './api';
import { useAdminData } from './useAdminData';
import { SectionStatus } from './SectionStatus';
import { EmptyState } from '../projects/EmptyState';
import { PolicyEditor } from './PolicyEditor';
import { ReviewChange } from './ReviewChange';
import { VersionHistory } from './VersionHistory';
import type { Policy } from './types';

async function loadPolicies() {
  const policies = await adminApi.policies();
  return { version: policies.version, ...policies.document };
}
/** Keeps baseline rules read-only and reviews every Admin rule activation or removal. */
export function PoliciesSection() {
  const { data, error, reload } = useAdminData(loadPolicies);
  const [edit, setEdit] = useState<Policy | null>(null);
  const [change, setChange] = useState<{ rules: Policy[]; description: string; deleted?: string } | null>(null);
  const [history, setHistory] = useState(false);
  const { savedAt, markSaved } = useSavedAt();
  function saved() {
    setEdit(null);
    setChange(null);
    markSaved();
    reload();
  }
  function create() {
    setEdit({
      id: newIdentifier('p_'),
      text: '',
      description: '',
      enabled: true,
    });
  }
  function toggle(policy: Policy) {
    if (!data) return;
    const enabled = !policy.enabled;
    const text = policy.text.replace(/@enabled\("(?:true|false)"\)/g, `@enabled("${enabled}")`);
    setChange({
      rules: data.rules.map(rule => (rule.id === policy.id ? { ...policy, enabled, text } : rule)),
      description: `${enabled ? 'Enable' : 'Disable'} ${policy.description || policy.id}`,
    });
  }
  if (edit && data) {
    return <PolicyEditor initial={edit} rules={data.rules} version={data.version} onBack={() => setEdit(null)} onSaved={saved} />;
  }
  if (history) {
    return (
      <VersionHistory
        area="policies"
        backLabel="Back to policies"
        onBack={() => {
          setHistory(false);
          reload();
        }}
      />
    );
  }
  return (
    <>
      <div className="admin-actions">
        <button onClick={create}>New rule</button>
        <button onClick={() => setHistory(true)}>History</button>
      </div>
      <SectionStatus subject="access rules" loading={!data && !error} error={error} onRetry={reload} />
      <SavedNote at={savedAt} />
      {data && (
        <>
          <h3>Admin rules</h3>
          {data.rules.length === 0 && <EmptyState title="No rules of your own yet">Use New rule to add one. The built-in rules below always apply.</EmptyState>}
          {data.rules.map(rule => (
            <section key={rule.id}>
              <h4>{rule.description || rule.id}</h4>
              <label>
                <input type="checkbox" checked={rule.enabled} onChange={() => toggle(rule)} />
                Enabled
              </label>
              <button onClick={() => setEdit(rule)}>Edit</button>
              <button
                className="admin-remove"
                onClick={() =>
                  setChange({
                    rules: data.rules.filter(item => item.id !== rule.id),
                    description: `Delete ${rule.description || rule.id}`,
                    deleted: rule.description || rule.id,
                  })
                }
              >
                Delete
              </button>
            </section>
          ))}
          <details className="admin-builtin-rules">
            <summary>Built-in rules ({data.baseline.length}) — read-only</summary>
            {data.baseline.map(rule => (
              <details key={rule.id}>
                <summary>
                  🔒 {rule.id}
                  {rule.description && ` · ${rule.description}`}
                </summary>
                <pre>{rule.text}</pre>
              </details>
            ))}
          </details>
        </>
      )}
      {change && data && (
        <AdminConfirmation title={change.deleted ? `${change.description}?` : change.description} onCancel={() => setChange(null)}>
          {change.deleted && <p>The rule {change.deleted} stops applying once the change is saved. The built-in rules are not affected.</p>}
          <ReviewChange area="policies" proposal={{ rules: change.rules }} baseVersion={data.version} onSaved={saved} description={change.description} destructive={Boolean(change.deleted)} inline />
        </AdminConfirmation>
      )}
    </>
  );
}
