// Renders the Admin launcher with the app's stylesheet so dialogs keep their real geometry.
// Browser harness for tests/admin-dialogs.test.tsx (bundled by bun build, run in Chromium).
import { createRoot } from 'react-dom/client';
import { AdminLauncher } from '../../src/admin/AdminLauncher';
import '../../src/style.css';

createRoot(document.getElementById('root')!).render(<AdminLauncher />);
