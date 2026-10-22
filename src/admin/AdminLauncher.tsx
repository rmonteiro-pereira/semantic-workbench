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
  'Users & groups': UsersDialog,
  'Roles & access': RolesAccessDialog,
  Policies: PoliciesDialog,
  'Access check': AccessCheckDialog,
  Projects: ProjectAccessDialog,
  Audit: AuditDialog,
  Settings: SettingsDialog,
};
/** Uses the server's capability, including the implicit local administrator. */
export function canOpenAdmin(me: Me | null): boolean {
  return me?.mode === 'local' || me?.can?.admin === true;
}
/** Adds only the Admin header entry; secondary work stays in separate dialogs. */
export function AdminLauncher() {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<keyof typeof areas | null>(null);
  if (!canOpenAdmin(me)) return null;
  const Area = area ? areas[area] : null;
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
          <nav className="admin-areas" aria-label="Admin areas">
            {Object.keys(areas).map(name => (
              <button key={name} onClick={() => setArea(name as keyof typeof areas)}>
                {name}
              </button>
            ))}
          </nav>
          {Area && <Area onClose={() => setArea(null)} />}
        </AdminDialog>
      )}
    </>
  );
}
