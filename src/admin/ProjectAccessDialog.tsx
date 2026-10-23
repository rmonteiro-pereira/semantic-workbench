import { useState } from 'react';
import { AdminDialog, type DialogProps } from './AdminDialog';
import { adminApi } from './api';
import { useAdminData } from './useAdminData';
import { ReviewChange } from './ReviewChange';
import { ProjectFields } from './ProjectFields';
import { AgentGrants } from './AgentGrants';
import { VersionHistory } from './VersionHistory';
import type { ProjectsConfig } from './types';

// Each document is saved against the version it was read at.
async function loadProjects() {
  const [projects, agents] = await Promise.all([adminApi.projects(), adminApi.agents()]);
  return { projects, agents };
}
/** Manages domains, project restrictions and application client grants. */
export function ProjectAccessDialog({ onClose }: DialogProps) {
  const { data, error, reload } = useAdminData(loadProjects);
  const [history, setHistory] = useState(false);
  return (
    <AdminDialog title="Projects" onClose={onClose}>
      {error && <p role="alert">{error}</p>}
      <button onClick={() => setHistory(true)}>History</button>
      {data && (
        <>
          <ProjectsEditor
            key={data.projects.version}
            initial={data.projects.document}
            version={data.projects.version}
            onSaved={reload}
          />
          <AgentGrants
            key={'agents-' + data.agents.version}
            initial={data.agents.document}
            version={data.agents.version}
            onSaved={reload}
          />
        </>
      )}
      {history && (
        <VersionHistory
          area="projects"
          onClose={() => {
            setHistory(false);
            reload();
          }}
        />
      )}
    </AdminDialog>
  );
}

/** Edits project access data while retaining classification aliases outside this form. */
export function ProjectsEditor({
  initial,
  version,
  onSaved,
}: {
  initial: ProjectsConfig;
  version: string;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState(initial);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  function addDomain() {
    if (!newId.trim() || config.domains.some(domain => domain.id === newId.trim())) return;
    setConfig({
      ...config,
      domains: [...config.domains, { id: newId.trim(), name: newName.trim() }],
    });
    setNewId('');
    setNewName('');
  }
  function changeProject(slug: string, project: ProjectsConfig['projects'][string]) {
    setConfig({ ...config, projects: { ...config.projects, [slug]: project } });
  }
  function renameDomain(id: string, name: string) {
    setConfig({
      ...config,
      domains: config.domains.map(domain => (domain.id === id ? { ...domain, name } : domain)),
    });
  }
  function removeDomain(id: string) {
    setConfig({ ...config, domains: config.domains.filter(domain => domain.id !== id) });
  }
  return (
    <>
      <h3>Domains</h3>
      {config.domains.map(domain => (
        <div key={domain.id} className="admin-row">
          <label>
            {domain.id}
            <input
              aria-label={`Domain name ${domain.id}`}
              value={domain.name}
              onChange={event => renameDomain(domain.id, event.target.value)}
            />
          </label>
          <button aria-label={`Remove domain ${domain.id}`} onClick={() => removeDomain(domain.id)}>
            Remove
          </button>
        </div>
      ))}
      <div className="admin-row">
        <label>
          New domain ID
          <input value={newId} onChange={event => setNewId(event.target.value)} />
        </label>
        <label>
          New domain name
          <input value={newName} onChange={event => setNewName(event.target.value)} />
        </label>
        <button disabled={!newId.trim() || !newName.trim()} onClick={addDomain}>
          Add domain
        </button>
      </div>
      {Object.entries(config.projects).map(([slug, project]) => (
        <ProjectFields
          key={slug}
          slug={slug}
          project={project}
          domains={config.domains}
          onChange={value => changeProject(slug, value)}
        />
      ))}
      <ReviewChange
        area="projects"
        proposal={config}
        baseVersion={version}
        onSaved={onSaved}
        description="Save project access"
        inline
      />
    </>
  );
}
