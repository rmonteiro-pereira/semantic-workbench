import { RecordList, type RecordColumn } from './RecordList';
import { SavedNote, useSavedAt } from './SaveStatus';
import { useState } from 'react';
import { EmptyState } from '../projects/EmptyState';
import { useMe } from '../auth/useMe';
import { AdminConfirmation } from './AdminConfirmation';
import { newIdentifier, whenLabel } from './helpers';
import { adminApi } from './api';
import { useAdminData } from './useAdminData';
import { SectionStatus } from './SectionStatus';
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
  const { savedAt, markSaved } = useSavedAt();
  function saved() {
    setGrant(null);
    setRole(null);
    setRemoval(null);
    markSaved();
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
      <div className="admin-actions">
        {view === 'grants' ? <button onClick={() => setGrant('new')}>Add grant</button> : <button onClick={() => duplicate()}>New role</button>}
        <button onClick={() => setHistory(true)}>History</button>
      </div>
      <SectionStatus subject={view === 'grants' ? 'access grants' : 'roles'} loading={!data && !error} error={error} onRetry={reload} />
      <SavedNote at={savedAt} />
      {data && view === 'grants' && (
        <>
          {data.grants.length === 0 && (
            <EmptyState title="No access grants yet">
              {me?.mode === 'local' && 'Local mode gives you full access. '}
              Use Add grant to give a person or group a role in server mode.
            </EmptyState>
          )}
          {data.grants.length > 0 && (
            <RecordList
              label="Access grants"
              records={data.grants}
              recordKey={item => item.id}
              columns={grantColumns([...data.roles.builtIn, ...data.roles.custom])}
              actions={item => (
                <>
                  <button aria-label={`Change the grant for ${memberName(item)}`} onClick={() => setGrant(item)}>
                    Change
                  </button>
                  <button className="admin-remove" aria-label={`Remove the grant for ${memberName(item)}`} onClick={() => setRemoval(item)}>
                    Remove
                  </button>
                </>
              )}
            />
          )}
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
              <button className="admin-remove" onClick={() => setRemoval(item)}>
                Delete
              </button>
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
        destructive
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
      <SectionStatus subject="the people who hold this role" loading={!data && !error} error={error} />
      {holders?.map(person => (
        <p key={person.id}>
          {person.name} ({person.verifiedEmail ?? person.id})
        </p>
      ))}
      {holders?.length === 0 && <p>No known person holds this role.</p>}
    </>
  );
}

/** The member of a grant as people know it: the address, or the group's name when known. */
function memberName(grant: Grant): string {
  if (grant.member.kind === 'email') return grant.member.email;
  return grant.member.displayName ?? grant.member.groupId;
}

/** The grant list's columns; the role column needs the role names to show them instead of identifiers. */
function grantColumns(roles: Role[]): RecordColumn<Grant>[] {
  return [
    {
      label: 'Member',
      value: grant =>
        grant.member.kind === 'email' ? (
          grant.member.email
        ) : (
          <>
            {grant.member.displayName ?? 'Group name not resolved'}
            <small className="admin-id">{grant.member.groupId}</small>
          </>
        ),
    },
    {
      label: 'Role and scope',
      value: grant => (
        <>
          {roles.find(role => role.id === grant.roleId)?.name ?? grant.roleId}
          <br />
          {scopeLabel(grant.scope)}
        </>
      ),
    },
    {
      label: 'Added',
      value: grant => (
        <>
          {grant.addedBy}
          <br />
          {whenLabel(grant.addedAt)}
        </>
      ),
    },
  ];
}

/** Names a grant by its role, member and scope, so a refusal says which change it refused. */
export function grantSummary(grant: Grant, roles: { builtIn: Role[]; custom: Role[] }): string {
  const role = [...roles.builtIn, ...roles.custom].find(entry => entry.id === grant.roleId);
  const member = grant.member.kind === 'email' ? grant.member.email : (grant.member.displayName ?? grant.member.groupId);
  return `the ${role?.name ?? grant.roleId} grant for ${member} (${scopeLabel(grant.scope)})`;
}
