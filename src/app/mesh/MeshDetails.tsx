/** Gives the selected project's published imports in text. */
import { useCapabilities } from '../auth/Capabilities';
import type { MeshGraphView, MeshProjectView } from './api';
import { DependentsList } from './DependentsList';

/** Names the selected project's providers and offers Used by to its publishers. */
export function MeshDetails({ project, graph }: { project: MeshProjectView; graph: MeshGraphView }) {
  const access = useCapabilities(project.project);
  const names = new Map(graph.projects.map(project => [project.project, project.name]));
  const outgoing = graph.links.filter(link => link.consumer === project.project);
  return (
    <section aria-label="Project imports">
      <h3>{project.name}</h3>
      {outgoing.length === 0 && <p>No published imports.</p>}
      <ul className="mesh-import-list">
        {outgoing.map(link => (
          <li key={JSON.stringify([link.provider, link.version])}>
            {link.provider ? names.get(link.provider) : 'Provider unavailable'}
            {link.items.length > 0 && <div>{link.items.join(', ')}</div>}
            {link.version && <div>Resolved provider version {link.version}</div>}
          </li>
        ))}
      </ul>
      {access.can('publish') && <DependentsList key={project.project} project={project.project} />}
    </section>
  );
}
