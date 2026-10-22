import { useState } from 'react';
import { AdminDialog, type DialogProps } from './AdminDialog';
import { SelectField } from './SelectField';
import { adminApi, problemText } from './api';
import { useAdminData } from './useAdminData';
import { commaList } from './change-review';
import { ACTIONS } from '../../server/auth/actions';
import type { AccessExplanation } from './types';

/** Names the decision in words when the server sends `{allow}`, and shows any other shape as is. */
export function decisionLabel(decision: unknown): string {
  if (decision === 'allow' || decision === 'deny')
    return decision === 'allow' ? 'Allowed' : 'Denied';
  const allow = (decision as { allow?: unknown } | null)?.allow;
  if (typeof allow === 'boolean') return allow ? 'Allowed' : 'Denied';
  return JSON.stringify(decision);
}
/** Checks known or hypothetical people and lists who can act on a project or path. */
export function AccessCheckDialog({
  onClose,
  principal = '',
}: DialogProps & { principal?: string }) {
  const { data: users, error: loadError } = useAdminData(adminApi.users);
  const [person, setPerson] = useState(principal);
  const [hypothetical, setHypothetical] = useState(false);
  const [groups, setGroups] = useState('');
  const [email, setEmail] = useState('');
  const [action, setAction] = useState('read');
  const [project, setProject] = useState('');
  const [path, setPath] = useState('');
  const [branch, setBranch] = useState('');
  const [result, setResult] = useState<AccessExplanation | null>(null);
  const [who, setWho] = useState<Awaited<ReturnType<typeof adminApi.whoCan>> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    setError('');
    setResult(null);
    const type = path ? 'file' : 'project';
    try {
      setResult(
        await adminApi.check(
          hypothetical ? { groups: commaList(groups), email: email.trim().toLowerCase() } : person,
          action,
          {
            type: project ? type : 'workspace',
            ...(project ? { project } : {}),
            ...(path ? { path } : {}),
            ...(branch ? { branch } : {}),
          },
        ),
      );
    } catch (problem) {
      setError(problemText(problem));
    } finally {
      setBusy(false);
    }
  }
  async function whoCan() {
    setBusy(true);
    setError('');
    setWho(null);
    try {
      setWho(await adminApi.whoCan(project, path));
    } catch (problem) {
      setError(problemText(problem));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminDialog title="Access check" onClose={onClose}>
      {(error || loadError) && <p role="alert">{error || loadError}</p>}
      <label>
        <input
          type="checkbox"
          checked={hypothetical}
          onChange={event => setHypothetical(event.target.checked)}
        />
        Hypothetical person
      </label>
      {!hypothetical && (
        <label>
          Principal
          <input
            list="admin-principals"
            value={person}
            onChange={event => setPerson(event.target.value)}
          />
          <datalist id="admin-principals">
            {users?.map(user => (
              <option key={user.id} value={user.id}>
                {user.name} · {user.verifiedEmail}
              </option>
            ))}
          </datalist>
        </label>
      )}
      {hypothetical && (
        <>
          <label>
            Groups (comma separated)
            <input value={groups} onChange={event => setGroups(event.target.value)} />
          </label>
          <label>
            E-mail address
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} />
          </label>
        </>
      )}
      <SelectField label="Action" value={action} onChange={event => setAction(event.target.value)}>
        {ACTIONS.map(item => (
          <option key={item}>{item}</option>
        ))}
      </SelectField>
      <label>
        Project
        <input value={project} onChange={event => setProject(event.target.value)} />
      </label>
      <label>
        Path
        <input value={path} onChange={event => setPath(event.target.value)} />
      </label>
      <label>
        Branch
        <input value={branch} onChange={event => setBranch(event.target.value)} />
      </label>
      <div className="admin-actions">
        <button disabled={busy || (!hypothetical && !person)} onClick={check}>
          Check access
        </button>
        <button disabled={busy || !project} onClick={whoCan}>
          Who can access
        </button>
      </div>
      {result && (
        <section aria-label="Access result">
          <h3>Decision</h3>
          <p>{decisionLabel(result.decision)}</p>
          <h3>Matching grants</h3>
          {result.grants.map(grant => (
            <p key={grant.grantId}>
              {grant.grantId} · {grant.roleId} · {grant.via}
            </p>
          ))}
          <h3>Roles</h3>
          <p>{result.roles.join(', ')}</p>
          <h3>Deciding rules</h3>
          <p>{result.rules.join(', ')}</p>
          <h3>Attributes</h3>
          <pre>{JSON.stringify(result.attributes, null, 2)}</pre>
        </section>
      )}
      {who && (
        <section aria-label="Who can access results">
          {who.map((entry, index) => (
            <p key={index}>
              {entry.group ?? entry.email ?? entry.principal ?? entry.client} ·{' '}
              {entry.actions.join(', ')} · {entry.via}
            </p>
          ))}
        </section>
      )}
    </AdminDialog>
  );
}
