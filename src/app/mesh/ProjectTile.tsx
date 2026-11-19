/** Displays a readable project as a keyboard-operable selection in the mesh. */
import type { MeshProjectView } from './api';

/** Names the project and exposes its selection independently of color. */
export function ProjectTile({ project, selected, onSelect }: { project: MeshProjectView; selected: boolean; onSelect: (project: string) => void }) {
  return (
    <button type="button" className="mesh-project-tile" aria-pressed={selected} onClick={() => onSelect(project.project)}>
      {project.name}
    </button>
  );
}
