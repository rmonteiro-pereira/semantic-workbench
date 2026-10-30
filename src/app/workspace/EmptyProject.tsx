/** The canvas of a project that has no supported definitions yet, with the next step. */
import { FilePlus, FolderOpen } from 'lucide-react';
import { useCapabilities } from '../auth/Capabilities';
import type { ProjectInfo } from '../projects/api';

/** Says which project was opened and how to add its first definitions. */
export function EmptyProject({ project, onImportFiles, onNewFile }: { project: ProjectInfo; onImportFiles: () => void; onNewFile: () => void }) {
  const access = useCapabilities(project.slug);
  return (
    <div className="empty" role="region" aria-label={`${project.name} has no definitions`}>
      <div className="empty-icon">
        <FolderOpen size={36} />
      </div>
      <h2>No supported definitions found in {project.name}.</h2>
      <p>
        The repository was cloned, but it holds no contract, semantic model, ontology or mapping yet.
        <br />
        Create the first definition, or import files; each one is checked before it is saved.
      </p>
      <div className="empty-actions">
        {access.can('import') && (
          <button className="primary" onClick={onNewFile}>
            <FilePlus size={14} />
            New file
          </button>
        )}
        <button className={access.can('import') ? undefined : 'primary'} onClick={onImportFiles}>
          Import files
        </button>
      </div>
    </div>
  );
}
