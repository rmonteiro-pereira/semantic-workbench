import { useState } from 'react';
import { AdminPane, type PaneProps } from './AdminPane';
import { RolePermissions } from './RolePermissions';
import { GrantForm, GroupName, scopeLabel } from './GrantForm';
import { ReviewChange } from './ReviewChange';
import type { Grant, Role, RolesResponse } from './types';

/** Edits custom permissions and manages members through the shared grant form. */
export function RoleEditor({
  onBack,
  onSaved,
  initial,
  roles,
  grants,
  version,
}: PaneProps & {
  onSaved: () => void;
  initial: Role;
  roles: RolesResponse;
  grants: Grant[];
  version: string;
}) {
  const [role, setRole] = useState(initial);
  const [member, setMember] = useState(false);
  const persisted = roles.custom.some(item => item.id === role.id);
  if (member) {
    return (
      <GrantForm
        roleId={role.id}
        backLabel="Back to role"
        onBack={() => setMember(false)}
        onSaved={onSaved}
      />
    );
  }
  const proposal = { roles: [...roles.custom.filter(item => item.id !== role.id), role] };
  return (
    <AdminPane
      title={persisted ? 'Edit role' : 'New role'}
      backLabel="Back to roles"
      onBack={onBack}
    >
      <label>
        Name
        <input
          value={role.name}
          onChange={event => setRole({ ...role, name: event.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          value={role.description}
          onChange={event => setRole({ ...role, description: event.target.value })}
        />
      </label>
      <RolePermissions
        role={role}
        actions={roles.actions.filter(action => action !== 'admin')}
        onChange={setRole}
      />
      <h3>Members</h3>
      {grants
        .filter(grant => grant.roleId === role.id)
        .map(grant => (
          <p key={grant.id}>
            {grant.member.kind === 'email' ? (
              grant.member.email
            ) : (
              <GroupName id={grant.member.groupId} />
            )}{' '}
            · {scopeLabel(grant.scope)}
          </p>
        ))}
      <button disabled={!persisted} onClick={() => setMember(true)}>
        Add grant
      </button>
      {!persisted && <p>Save this role before adding members.</p>}
      <ReviewChange
        area="roles"
        changeLabel={`Save role ${role.name}`}
        proposal={proposal}
        baseVersion={version}
        onSaved={onSaved}
        disabled={!role.name.trim() || !role.permissions.length}
      />
    </AdminPane>
  );
}
