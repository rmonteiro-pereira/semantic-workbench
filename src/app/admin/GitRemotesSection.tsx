import { RecordList, type RecordColumn } from './RecordList';
import { useState } from 'react';
import { EmptyState } from '../projects/EmptyState';
import { api, scm } from '../projects/api';
import { RemoteDialog } from '../scm/RemoteDialog';
import { AdminConfirmation } from './AdminConfirmation';
import { problemText } from './api';
import { useAdminRoute } from './admin-route';
import { useAdminData } from './useAdminData';
import { SectionStatus } from './SectionStatus';

/** One project and the remote Source control shows for it; the address never carries credentials. */
type ProjectRemote = {
  slug: string;
  name: string;
  remoteName: string | null;
  address: string | null;
  /** Set when the project's Git status could not be read. */
  problem: string | null;
};

async function loadProjectRemote(project: { slug: string; name: string }): Promise<ProjectRemote> {
  try {
    const status = await scm.status(project.slug);
    const [remoteName] = Object.keys(status.remotes);
    const address = remoteName ? status.remotes[remoteName] : null;
    return {
      slug: project.slug,
      name: project.name,
      remoteName: remoteName ?? null,
      address,
      problem: null,
    };
  } catch (problem) {
    const empty = { slug: project.slug, name: project.name, remoteName: null, address: null };
    return { ...empty, problem: problemText(problem) };
  }
}

async function loadProjectRemotes(): Promise<ProjectRemote[]> {
  const projects = await api.projects();
  return Promise.all(projects.map(loadProjectRemote));
}

/** Lists every project with its Git remote, and lets an Admin set or remove it. */
export function GitRemotesSection() {
  const { data, error, reload } = useAdminData(loadProjectRemotes);
  const [setting, setSetting] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProjectRemote | null>(null);
  const [failure, setFailure] = useState('');
  const { close: backToWorkspace } = useAdminRoute();

  async function removeRemote() {
    if (!removing?.remoteName) return;
    try {
      await scm.removeRemote(removing.slug, removing.remoteName);
      setRemoving(null);
      setFailure('');
      reload();
    } catch (problem) {
      setFailure(`Remove remote of ${removing.name}: ${problemText(problem)}`);
      setRemoving(null);
    }
  }

  function closeRemoteDialog() {
    setSetting(null);
    reload();
  }

  if (data?.length === 0) {
    return (
      <EmptyState
        title="No projects yet. Add or clone a project to configure its remote."
        action={
          <button onClick={backToWorkspace} title="Back to the workspace to use Add project">
            Back to workspace
          </button>
        }
      />
    );
  }

  return (
    <>
      <SectionStatus subject="project remotes" loading={!data && !error} error={error} onRetry={reload} />
      {failure && <p role="alert">{failure}</p>}
      {data && (
        <RecordList
          label="Project remotes"
          records={data}
          recordKey={project => project.slug}
          columns={remoteColumns}
          actions={project => (
            <>
              <button aria-label={`Set remote for ${project.name}`} onClick={() => setSetting(project.slug)}>
                Set remote
              </button>
              {project.remoteName && (
                <button className="admin-remove" onClick={() => setRemoving(project)}>
                  Remove remote
                </button>
              )}
            </>
          )}
        />
      )}
      {setting && <RemoteDialog project={setting} onClose={closeRemoteDialog} />}
      {removing && (
        <AdminConfirmation
          title={`Remove the remote of ${removing.name}`}
          onCancel={() => setRemoving(null)}
          actions={
            <button className="danger" onClick={() => void removeRemote()}>
              Remove remote
            </button>
          }
        >
          <p>{removing.name} will no longer fetch, pull or push until a remote is set again. Files and history stay as they are.</p>
        </AdminConfirmation>
      )}
    </>
  );
}

const remoteColumns: RecordColumn<ProjectRemote>[] = [
  { label: 'Project', value: project => project.name },
  { label: 'Remote', value: project => project.problem ?? remoteLabel(project) },
];

function remoteLabel(project: ProjectRemote) {
  if (!project.remoteName) return 'No remote';
  return `${project.remoteName}: ${project.address}`;
}
