import { SectionStatus } from './SectionStatus';
import { useState } from 'react';
import { adminApi } from './api';
import { useAdminData } from './useAdminData';
import { ReviewChange } from './ReviewChange';
import { ProjectFields } from './ProjectFields';
import { WrappingField } from './WrappingField';
import { AgentGrants } from './AgentGrants';
import { VersionHistory } from './VersionHistory';
import type { ProjectsConfig } from './types';

// Each document is saved against the version it was read at.
async function loadProjects() {
  const [projects, agents] = await Promise.all([adminApi.projects(), adminApi.agents()]);
  return { projects, agents };
}
/** Manages domains, project restrictions and application client grants. */
export function ProjectAccessSection() {
  const { data, error, reload } = useAdminData(loadProjects);
  const [history, setHistory] = useState(false);
  if (history) {
    return (
      <VersionHistory
        area="projects"
        backLabel="Back to projects access"
        onBack={() => {
          setHistory(false);
          reload();
        }}
      />
    );
  }
  return (
    <>
      <button onClick={() => setHistory(true)}>History</button>
      <SectionStatus subject="project access" loading={!data && !error} error={error} onRetry={reload} />
      {data && (
        <>
          <ProjectsEditor key={data.projects.version} initial={data.projects.document} version={data.projects.version} onSaved={reload} />
          <AgentGrants key={'agents-' + data.agents.version} initial={data.agents.document} version={data.agents.version} onSaved={reload} />
        </>
      )}
    </>
  );
}

/** Edits project access data while retaining classification aliases outside this form. */
export function ProjectsEditor({ initial, version, onSaved }: { initial: ProjectsConfig; version: string; onSaved: () => void }) {
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
            <WrappingField aria-label={`Domain name ${domain.id}`} value={domain.name} onValueChange={name => renameDomain(domain.id, name)} />
          </label>
          <button aria-label={`Remove domain ${domain.id}`} onClick={() => removeDomain(domain.id)}>
            Remove
          </button>
        </div>
      ))}
      <div className="admin-row">
        <label>
          New domain ID
          <WrappingField value={newId} onValueChange={setNewId} />
        </label>
        <label>
          New domain name
          <WrappingField value={newName} onValueChange={setNewName} />
        </label>
        <button disabled={!newId.trim() || !newName.trim()} onClick={addDomain}>
          Add domain
        </button>
      </div>
      {Object.entries(config.projects).map(([slug, project]) => (
        <ProjectFields key={slug} slug={slug} project={project} domains={config.domains} onChange={value => changeProject(slug, value)} />
      ))}
      <p>Preview changes to domains and project access before saving.</p>
      <ReviewChange area="projects" proposal={config} baseVersion={version} onSaved={onSaved} description="Save project access" />
    </>
  );
}
