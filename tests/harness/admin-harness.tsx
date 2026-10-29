// Browser harness for tests/admin-dialogs.test.tsx (bundled by bun build, run in Chromium).
// It renders the Settings panel's Admin entry and the page with the app's stylesheet so the page keeps its real geometry.
import { useEffect, useState } from 'react';
import { ReviewChange } from '../../src/app/admin/ReviewChange';
import type { Proposal } from '../../src/app/admin/types';
import { createRoot } from 'react-dom/client';
import { AdminHost } from '../../src/app/admin/AdminHost';
import { SettingsPanel } from '../../src/app/workspace/SettingsPanel';
import '../../src/app/style.css';

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
      <SettingsPanel onClearWorkspace={() => {}} clearDisabled={false} />
    </AdminHost>
  ),
);
