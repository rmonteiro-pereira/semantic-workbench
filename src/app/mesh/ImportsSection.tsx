/** Presents the active root's imports and opens the provider picker. */
import React, { useState } from 'react';
import { IMPORTS_PROPERTY } from '../../shared/tessera/additions/imports';
import type { UnitImport } from '../../shared/tessera/imports';
import { applyPatches } from '../../shared/editor/patch';
import { valuePatches } from '../../shared/edit/yaml-patch';
import { api, type Doc } from '../projects/api';
import { useCapabilities } from '../auth/Capabilities';
import type { Saved } from '../edit/ItemEditor';
import { ImportEditor } from './ImportEditor';
import { useDependencyState, useProviderChoices, type MeshRead } from './use-mesh';
import type { DependencyState } from './api';

type ImportsViewProps = { state: MeshRead<DependencyState | undefined>; canEdit: boolean; onOpen: () => void };

/** Displays explicit status text for loading, errors, empty declarations and draft imports. */
export function ImportsView({ state, canEdit, onOpen }: ImportsViewProps) {
  if (state.status === 'loading') return <p role="status">Loading imports…</p>;
  if (state.status === 'error') return <p role="alert">{state.message}</p>;
  const imports = state.value?.imports ?? [];
  return (
    <>
      {!imports.length && <p>No imports in this ontology.</p>}
      <ul className="mesh-import-list">
        {imports.map(entry => (
          <li key={entry.alias}>
            <strong>{entry.alias}</strong> from {entry.project}
            {entry.ontology ? ` / ${entry.ontology}` : ''}
            <div>{entry.concepts.join(', ')}</div>
            <div>{entry.version === 'latest' ? 'Latest published version' : `Pin ${entry.version.pin}`}</div>
            {state.value?.state === 'needs-update' && <div>Not published</div>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <button type="button" onClick={onOpen}>
          Add import
        </button>
      )}
    </>
  );
}

/** Loads the root's import status and saves declarations through the owning file's edit path. */
export function ImportsSection({ doc, imports, dirty, applySaved }: { doc: Doc; imports: UnitImport[]; dirty: boolean; applySaved: (items: Saved[], label: string) => void }) {
  const access = useCapabilities(doc.project);
  const [editing, setEditing] = useState(false);
  const state = useDependencyState(doc.project, doc.path, doc.hash);
  const providers = useProviderChoices(editing);

  async function add(entry: UnitImport) {
    if (imports.some(source => source.project === entry.project && (!source.ontology || source.ontology === entry.ontology))) {
      throw new Error('This provider ontology is already imported.');
    }
    const patches = valuePatches(doc.source, [IMPORTS_PROPERTY], [...imports, entry], doc.filename);
    const source = applyPatches(doc.source, patches);
    const saved = await api.save(doc.project, doc.path, doc.hash, source, { patches });
    applySaved([{ docId: doc.id, source: saved.source ?? source, hash: saved.hash }], `Saved import in ${doc.path}.`);
    setEditing(false);
  }

  return (
    <section className="mesh-imports" aria-label="Imports">
      <h3>Imports</h3>
      <ImportsView state={state} canEdit={access.can('edit') && !dirty && !editing} onOpen={() => setEditing(true)} />
      {editing && providers.status === 'loading' && <p role="status">Loading published providers…</p>}
      {editing && providers.status === 'error' && <p role="alert">{providers.message}</p>}
      {editing && providers.status === 'ready' && (
        <ImportEditor
          providers={providers.value.filter(provider => provider.project !== doc.project)}
          aliases={new Set(imports.map(entry => entry.alias))}
          onAdd={add}
          onCancel={() => setEditing(false)}
        />
      )}
      {editing && providers.status !== 'ready' && <button onClick={() => setEditing(false)}>Close import editor</button>}
    </section>
  );
}
