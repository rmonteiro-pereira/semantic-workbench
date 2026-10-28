import type { ReactNode } from 'react';
import { useMe } from '../auth/useMe';
import { canOpenAdmin } from './admin-entry';
import { useAdminRoute } from './admin-route';
import { AdminPage } from './AdminPage';

/**
 * Shows the Admin page in place of the workspace while the URL names an Admin section. The
 * workspace stays mounted and hidden, so Back returns to it with the open file and view intact.
 */
export function AdminHost({ children }: { children: ReactNode }) {
  const { section, close } = useAdminRoute();
  const { me, error } = useMe();
  // While the identity loads the page holds the screen, so a reload does not flash the workspace.
  const adminShown = section !== null && (me ? canOpenAdmin(me) : !error);
  return (
    <>
      <div className="admin-workspace" hidden={adminShown}>
        {children}
      </div>
      {adminShown && me && section && <AdminPage section={section} onBackToWorkspace={close} />}
    </>
  );
}
