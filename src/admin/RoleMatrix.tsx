import type { Role } from './types';
import type { Action } from '../../server/auth/actions';
import { actionLabel } from './action-labels';

/** Displays the fixed built-in permission matrix without editable controls. */
export function RoleMatrix({ roles, actions }: { roles: Role[]; actions: Action[] }) {
  return (
    <div className="admin-table">
      <table aria-label="Built-in role permissions">
        <thead>
          <tr>
            <th>Action</th>
            {roles.map(role => (
              <th key={role.id}>🔒 {role.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actions.map(action => (
            <tr key={action}>
              <th scope="row">
                {actionLabel(action)}
                <br />
                <small className="admin-id">{action}</small>
              </th>
              {roles.map(role => (
                <td key={role.id}>
                  {role.permissions.some(permission => permission.actions.includes(action))
                    ? 'Allowed'
                    : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>Permissions apply within the grant's scope and remain subject to baseline restrictions.</p>
    </div>
  );
}
