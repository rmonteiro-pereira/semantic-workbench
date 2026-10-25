// Renders the Admin entry and page with the app's stylesheet so the page keeps its real geometry.
// Browser harness for tests/admin-dialogs.test.tsx (bundled by bun build, run in Chromium).
import { useEffect, useState } from 'react';
import { ReviewChange } from '../../src/admin/ReviewChange';
import type { Proposal } from '../../src/admin/types';
import { createRoot } from 'react-dom/client';
import { AdminHost } from '../../src/admin/AdminHost';
import { AdminLauncher } from '../../src/admin/AdminLauncher';
import '../../src/style.css';

// Parent updates can arrive while the native dialog makes the underlying form inert.
function ReviewHarness() {
  const [roleId, setRoleId] = useState('viewer');
  useEffect(() => {
    function updateProposal() {
      setRoleId('editor');
    }
    window.addEventListener('review-proposal-changed', updateProposal);
    return () => window.removeEventListener('review-proposal-changed', updateProposal);
  }, []);
  const proposal: Proposal = {
    grants: [
      {
        id: 'g_erin',
        roleId,
        member: { kind: 'email', email: 'erin@example.org' },
        scope: { kind: 'projects', projects: ['sales'] },
        addedBy: 'tenant:alice',
        addedAt: '2026-10-22T07:00:00Z',
      },
    ],
  };
  return <ReviewChange area="grants" proposal={proposal} baseVersion="base" onSaved={() => {}} />;
}

createRoot(document.getElementById('root')!).render(
  new URLSearchParams(location.search).has('review') ? (
    <ReviewHarness />
  ) : (
    <AdminHost>
      <AdminLauncher />
    </AdminHost>
  ),
);
