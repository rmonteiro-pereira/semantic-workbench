/** Opens a domain-grouped view of the published ontology mesh. */
import { useEffect, useState } from 'react';
import { Modal } from '../projects/Modal';
import { readMeshGraph, type MeshGraphView, type MeshProjectView } from './api';
import { MeshDetails } from './MeshDetails';
import { ProjectTile } from './ProjectTile';
import type { MeshRead } from './use-mesh';

/** Shows readable projects, unavailable endpoints and a text alternative for the links. */
export function MeshContents({ state, selected, onSelect }: { state: MeshRead<MeshGraphView>; selected: string; onSelect: (project: string) => void }) {
  if (state.status === 'loading') return <p role="status">Loading ontology mesh</p>;
  if (state.status === 'error') return <p role="alert">{state.message}</p>;
  const graph = state.value;
  if (!graph.projects.length) return <p>No readable projects in the ontology mesh.</p>;
  const domains = new Map<string, MeshProjectView[]>();
  for (const project of graph.projects) {
    const label = project.domain ?? 'No domain';
    const entries = domains.get(label) ?? [];
    entries.push(project);
    domains.set(label, entries);
  }
  const names = new Map(graph.projects.map(project => [project.project, project.name]));
  const active = graph.projects.find(project => project.project === selected);
  return (
    <div className="mesh-view">
      <div className="mesh-domains">
        {[...domains].map(([domain, projects]) => (
          <section key={domain} aria-label={domain}>
            <h3>{domain}</h3>
            <ul className="mesh-tiles">
              {projects.map(project => (
                <li key={project.project}>
                  <ProjectTile project={project} selected={project.project === selected} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        {graph.links.some(link => link.provider === null) && <p className="mesh-unavailable">Provider unavailable</p>}
      </div>
      <section aria-label="Published links">
        <h3>Published links</h3>
        {!graph.links.length && <p>No published imports connect these projects.</p>}
        <ul className="mesh-import-list">
          {graph.links.map(link => (
            <li key={JSON.stringify([link.consumer, link.provider])}>
              {names.get(link.consumer)} <span aria-hidden="true">→</span> imports from {link.provider ? names.get(link.provider) : 'an unavailable provider'}
              {link.items.length > 0 && <div>{link.items.join(', ')}</div>}
            </li>
          ))}
        </ul>
      </section>
      {active && <MeshDetails project={active} graph={graph} />}
    </div>
  );
}

/** Opens the scoped mesh in the existing accessible modal shell. */
export function MeshView({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<MeshRead<MeshGraphView>>({ status: 'loading' });
  const [selected, setSelected] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    readMeshGraph(controller.signal)
      .then(value => {
        if (!controller.signal.aborted) setState({ status: 'ready', value });
      })
      .catch(error => {
        if (!controller.signal.aborted) setState({ status: 'error', message: (error as Error).message });
      });
    return () => controller.abort();
  }, []);
  return (
    <Modal
      title="Ontology mesh"
      size="wide"
      onCancel={onClose}
      footer={
        <button type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <MeshContents state={state} selected={selected} onSelect={setSelected} />
    </Modal>
  );
}
