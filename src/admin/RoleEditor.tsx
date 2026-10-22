import { useState } from 'react';
import { AdminDialog, type DialogProps } from './AdminDialog';
import { RolePermissions } from './RolePermissions';
import { GrantForm, GroupName, scopeLabel } from './GrantForm';
import { ReviewChange } from './ReviewChange';
import type { Grant, Role, RolesResponse } from './types';

/** Edits custom permissions and manages members through the shared grant form. */
export function RoleEditor({
  onClose,
  onSaved,
  initial,
  roles,
  grants,
  version,
}: DialogProps & {
  onSaved: () => void;
  initial: Role;
  roles: RolesResponse;
  grants: Grant[];
  version: string;
}) {
  const [role, setRole] = useState(initial);
  const [member, setMember] = useState(false);
  const persisted = roles.custom.some(item => item.id === role.id);
  const proposal = { roles: [...roles.custom.filter(item => item.id !== role.id), role] };
  return (
    <AdminDialog title={persisted ? 'Edit role' : 'New role'} onClose={onClose}>
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
      {member && <GrantForm roleId={role.id} onClose={() => setMember(false)} onSaved={onSaved} />}
    </AdminDialog>
  );
}
