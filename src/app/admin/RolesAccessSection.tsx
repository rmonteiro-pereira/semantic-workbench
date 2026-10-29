import { useState } from 'react';
import { EmptyState } from '../projects/EmptyState';
import { useMe } from '../auth/useMe';
import { AdminConfirmation } from './AdminConfirmation';
import { newIdentifier, whenLabel } from './helpers';
import { MenuButton } from '../projects/Menu';
import { adminApi } from './api';
import { useAdminData } from './useAdminData';
import { GrantForm, scopeLabel } from './GrantForm';
import { RoleMatrix } from './RoleMatrix';
import { RoleEditor } from './RoleEditor';
import { ReviewChange } from './ReviewChange';
import { VersionHistory } from './VersionHistory';
import type { Grant, Role } from './types';

// Roles and grants are read at one administration version; saving either uses that version.
async function loadRoles() {
  const [roles, grants] = await Promise.all([adminApi.roles(), adminApi.grants()]);
  return { version: grants.version, roles: roles.document, grants: grants.document.grants };
}
/** Lists all grants, or the locked built-in roles beside the editable custom roles. */
export function RolesAccessSection({ view }: { view: 'grants' | 'roles' }) {
  const { me } = useMe();
  const { data, error, reload } = useAdminData(loadRoles);
  const [grant, setGrant] = useState<Grant | 'new' | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [removal, setRemoval] = useState<Grant | Role | null>(null);
  const [history, setHistory] = useState(false);
  function saved() {
    setGrant(null);
    setRole(null);
    setRemoval(null);
    reload();
  }
  function duplicate(source?: Role) {
    setRole({
      id: newIdentifier('r_'),
      name: source ? source.name + ' copy' : '',
      description: source?.description ?? '',
      permissions: source?.permissions.filter(permission => !permission.actions.includes('admin')) ?? [],
      // roles.json records who created each custom role and when, as grants.json does for grants.
      createdBy: me?.id ?? '',
      createdAt: new Date().toISOString(),
    });
  }
  if (grant && data) {
    return <GrantForm initial={grant === 'new' ? undefined : grant} backLabel="Back to grants" onBack={() => setGrant(null)} onSaved={saved} />;
  }
  if (role && data) {
    return <RoleEditor initial={role} {...data} onBack={() => setRole(null)} onSaved={saved} />;
  }
  if (history) {
    return (
      <VersionHistory
        area={view}
        backLabel={`Back to ${view}`}
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
        {view === 'grants' ? <button onClick={() => setGrant('new')}>Add grant</button> : <button onClick={() => duplicate()}>New role</button>}
        <button onClick={() => setHistory(true)}>History</button>
      </div>
      {data && view === 'grants' && (
        <>
          {data.grants.length === 0 && (
            <EmptyState title="No access grants yet">
              {me?.mode === 'local' && 'Local mode gives you full access. '}
              Use Add grant to give a person or group a role in server mode.
            </EmptyState>
          )}
          <div className="admin-table">
            <table className="admin-records">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role / scope</th>
                  <th>Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.grants.map(item => (
                  <tr key={item.id}>
                    <td>
                      {item.member.kind === 'email' ? (
                        item.member.email
                      ) : (
                        <>
                          {item.member.displayName ?? 'name not resolved'}
                          <small className="admin-id">{item.member.groupId}</small>
                        </>
                      )}
                    </td>
                    <td>
                      {[...data.roles.builtIn, ...data.roles.custom].find(role => role.id === item.roleId)?.name ?? item.roleId}
                      <br />
                      {scopeLabel(item.scope)}
                    </td>
                    <td>
                      {item.addedBy}
                      <br />
                      {whenLabel(item.addedAt)}
                    </td>
                    <td>
                      <MenuButton
                        ariaLabel={`Actions for grant ${item.id}`}
                        label="Actions"
                        items={[
                          { label: 'Change', run: () => setGrant(item) },
                          { label: 'Remove', run: () => setRemoval(item) },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {data && view === 'roles' && (
        <>
          <RoleMatrix roles={data.roles.builtIn} actions={data.roles.actions} />
          {data.roles.builtIn.map(item => (
            <section key={item.id} aria-label={item.name} className="admin-builtin-role">
              <h3>🔒 {item.name} — Built-in role</h3>
              <p>{item.description}</p>
              <button onClick={() => duplicate(item)}>Duplicate as custom role</button>
            </section>
          ))}
          {data.roles.custom.map(item => (
            <section key={item.id} aria-label={item.name}>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <button onClick={() => setRole(item)}>Edit</button>
              <button onClick={() => setRemoval(item)}>Delete</button>
            </section>
          ))}
        </>
      )}
      {removal && data && <RemoveAccess item={removal} data={data} onCancel={() => setRemoval(null)} onSaved={saved} />}
    </>
  );
}

function RemoveAccess({ item, data, onCancel, onSaved }: { item: Grant | Role; data: Awaited<ReturnType<typeof loadRoles>>; onCancel: () => void; onSaved: () => void }) {
  const grant = 'roleId' in item;
  const proposal = grant ? { grants: data.grants.filter(entry => entry.id !== item.id) } : { roles: data.roles.custom.filter(entry => entry.id !== item.id) };
  const question = grant ? `Remove ${grantSummary(item, data.roles)}?` : `Delete the role ${item.name} and all of its grants?`;
  return (
    <AdminConfirmation title={grant ? 'Remove grant' : 'Delete role'} onCancel={onCancel} lastAdminNotice={grant}>
      <p>{question}</p>
      {!grant && <RoleHolders roleId={item.id} grants={data.roles.usage[item.id]?.grants ?? 0} />}
      <ReviewChange
        area={grant ? 'grants' : 'roles'}
        proposal={proposal}
        baseVersion={data.version}
        confirmDeleteInUse={!grant}
        onSaved={onSaved}
        description={grant ? 'Remove grant' : 'Delete role and grants'}
        changeLabel={question.slice(0, -1)}
        inline
      />
    </AdminConfirmation>
  );
}

const loadUsers = () => adminApi.users();

/** Names the people who hold a role now, so its deletion says whom it affects before review. */
function RoleHolders({ roleId, grants }: { roleId: string; grants: number }) {
  const { data, error } = useAdminData(loadUsers);
  const holders = data?.filter(user => user.roleSources.some(source => source.roleId === roleId));
  return (
    <>
      <h3>Affected people</h3>
      <p>
        {grants} {grants === 1 ? 'grant uses' : 'grants use'} this role.
      </p>
      {error && <p role="alert">{error}</p>}
      {holders?.map(person => (
        <p key={person.id}>
          {person.name} ({person.verifiedEmail ?? person.id})
        </p>
      ))}
      {holders?.length === 0 && <p>No known person holds this role.</p>}
    </>
  );
}

/** Names a grant by its role, member and scope, so a refusal says which change it refused. */
export function grantSummary(grant: Grant, roles: { builtIn: Role[]; custom: Role[] }): string {
  const role = [...roles.builtIn, ...roles.custom].find(entry => entry.id === grant.roleId);
  const member = grant.member.kind === 'email' ? grant.member.email : grant.member.groupId;
  return `the ${role?.name ?? grant.roleId} grant for ${member} (${scopeLabel(grant.scope)})`;
}
