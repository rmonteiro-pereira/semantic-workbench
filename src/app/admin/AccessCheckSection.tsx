import { useEffect, useRef, useState } from 'react';
import { SelectField } from './SelectField';
import { adminApi, problemText } from './api';
import { useAdminData } from './useAdminData';
import { commaList } from './change-review';
import { ACTIONS } from '../../shared/auth/actions';
import type { AccessExplanation, AdminUser } from './types';
import { WrappingField } from './WrappingField';

/** Names the decision in words when the server sends `{allow}`, and shows any other shape as is. */
export function decisionLabel(decision: unknown): string {
  if (decision === 'allow' || decision === 'deny') return decision === 'allow' ? 'Allowed' : 'Denied';
  const allow = (decision as { allow?: unknown } | null)?.allow;
  if (typeof allow === 'boolean') return allow ? 'Allowed' : 'Denied';
  return JSON.stringify(decision);
}
/** Who the typed ID belongs to, written out whole, since a long ID is cut inside its field. */
export function personEcho(users: AdminUser[], id: string): string {
  if (!id) return '';
  const user = users.find(candidate => candidate.id === id);
  if (!user) return id;
  return user.verifiedEmail ? `${user.name} · ${user.verifiedEmail}` : user.name;
}

/** Checks known or hypothetical people and lists who can act on a project or path. */
export function AccessCheckSection({ principal = '' }: { principal?: string }) {
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
        await adminApi.check(hypothetical ? { groups: commaList(groups), email: email.trim().toLowerCase() } : person, action, {
          type: project ? type : 'workspace',
          ...(project ? { project } : {}),
          ...(path ? { path } : {}),
          ...(branch ? { branch } : {}),
        }),
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
    <>
      {(error || loadError) && <p role="alert">{error || loadError}</p>}
      <label>
        <input type="checkbox" checked={hypothetical} onChange={event => setHypothetical(event.target.checked)} />
        Hypothetical person
      </label>
      {!hypothetical && (
        <>
          <label>
            Person ID
            <input list="admin-principals" aria-describedby="access-person-guidance" value={person} onChange={event => setPerson(event.target.value)} />
            <datalist id="admin-principals">
              {users?.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name} · {user.verifiedEmail}
                </option>
              ))}
            </datalist>
          </label>
          {person && (
            <p className="admin-field-choice" aria-live="polite">
              {personEcho(users ?? [], person)}
            </p>
          )}
          <p id="access-person-guidance" className="admin-section-intro">
            Choose a signed-in person or copy their ID from Users &amp; groups.
          </p>
        </>
      )}
      {hypothetical && (
        <>
          <label>
            Groups (comma separated)
            <WrappingField value={groups} onValueChange={setGroups} />
          </label>
          <label>
            E-mail address
            <WrappingField inputMode="email" value={email} onValueChange={setEmail} />
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
        <WrappingField value={project} onValueChange={setProject} />
      </label>
      <label>
        Path
        <WrappingField value={path} onValueChange={setPath} />
      </label>
      <label>
        Branch
        <WrappingField value={branch} onValueChange={setBranch} />
      </label>
      <p className="admin-section-intro" id="access-check-guidance">
        Choose a person or enable Hypothetical person for Check access. Leave Project blank to check workspace access. Enter a project for Who can access.
      </p>
      <div className="admin-actions">
        <button disabled={busy || (!hypothetical && !person)} onClick={check}>
          Check access
        </button>
        <button disabled={busy || !project} onClick={whoCan}>
          Who can access
        </button>
      </div>
      {result && <AccessResult result={result} />}
      {who && (
        <section aria-label="Who can access results">
          {who.map((entry, index) => (
            <p key={index}>
              {entry.group ?? entry.email ?? entry.principal ?? entry.client} · {entry.actions.join(', ')} · {entry.via}
            </p>
          ))}
        </section>
      )}
    </>
  );
}

/** Presents the decision before its supporting details and keeps it in view. */
export function AccessResult({ result }: { result: AccessExplanation }) {
  const banner = useRef<HTMLParagraphElement>(null);
  const label = decisionLabel(result.decision);
  const allowed = label === 'Allowed';
  const reason = (result.decision as { reason?: string } | null)?.reason;
  let explanation = allowed ? 'The matching grants and access rules permit this action.' : 'No matching access rule permits this action.';
  if (!allowed && reason && reason !== 'no-permit') explanation = 'An access restriction prevents this action.';
  if (!allowed && reason === 'not-readable') explanation = 'This person cannot read the selected project or file.';
  if (!allowed && reason === 'evaluation-error') explanation = 'The access rules could not be evaluated.';
  useEffect(() => {
    banner.current?.scrollIntoView({ block: 'nearest' });
  }, [result]);
  return (
    <section aria-label="Access result" className="admin-access-result">
      <p ref={banner} role="status" className={allowed ? 'admin-decision allowed' : 'admin-decision denied'}>
        {label}: {explanation}
      </p>
      {result.grants.length > 0 && (
        <>
          <h3>Matching grants</h3>
          {result.grants.map(grant => (
            <p key={grant.grantId}>
              The {grant.roleId} role is granted through {grant.via} (grant {grant.grantId}).
            </p>
          ))}
        </>
      )}
      {result.roles.length > 0 && (
        <>
          <h3>Roles</h3>
          <p>{result.roles.join(', ')}</p>
        </>
      )}
      {result.rules.length > 0 && (
        <>
          <h3>Deciding rules</h3>
          <p>{result.rules.join(', ')}</p>
        </>
      )}
      <details>
        <summary>Attributes</summary>
        <pre>{JSON.stringify(result.attributes, null, 2)}</pre>
      </details>
    </section>
  );
}
