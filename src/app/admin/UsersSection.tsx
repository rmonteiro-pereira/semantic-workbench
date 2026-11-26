import { RecordList, type RecordColumn } from './RecordList';
import { useCallback, useState } from 'react';
import { useMe } from '../auth/useMe';
import { whenLabel } from './helpers';
import { MenuButton } from '../projects/Menu';
import { AdminConfirmation } from './AdminConfirmation';
import { AdminPane } from './AdminPane';
import { adminApi, AdminApiError, problemText } from './api';
import { canOfferUserConfirmation } from './change-review';
import { useAdminData } from './useAdminData';
import { SectionStatus } from './SectionStatus';
import { EmptyState } from '../projects/EmptyState';
import { GrantForm, scopeLabel } from './GrantForm';
import { AccessCheckSection } from './AccessCheckSection';
import type { AdminUser } from './types';

/** Lists known identities and provenance, including people awaiting their first grant. */
export function UsersSection() {
  const { me } = useMe();
  const [query, setQuery] = useState('');
  const [noAccess, setNoAccess] = useState(false);
  const load = useCallback(() => adminApi.users(query, noAccess ? 'none' : ''), [query, noAccess]);
  const { data, error, reload } = useAdminData(load);
  const [grant, setGrant] = useState<AdminUser | null>(null);
  const [check, setCheck] = useState<AdminUser | null>(null);
  const [operation, setOperation] = useState<{
    user: AdminUser;
    kind: 'deactivate' | 'reactivate' | 'sessions';
  } | null>(null);
  if (grant) {
    return (
      <GrantForm
        email={grant.verifiedEmail ?? ''}
        backLabel="Back to users"
        onBack={() => setGrant(null)}
        onSaved={() => {
          setGrant(null);
          reload();
        }}
      />
    );
  }
  if (check) {
    return (
      <AdminPane title={`Access check for ${check.name}`} backLabel="Back to users" onBack={() => setCheck(null)}>
        <AccessCheckSection principal={check.id} />
      </AdminPane>
    );
  }
  return (
    <>
      {me?.mode === 'local' && <p>Users and provider groups apply in server mode.</p>}
      <label>
        Search people and groups
        <input value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={noAccess} onChange={event => setNoAccess(event.target.checked)} />
        No access
      </label>
      <p className="admin-section-intro">Tick No access to list only the people who hold no role yet. It changes nobody's access.</p>
      <SectionStatus subject="people and groups" loading={!data && !error} error={error} onRetry={reload} />
      {data?.length === 0 && (
        <EmptyState title={query || noAccess ? 'No one matches' : 'No one has signed in yet'}>
          {query || noAccess ? 'Clear the search or the No access filter to see everyone.' : 'People appear here after they first sign in.'}
        </EmptyState>
      )}
      {data && data.length > 0 && (
        <RecordList
          label="People and groups"
          records={data}
          recordKey={user => user.id}
          columns={userColumns(me?.roleNames ?? {})}
          actions={user => (
            <MenuButton
              label="Actions"
              ariaLabel={`Actions for ${user.name}`}
              items={[
                {
                  label: 'Grant access',
                  run: () => setGrant(user),
                  disabled: !user.verifiedEmail && 'A verified e-mail address is required',
                },
                {
                  label: user.deactivated ? 'Reactivate' : 'Deactivate',
                  run: () =>
                    setOperation({
                      user,
                      kind: user.deactivated ? 'reactivate' : 'deactivate',
                    }),
                },
                {
                  label: 'End sessions',
                  run: () => setOperation({ user, kind: 'sessions' }),
                },
                { label: 'Check access', run: () => setCheck(user) },
              ]}
            />
          )}
        />
      )}
      {operation && (
        <UserOperation
          {...operation}
          onCancel={() => setOperation(null)}
          onSaved={() => {
            setOperation(null);
            reload();
          }}
        />
      )}
    </>
  );
}

/** The people list's columns: who the person is, and the groups and roles they hold. */
function userColumns(roleNames: Record<string, string>): RecordColumn<AdminUser>[] {
  return [
    { label: 'Person', value: user => <PersonCell user={user} /> },
    { label: 'Groups and roles', value: user => <GroupsCell user={user} roleNames={roleNames} /> },
  ];
}

function PersonCell({ user }: { user: AdminUser }) {
  return (
    <>
      {user.name}
      <br />
      <small className="admin-id">{user.verifiedEmail ?? user.id}</small>
      Last sign-in: {user.lastSignInAt ? whenLabel(user.lastSignInAt) : 'never'}
      {user.access === 'none' && <p>No access</p>}
      {user.deactivated && <p>Deactivated</p>}
    </>
  );
}

function GroupsCell({ user, roleNames }: { user: AdminUser; roleNames: Record<string, string> }) {
  return (
    <>
      {user.groups.map(group => (
        <p key={group.id}>
          {group.displayName ?? 'Group name not resolved'}
          <small className="admin-id">{group.id}</small>
        </p>
      ))}
      {user.roleSources.map((source, index) => (
        <span className="admin-chip" key={index}>
          {roleNames[source.roleId] ?? source.roleId}
          {' · '}
          {scopeLabel(source.scope)} · {source.via === 'bootstrap' ? 'Bootstrap Admin' : source.via + ' grant'}
          {source.group && ` · ${source.group.name ?? source.group.id}`}
        </span>
      ))}
    </>
  );
}

/** What the person loses or regains, said before the change is confirmed. */
export function userOperationEffect(name: string, kind: 'deactivate' | 'reactivate' | 'sessions'): string {
  if (kind === 'deactivate') return `${name} will no longer be able to sign in, and their open sessions end.`;
  if (kind === 'reactivate') return `${name} will be able to sign in again with the roles they hold.`;
  return `${name} is signed out everywhere and has to sign in again.`;
}

function UserOperation({ user, kind, onCancel, onSaved }: { user: AdminUser; kind: 'deactivate' | 'reactivate' | 'sessions'; onCancel: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const title = kind === 'sessions' ? 'End sessions' : kind[0].toUpperCase() + kind.slice(1);
  async function confirm() {
    if (!canOfferUserConfirmation(refused)) return;
    setBusy(true);
    try {
      if (kind === 'sessions') await adminApi.endSessions(user.id);
      else await adminApi.changeUser(user.id, kind, reason);
      onSaved();
    } catch (problem) {
      if (problem instanceof AdminApiError && problem.details.error === 'last-admin') {
        setRefused(true);
        setError('This change would remove the last active Admin.');
      } else {
        setError(`${title} ${user.name}: ${problemText(problem)}`);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminConfirmation
      title={`${title} ${user.name}?`}
      onCancel={onCancel}
      size="narrow"
      lastAdminNotice={kind === 'deactivate' && !refused}
      actions={
        canOfferUserConfirmation(refused) && (
          <button className={kind === 'reactivate' ? 'primary' : 'danger'} disabled={busy || (kind !== 'sessions' && !reason.trim())} onClick={confirm}>
            Confirm {title.toLowerCase()}
          </button>
        )
      }
    >
      {!refused && <p>{userOperationEffect(user.name, kind)} This changes only this workbench.</p>}
      {!refused && kind !== 'sessions' && (
        <>
          <label>
            Reason
            <input value={reason} onChange={event => setReason(event.target.value)} />
          </label>
          <p className="admin-field-hint">Required. It is kept in the audit record.</p>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </AdminConfirmation>
  );
}
