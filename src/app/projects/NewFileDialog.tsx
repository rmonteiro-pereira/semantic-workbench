/** Starts a project's first or next definition file from a minimal valid template. */
import React, { useState } from 'react';
import { FilePlus } from 'lucide-react';
import { Modal } from './Modal';
import type { Doc, ProjectInfo } from './api';
import { NEW_FILE_KINDS, mappingBlocker, mappingTargets, newFileName, newFileProblem, newFileSource, type NewFileKind } from '../../shared/projects/new-file';

/** Chooses the kind and name of a new file, and for a mapping the files it points at. */
export function NewFileDialog({
  project,
  projectDocs,
  onClose,
  onCreate,
}: {
  project: ProjectInfo;
  projectDocs: Doc[];
  onClose: () => void;
  /** Saves the file in the project and opens it; rejects with the reason it could not. */
  onCreate: (file: { path: string; source: string }) => Promise<void>;
}) {
  const [kind, setKind] = useState<NewFileKind>('ontology');
  const [name, setName] = useState('');
  const [ontologyPath, setOntologyPath] = useState('');
  const [semanticPath, setSemanticPath] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const targets = mappingTargets(projectDocs.map(doc => ({ path: doc.path, source: doc.source })));
  const blocker = mappingBlocker(targets);
  const ontology = targets.ontologies.find(target => target.path === ontologyPath) ?? targets.ontologies[0];
  const semanticModel = targets.semanticModels.find(target => target.path === semanticPath) ?? targets.semanticModels[0];
  const problem = name
    ? newFileProblem(
        kind,
        name,
        project.files.map(file => file.path),
      )
    : null;
  const canCreate = !!name.trim() && !problem && !busy && (kind !== 'mapping' || !blocker);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    setError('');
    setBusy(true);
    const source = newFileSource(kind, {
      name,
      contractId: crypto.randomUUID(),
      ontology,
      semanticModel,
    });
    try {
      await onCreate({ path: newFileName(kind, name), source });
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  const footer = (
    <>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" form="new-file" className="primary" disabled={!canCreate}>
        <FilePlus size={14} />
        Create
      </button>
    </>
  );
  return (
    <Modal title={`New file in ${project.name}`} size="narrow" onCancel={onClose} className="import-dialog" footer={footer}>
      <form id="new-file" onSubmit={create}>
        <fieldset className="import-target">
          <legend>Kind</legend>
          {NEW_FILE_KINDS.map(entry => {
            const disabled = entry.kind === 'mapping' && !!blocker;
            return (
              <label key={entry.kind} className="radio">
                <input type="radio" name="new-file-kind" checked={kind === entry.kind} disabled={disabled} onChange={() => setKind(entry.kind)} />
                <span>
                  <strong>{entry.label}</strong>
                  <small>{disabled ? blocker : entry.description}</small>
                </span>
              </label>
            );
          })}
        </fieldset>
        <label className="compact-field">
          Name
          <input autoFocus value={name} maxLength={200} onChange={event => setName(event.target.value)} />
        </label>
        {kind === 'mapping' && !blocker && (
          <>
            <label>
              Ontology
              <select value={ontology?.path} onChange={event => setOntologyPath(event.target.value)}>
                {targets.ontologies.map(target => (
                  <option key={target.path} value={target.path}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Semantic model
              <select value={semanticModel?.path} onChange={event => setSemanticPath(event.target.value)}>
                {targets.semanticModels.map(target => (
                  <option key={target.path} value={target.path}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {name && !problem && <p className="hint">Saved as {newFileName(kind, name)}.</p>}
        {(problem || error) && (
          <p role="alert" className="dialog-error">
            {problem || error}
          </p>
        )}
      </form>
    </Modal>
  );
}
