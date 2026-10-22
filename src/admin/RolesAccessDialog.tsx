import { useState } from 'react';
import { useMe } from '../auth/useMe';
import { AdminDialog, type DialogProps } from './AdminDialog';
import { whenLabel } from './when';
import { MenuButton } from '../projects/Menu';
import { newIdentifier } from './identifiers';
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
/** Lists all grants and locked built-in roles alongside editable custom roles. */
export function RolesAccessDialog({ onClose }: DialogProps) {
  const { me } = useMe();
  const { data, error, reload } = useAdminData(loadRoles);
  const [tab, setTab] = useState('Grants');
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
      permissions:
        source?.permissions.filter(permission => !permission.actions.includes('admin')) ?? [],
      // roles.json records who created each custom role and when, as grants.json does for grants.
      createdBy: me?.id ?? '',
      createdAt: new Date().toISOString(),
    });
  }
  return (
    <AdminDialog title="Roles & access" onClose={onClose}>
      {error && <p role="alert">{error}</p>}
      <div className="admin-actions">
        <div className="segmented" role="tablist" aria-label="Roles and grants">
          {['Grants', 'Roles'].map(name => (
            <button
              key={name}
              role="tab"
              aria-selected={tab === name}
              className={tab === name ? 'selected' : ''}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <button onClick={() => setHistory(true)}>History</button>
      </div>
      {data && tab === 'Grants' && (
        <>
          <button onClick={() => setGrant('new')}>Add grant</button>
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
                          <br />
                          {item.member.groupId}
                        </>
                      )}
                    </td>
                    <td>
                      {[...data.roles.builtIn, ...data.roles.custom].find(
                        role => role.id === item.roleId,
                      )?.name ?? item.roleId}
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
      {data && tab === 'Roles' && (
        <>
          <button onClick={() => duplicate()}>New role</button>
          <RoleMatrix roles={data.roles.builtIn} actions={data.roles.actions} />
          {data.roles.builtIn.map(item => (
            <section key={item.id} aria-label={item.name}>
              <h3>🔒 {item.name} — read-only</h3>
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
      {grant && (
        <GrantForm
          initial={grant === 'new' ? undefined : grant}
          onClose={() => setGrant(null)}
          onSaved={saved}
        />
      )}
      {role && data && (
        <RoleEditor initial={role} {...data} onClose={() => setRole(null)} onSaved={saved} />
      )}
      {removal && data && (
        <RemoveAccess item={removal} data={data} onClose={() => setRemoval(null)} onSaved={saved} />
      )}
      {history && (
        <VersionHistory
          area={tab === 'Grants' ? 'grants' : 'roles'}
          onClose={() => {
            setHistory(false);
            reload();
          }}
        />
      )}
    </AdminDialog>
  );
}

function RemoveAccess({
  item,
  data,
  onClose,
  onSaved,
}: DialogProps & {
  item: Grant | Role;
  data: Awaited<ReturnType<typeof loadRoles>>;
  onSaved: () => void;
}) {
  const grant = 'roleId' in item;
  const proposal = grant
    ? { grants: data.grants.filter(entry => entry.id !== item.id) }
    : { roles: data.roles.custom.filter(entry => entry.id !== item.id) };
  const question = grant
    ? `Remove ${grantSummary(item, data.roles)}?`
    : `Delete the role ${item.name} and all of its grants?`;
  return (
    <AdminDialog title={grant ? 'Remove grant' : 'Delete role'} onClose={onClose} size="medium">
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
      />
    </AdminDialog>
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
