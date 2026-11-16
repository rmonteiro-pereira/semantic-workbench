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
  const adminShown = section !== null && Boolean(me || !error);
  const permitted = canOpenAdmin(me);
  return (
    <>
      <div className="admin-workspace" hidden={adminShown}>
        {children}
      </div>
      {adminShown && me && !permitted && <AdminAccessNotice />}
      {adminShown && me && permitted && section && <AdminPage section={section} onBackToWorkspace={close} />}
    </>
  );
}

/** Explains a refused Admin address and provides a route back to the workspace. */
export function AdminAccessNotice() {
  return (
    <main className="admin-page admin-scope">
      <section className="admin-content">
        <h1>Admin requires the Admin role</h1>
        <p>Ask an administrator if you need to manage access.</p>
        <a href="#">Back to workspace</a>
      </section>
    </main>
  );
}
