import { useState } from 'react';
import { AdminConfirmation } from './AdminConfirmation';
import { newIdentifier } from './helpers';
import { adminApi } from './api';
import { useAdminData } from './useAdminData';
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
  const [change, setChange] = useState<{ rules: Policy[]; description: string } | null>(null);
  const [history, setHistory] = useState(false);
  function saved() {
    setEdit(null);
    setChange(null);
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
      {error && <p role="alert">{error}</p>}
      <div className="admin-actions">
        <button onClick={create}>New rule</button>
        <button onClick={() => setHistory(true)}>History</button>
      </div>
      <h3>Admin rules</h3>
      {data?.rules.length === 0 && <p>No custom rules yet.</p>}
      {data?.rules.map(rule => (
        <section key={rule.id}>
          <h4>{rule.description || rule.id}</h4>
          <label>
            <input type="checkbox" checked={rule.enabled} onChange={() => toggle(rule)} />
            Enabled
          </label>
          <button onClick={() => setEdit(rule)}>Edit</button>
          <button
            onClick={() =>
              setChange({
                rules: data.rules.filter(item => item.id !== rule.id),
                description: `Delete ${rule.description || rule.id}`,
              })
            }
          >
            Delete
          </button>
        </section>
      ))}
      <details className="admin-builtin-rules">
        <summary>Built-in rules ({data?.baseline.length ?? 0}) — read-only</summary>
        {data?.baseline.map(rule => (
          <details key={rule.id}>
            <summary>
              🔒 {rule.id}
              {rule.description && ` · ${rule.description}`}
            </summary>
            <pre>{rule.text}</pre>
          </details>
        ))}
      </details>
      {change && data && (
        <AdminConfirmation title={change.description} onCancel={() => setChange(null)}>
          <ReviewChange area="policies" proposal={{ rules: change.rules }} baseVersion={data.version} onSaved={saved} description={change.description} inline />
        </AdminConfirmation>
      )}
    </>
  );
}
