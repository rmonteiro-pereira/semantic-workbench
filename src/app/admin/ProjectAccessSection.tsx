import { SavedNote, useSavedAt } from './SaveStatus';
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
  const { savedAt, markSaved } = useSavedAt();
  function saved() {
    markSaved();
    reload();
  }
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
      <SavedNote at={savedAt} />
      {data && (
        <>
          <ProjectsEditor key={data.projects.version} initial={data.projects.document} version={data.projects.version} onSaved={saved} />
          <AgentGrants key={'agents-' + data.agents.version} initial={data.agents.document} version={data.agents.version} onSaved={saved} />
        </>
      )}
    </>
  );
}

/** The domains and restricted paths a draft removes, named for the review's dialog. */
export type ProjectRemovals = { domains: string[]; restrictions: string[] };

/** Names the domains and restricted paths a draft removes. */
export function projectRemovals(before: ProjectsConfig, after: ProjectsConfig): ProjectRemovals {
  const domains = before.domains.filter(domain => !after.domains.some(kept => kept.id === domain.id)).map(domain => `domain ${domain.name || domain.id}`);
  const restrictions = Object.entries(before.projects).flatMap(([slug, project]) => {
    const keptPatterns = new Set((after.projects[slug]?.restricted ?? []).map(rule => rule.pattern));
    return project.restricted.filter(rule => !keptPatterns.has(rule.pattern)).map(rule => `restriction ${rule.pattern} on ${slug}`);
  });
  return { domains, restrictions };
}

/** How many of one kind a draft removes, as "a restriction" or "3 restrictions". */
function removedCount(count: number, noun: string): string {
  if (count === 1) return `a ${noun}`;
  return `${count} ${noun}s`;
}

/**
 * A short dialog title that names only the kind of removal, such as "Remove a restriction". The
 * names themselves can be long paths, so they go in the dialog body where they wrap.
 */
export function removalTitle(removals: ProjectRemovals): string | undefined {
  const domainCount = removals.domains.length;
  const restrictionCount = removals.restrictions.length;
  if (domainCount && restrictionCount) return 'Remove domains and restrictions';
  if (domainCount) return `Remove ${removedCount(domainCount, 'domain')}`;
  if (restrictionCount) return `Remove ${removedCount(restrictionCount, 'restriction')}`;
  return undefined;
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
  const removals = projectRemovals(initial, config);
  const removedNames = [...removals.domains, ...removals.restrictions];
  return (
    <>
      <h3>Domains</h3>
      {config.domains.map(domain => (
        <div key={domain.id} className="admin-row">
          <label>
            {domain.id}
            <WrappingField aria-label={`Domain name ${domain.id}`} value={domain.name} onValueChange={name => renameDomain(domain.id, name)} />
          </label>
          <button className="admin-remove" aria-label={`Remove domain ${domain.id}`} onClick={() => removeDomain(domain.id)}>
            Remove
          </button>
        </div>
      ))}
      <div className="admin-row">
        <label>
          New domain identifier, such as sales
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
      <ReviewChange
        area="projects"
        proposal={config}
        baseVersion={version}
        onSaved={onSaved}
        description="Save project access"
        changeLabel={removalTitle(removals)}
        removedNames={removedNames}
        destructive={removedNames.length > 0}
        confirmLabel={removedNames.length > 0 ? 'Save and remove' : undefined}
        dirty={JSON.stringify(config) !== JSON.stringify(initial)}
      />
    </>
  );
}
