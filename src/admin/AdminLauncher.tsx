import { useState } from 'react';
import { useMe, type Me } from '../auth/useMe';
import { AdminDialog } from './AdminDialog';
import { UsersDialog } from './UsersDialog';
import { RolesAccessDialog } from './RolesAccessDialog';
import { PoliciesDialog } from './PoliciesDialog';
import { AccessCheckDialog } from './AccessCheckDialog';
import { ProjectAccessDialog } from './ProjectAccessDialog';
import { AuditDialog } from './AuditDialog';
import { SettingsDialog } from './SettingsDialog';

const areas = {
  'Users & groups': {
    Dialog: UsersDialog,
    description: 'See who has signed in, their groups and roles, and deactivate accounts.',
  },
  'Roles & access': {
    Dialog: RolesAccessDialog,
    description: 'Grant roles to people and groups, and define custom roles.',
  },
  Policies: {
    Dialog: PoliciesDialog,
    description: 'Review the built-in access rules and add rules of your own.',
  },
  'Access check': {
    Dialog: AccessCheckDialog,
    description: 'Ask why a person can or cannot do something, or who can reach a project.',
  },
  Projects: {
    Dialog: ProjectAccessDialog,
    description: 'Set which domains and projects each group can see.',
  },
  Audit: {
    Dialog: AuditDialog,
    description: 'Search and export the record of access decisions.',
  },
  Settings: {
    Dialog: SettingsDialog,
    description: 'Check the sign-in provider, session lifetimes and active sessions.',
  },
};
type AreaName = keyof typeof areas;
/** Uses the server's capability, including the implicit local administrator. */
export function canOpenAdmin(me: Me | null): boolean {
  return me?.mode === 'local' || me?.can?.admin === true;
}
/** Adds only the Admin header entry; secondary work stays in separate dialogs. */
export function AdminLauncher() {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<AreaName | null>(null);
  if (!canOpenAdmin(me)) return null;
  const Area = area ? areas[area].Dialog : null;
  return (
    <>
      <button className="admin-launcher" onClick={() => setOpen(true)}>
        Admin
      </button>
      {open && (
        <AdminDialog
          title="Admin"
          onClose={() => {
            setOpen(false);
            setArea(null);
          }}
          size="small"
        >
          <nav aria-label="Admin areas">
            <ul className="admin-areas">
              {(Object.keys(areas) as AreaName[]).map(name => (
                <li key={name}>
                  <button onClick={() => setArea(name)}>{name}</button>
                  <span>{areas[name].description}</span>
                </li>
              ))}
            </ul>
          </nav>
          {Area && <Area onClose={() => setArea(null)} />}
        </AdminDialog>
      )}
    </>
  );
}
