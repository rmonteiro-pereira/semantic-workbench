// Browser harness for the proposals interface tests (bundled by bun build, run in Chromium). It
// renders the Proposals section with the app's stylesheet; the page's requests are answered by a mock.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Capabilities } from '../../src/app/auth/Capabilities';
import type { ProjectInfo } from '../../src/app/projects/api';
import { ProposalsSection } from '../../src/app/proposals/ProposalsSection';
import '../../src/shared/theme/theme.css';
import '../../src/app/style.css';

type HarnessConfig = { project: string; projects: ProjectInfo[]; actions: Record<string, string[]> };
declare global {
  interface Window {
    __harness: HarnessConfig;
  }
}

// A proposal event from another browser raises the version, as the workspace does for Source Control.
function Harness() {
  const { project, projects, actions } = window.__harness;
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(current => current + 1);
    window.addEventListener('proposal-event', bump);
    return () => window.removeEventListener('proposal-event', bump);
  }, []);
  return (
    <Capabilities projects={projects.map(item => ({ slug: item.slug, actions: actions[item.slug] ?? [] }))}>
      <main style={{ padding: 12, maxWidth: 360 }}>
        <ProposalsSection project={project} projects={projects} version={version} />
      </main>
    </Capabilities>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
