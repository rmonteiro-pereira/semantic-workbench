import { useMe, type Me } from '../../auth/useMe';
import { useAdminRoute } from './admin-route';

/** Uses the server's capability, including the implicit local administrator. */
export function canOpenAdmin(me: Me | null): boolean {
  return me?.mode === 'local' || me?.can?.admin === true;
}

/** Adds the Admin entry to the workspace header; it opens the Admin page. */
export function AdminLauncher() {
  const { me } = useMe();
  const { open } = useAdminRoute();
  if (!canOpenAdmin(me)) return null;
  return (
    <button className="admin-launcher" onClick={() => open()}>
      Admin
    </button>
  );
}
