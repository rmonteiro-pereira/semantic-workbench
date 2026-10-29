import { ListInput } from './ListInput';
import type { Role } from './types';
import { SelectField } from './SelectField';
import { BRANCH_ACTIONS, FILE_ACTIONS, LEVELS, type Action } from '../../shared/auth/actions';
import { commaList } from './change-review';
import { actionLabel } from './helpers';

const groups = {
  Read: ['read', 'export', 'history', 'viewOwnState'],
  Write: ['edit', 'createMetric', 'import', 'move', 'delete', 'revert', 'restoreOwn'],
  Steward: ['approveMetric', 'editGuarded', 'restoreOthers', 'publish'],
  Git: ['stage', 'commit', 'branch', 'fetch', 'pull', 'push', 'cancelOwn'],
  Administration: ['purge', 'clear', 'createProject', 'renameProject', 'deleteProject', 'setRemote', 'clone', 'registerProjects', 'setIdentity', 'readStatus', 'readAudit'],
  Agent: ['agentRead'],
};
/** Presents server-provided actions in the role matrix groups, with applicable conditions. */
export function RolePermissions({ role, actions, onChange }: { role: Role; actions: Action[]; onChange: (role: Role) => void }) {
  function toggle(action: Action) {
    const selected = role.permissions.some(permission => permission.actions.includes(action));
    const remaining = role.permissions
      .map(permission => ({
        ...permission,
        actions: permission.actions.filter(item => item !== action),
      }))
      .filter(permission => permission.actions.length);
    onChange({
      ...role,
      permissions: selected ? remaining : [...remaining, { actions: [action] }],
    });
  }
  function condition(action: Action, field: string, value: string) {
    const permission = role.permissions.find(item => item.actions.includes(action));
    if (!permission) return;
    const conditions = {
      ...permission.conditions,
      [field]: field === 'docType' ? commaList(value) : value,
    };
    if (!value) delete conditions[field as keyof typeof conditions];
    const remaining = role.permissions.map(item => ({ ...item, actions: item.actions.filter(selected => selected !== action) })).filter(item => item.actions.length);
    onChange({ ...role, permissions: [...remaining, { actions: [action], conditions }] });
  }
  return (
    <>
      {Object.entries(groups).map(([name, members]) => (
        <fieldset key={name} className="role-actions">
          <legend>{name}</legend>
          {actions
            .filter(action => members.includes(action))
            .map(action => {
              const permission = role.permissions.find(item => item.actions.includes(action));
              return (
                <div key={action}>
                  <label>
                    <input type="checkbox" checked={Boolean(permission)} aria-describedby={`action-id-${action}`} onChange={() => toggle(action)} />
                    {actionLabel(action)}
                  </label>
                  <small className="admin-id" id={`action-id-${action}`}>
                    {action}
                  </small>
                  {permission && (
                    <details>
                      <summary>Conditions for {actionLabel(action).toLowerCase()}</summary>
                      {BRANCH_ACTIONS.includes(action) && (
                        <label>
                          Branch
                          <input value={permission.conditions?.branch ?? ''} onChange={event => condition(action, 'branch', event.target.value)} />
                        </label>
                      )}
                      {FILE_ACTIONS.includes(action) && (
                        <>
                          <label>
                            Path
                            <input value={permission.conditions?.path ?? ''} onChange={event => condition(action, 'path', event.target.value)} />
                          </label>
                          <label>
                            Document type
                            <ListInput value={permission.conditions?.docType ?? []} onChange={values => condition(action, 'docType', values.join(', '))} />
                          </label>
                          <SelectField label="Highest classification level" value={permission.conditions?.maxLevel ?? ''} onChange={event => condition(action, 'maxLevel', event.target.value)}>
                            <option value="">Any</option>
                            {LEVELS.map(level => (
                              <option key={level}>{level}</option>
                            ))}
                          </SelectField>
                        </>
                      )}
                    </details>
                  )}
                </div>
              );
            })}
        </fieldset>
      ))}
    </>
  );
}
