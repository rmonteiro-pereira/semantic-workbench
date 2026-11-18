/** Presents the active root's imports and opens the provider picker. */
import React, { useState } from 'react';
import { IMPORTS_PROPERTY } from '../../shared/tessera/additions/imports';
import type { UnitImport } from '../../shared/tessera/imports';
import { applyPatches } from '../../shared/editor/patch';
import { valuePatches } from '../../shared/edit/yaml-patch';
import { api, type Doc } from '../projects/api';
import { useCapabilities } from '../auth/Capabilities';
import { renameUnitAlias } from '../edit/references';
import type { Saved } from '../edit/ItemEditor';
import { ImportEditor } from './ImportEditor';
import { useDependencyState, useProviderChoices, type MeshRead } from './use-mesh';
import { DependentsList } from './DependentsList';
import { DependencyUpdate } from './DependencyUpdate';
import type { DependencyState } from './api';

type ImportsViewProps = { state: MeshRead<DependencyState | undefined>; canEdit: boolean; onOpen: () => void; onEdit?: (entry: UnitImport) => void };

/** Displays explicit status text for loading, errors, empty declarations and draft imports. */
export function ImportsView({ state, canEdit, onOpen, onEdit }: ImportsViewProps) {
  if (state.status === 'loading') return <p role="status">Loading imports…</p>;
  if (state.status === 'error') return <p role="alert">{state.message}</p>;
  const imports = state.value?.imports ?? [];
  return (
    <>
      {state.value?.state === 'update-available' && <p role="status">Update available</p>}
      {!imports.length && <p>No imports in this ontology.</p>}
      <ul className="mesh-import-list">
        {imports.map(entry => (
          <li key={entry.alias}>
            <strong>{entry.alias}</strong> from {entry.project}
            {entry.ontology ? ` / ${entry.ontology}` : ''}
            <div>{entry.concepts.join(', ')}</div>
            <div>{entry.version === 'latest' ? 'Latest published version' : `Pin ${entry.version.pin}`}</div>
            {state.value?.state === 'needs-update' && <div>Not published</div>}
            {canEdit && onEdit && (
              <button type="button" onClick={() => onEdit(entry)}>
                Edit import {entry.alias}
              </button>
            )}
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
export function ImportsSection({
  doc,
  imports,
  dirty,
  applySaved,
  projectDocs,
}: {
  doc: Doc;
  imports: UnitImport[];
  dirty: boolean;
  applySaved: (items: Saved[], label: string) => void;
  projectDocs: () => Doc[];
}) {
  const access = useCapabilities(doc.project);
  const [editing, setEditing] = useState<UnitImport | 'new' | null>(null);
  const previous = editing && editing !== 'new' ? editing : undefined;
  const [refresh, setRefresh] = useState(0);
  const state = useDependencyState(doc.project, doc.path, doc.hash, refresh);
  const providers = useProviderChoices(!!editing);

  async function add(entry: UnitImport) {
    const otherImports = imports.filter(candidate => candidate.alias !== previous?.alias);
    if (otherImports.some(source => source.project === entry.project && (!source.ontology || source.ontology === entry.ontology))) {
      throw new Error('This provider ontology is already imported.');
    }
    const importsNext = previous ? imports.map(candidate => (candidate.alias === previous.alias ? entry : candidate)) : [...imports, entry];
    const docs = projectDocs();
    const rewrites = previous && previous.alias !== entry.alias ? renameUnitAlias(doc, docs, previous.alias, entry.alias) : [];
    const root = rewrites.find(write => write.docId === doc.id)?.source ?? doc.source;
    const source = applyPatches(root, valuePatches(root, [IMPORTS_PROPERTY], importsNext, doc.filename));
    await saveImportEdits(doc, source, docs, rewrites, applySaved);
    setEditing(null);
  }

  return (
    <section className="mesh-imports" aria-label="Imports">
      <h3>Imports</h3>
      <ImportsView state={state} canEdit={access.can('edit') && !dirty && !editing} onOpen={() => setEditing('new')} onEdit={setEditing} />
      {access.can('edit') && !dirty && !editing && state.status === 'ready' && state.value && (state.value.imports.length > 0 || state.value.state === 'needs-update') && (
        <DependencyUpdate project={doc.project} baseHash={state.value.manifestHash ?? null} onUpdated={() => setRefresh(refresh + 1)} />
      )}
      {editing && providers.status === 'loading' && <p role="status">Loading published providers…</p>}
      {editing && providers.status === 'error' && <p role="alert">{providers.message}</p>}
      {editing && providers.status === 'ready' && (
        <ImportEditor
          providers={providers.value.filter(provider => provider.project !== doc.project)}
          existing={previous}
          aliases={new Set(imports.filter(entry => entry.alias !== previous?.alias).map(entry => entry.alias))}
          onAdd={add}
          onCancel={() => setEditing(null)}
        />
      )}
      {access.can('publish') && <DependentsList key={doc.project} project={doc.project} />}
      {editing && providers.status !== 'ready' && <button onClick={() => setEditing(null)}>Close import editor</button>}
    </section>
  );
}

async function saveImportEdits(doc: Doc, source: string, docs: Doc[], rewrites: { docId: string; source: string }[], applySaved: (items: Saved[], label: string) => void) {
  const files = [{ path: doc.path, baseHash: doc.hash, source }];
  const ids = new Map([[doc.path, doc.id]]);
  for (const rewrite of rewrites) {
    if (rewrite.docId === doc.id) continue;
    const file = docs.find(candidate => candidate.id === rewrite.docId);
    if (!file) throw new Error('The ontology set is unavailable.');
    files.push({ path: file.path, baseHash: file.hash, source: rewrite.source });
    ids.set(file.path, file.id);
  }
  const saved = await api.saveBatch(doc.project, files);
  const byPath = new Map(files.map(file => [file.path, file.source]));
  applySaved(
    saved.written.map(file => ({ docId: ids.get(file.path)!, source: file.source ?? byPath.get(file.path)!, hash: file.hash })),
    `Saved import in ${doc.path}.`,
  );
}
