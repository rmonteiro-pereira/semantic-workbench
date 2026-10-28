/** Decides who may open Admin and what opens it, for the Settings panel and the Admin host. */
import { useMe, type Me } from '../auth/useMe';
import { useAdminRoute } from './admin-route';

/** Uses the server's capability, including the implicit local administrator. */
export function canOpenAdmin(me: Me | null): boolean {
  return me?.mode === 'local' || me?.can?.admin === true;
}

/** Returns what opens the Admin page, or null when this person may not open it. */
export function useAdminEntry(): (() => void) | null {
  const { me } = useMe();
  const { open } = useAdminRoute();
  if (!canOpenAdmin(me)) return null;
  return () => open();
}
