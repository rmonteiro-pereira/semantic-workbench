import { useCallback, useState } from 'react';
import { useMe } from '../auth/useMe';
import { whenLabel } from './when';
import { MenuButton } from '../projects/Menu';
import { AdminDialog, DialogActions, type DialogProps } from './AdminDialog';
import { adminApi, problemText } from './api';
import { useAdminData } from './useAdminData';
import { GrantForm, scopeLabel } from './GrantForm';
import { AccessCheckDialog } from './AccessCheckDialog';
import type { AdminUser } from './types';

/** Lists known identities and provenance, including people awaiting their first grant. */
export function UsersDialog({ onClose }: DialogProps) {
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
  return (
    <AdminDialog title="Users & groups" onClose={onClose}>
      {me?.mode === 'local' && <p>Users and provider groups apply in server mode.</p>}
      <label>
        Search people and groups
        <input value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <label>
        <input
          type="checkbox"
          checked={noAccess}
          onChange={event => setNoAccess(event.target.checked)}
        />
        No access
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="admin-table">
        <table className="admin-records">
          <thead>
            <tr>
              <th>Person</th>
              <th>Groups and roles</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.map(user => (
              <tr key={user.id}>
                <td>
                  {user.name}
                  <br />
                  <small className="admin-id">{user.verifiedEmail ?? user.id}</small>
                  Last sign-in: {user.lastSignInAt ? whenLabel(user.lastSignInAt) : 'never'}
                  {user.access === 'none' && <p>No access</p>}
                  {user.deactivated && <p>Deactivated</p>}
                </td>
                <td>
                  {user.groups.map(group => (
                    <p key={group.id}>
                      {group.displayName ?? 'name not resolved'}
                      <small className="admin-id">{group.id}</small>
                    </p>
                  ))}
                  {user.roleSources.map((source, index) => (
                    <span className="admin-chip" key={index}>
                      {me?.roleNames[source.roleId] ?? source.roleId}
                      {' · '}
                      {scopeLabel(source.scope)} ·{' '}
                      {source.via === 'bootstrap' ? 'Bootstrap Admin' : source.via + ' grant'}
                      {source.group && ` · ${source.group.name ?? source.group.id}`}
                    </span>
                  ))}
                </td>
                <td>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {grant && (
        <GrantForm
          email={grant.verifiedEmail ?? ''}
          onClose={() => setGrant(null)}
          onSaved={() => {
            setGrant(null);
            reload();
          }}
        />
      )}
      {check && <AccessCheckDialog principal={check.id} onClose={() => setCheck(null)} />}
      {operation && (
        <UserOperation
          {...operation}
          onClose={() => setOperation(null)}
          onSaved={() => {
            setOperation(null);
            reload();
          }}
        />
      )}
    </AdminDialog>
  );
}

function UserOperation({
  user,
  kind,
  onClose,
  onSaved,
}: DialogProps & {
  user: AdminUser;
  kind: 'deactivate' | 'reactivate' | 'sessions';
  onSaved: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const title = kind === 'sessions' ? 'End sessions' : kind[0].toUpperCase() + kind.slice(1);
  async function confirm() {
    setBusy(true);
    try {
      if (kind === 'sessions') await adminApi.endSessions(user.id);
      else await adminApi.changeUser(user.id, kind, reason);
      onSaved();
    } catch (problem) {
      setError(`${title} ${user.name}: ${problemText(problem)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminDialog
      title={title}
      onClose={onClose}
      size="small"
      lastAdminNotice={kind === 'deactivate'}
    >
      <p>
        {title} for {user.name}? This changes only this workbench.
      </p>
      {kind !== 'sessions' && (
        <label>
          Reason
          <input value={reason} onChange={event => setReason(event.target.value)} />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <DialogActions>
        <button
          className="primary"
          disabled={busy || (kind !== 'sessions' && !reason.trim())}
          onClick={confirm}
        >
          Confirm {title.toLowerCase()}
        </button>
      </DialogActions>
    </AdminDialog>
  );
}
