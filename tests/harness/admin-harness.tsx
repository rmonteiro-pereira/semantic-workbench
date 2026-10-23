// Renders the Admin entry and page with the app's stylesheet so the page keeps its real geometry.
// Browser harness for tests/admin-dialogs.test.tsx (bundled by bun build, run in Chromium).
import { createRoot } from 'react-dom/client';
import { AdminHost } from '../../src/admin/AdminHost';
import { AdminLauncher } from '../../src/admin/AdminLauncher';
import '../../src/style.css';

createRoot(document.getElementById('root')!).render(
  <AdminHost>
    <AdminLauncher />
  </AdminHost>,
);
