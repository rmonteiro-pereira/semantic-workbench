/** Presentation and event handling for rdf item dialogs. */
import React from 'react';
import type { Saved } from '../edit/ItemEditor';
import { RdfAddItem, RdfDeleteItem } from '../edit/RdfAddItem';
import { RdfItemEditor } from '../edit/RdfItemEditor';
import type { Doc } from '../projects/api';
import type { RdfTarget } from './types';

type Props = {
  rdfEditing: RdfTarget | null;
  docsRef: React.RefObject<Map<string, Doc>>;
  docText: (id: string) => string;
  setRdfEditing: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
  applySaved: (saved: Saved[], label: string) => void;
  setRdfDeleting: React.Dispatch<React.SetStateAction<RdfTarget | null>>;
  openSourceAt: (id: string, line: number) => void;
  rdfAdding: string | null;
  setRdfAdding: React.Dispatch<React.SetStateAction<string | null>>;
  current: Doc | null;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  rdfDeleting: RdfTarget | null;
  projectDocsOf: (id: string) => Doc[];
};
/** Renders rdf item dialogs. */
export function RdfItemDialogs({
  rdfEditing,
  docsRef,
  docText,
  setRdfEditing,
  applySaved,
  setRdfDeleting,
  openSourceAt,
  rdfAdding,
  setRdfAdding,
  current,
  setSelected,
  setSelectedEdge,
  rdfDeleting,
  projectDocsOf,
}: Props) {
  function handleRdfItemEditorSaved(saved: import('../edit/ItemEditor').Saved[]) {
    if (rdfEditing == null) return;

    const file = docsRef.current.get(rdfEditing.docId)?.path;
    setRdfEditing(null);
    applySaved(saved, `Saved to ${file}.`);
  }

  function handleRdfItemEditorDelete() {
    setRdfDeleting(rdfEditing);
    setRdfEditing(null);
  }

  function handleRdfItemEditorOpenSource(line: number) {
    if (rdfEditing == null) return;

    const id = rdfEditing.docId;
    setRdfEditing(null);
    openSourceAt(id, line);
  }

  function handleRdfAddItemSaved(saved: import('../edit/ItemEditor').Saved, subject: string) {
    setRdfAdding(null);
    applySaved([saved], `Added to ${docsRef.current.get(saved.docId)?.path}.`);
    if (saved.docId === current?.id) {
      setSelected(subject);
      setSelectedEdge('');
    }
  }

  function handleRdfDeleteItemDeleted(saved: import('../edit/ItemEditor').Saved[]) {
    if (rdfDeleting == null) return;

    const label = rdfDeleting.label;
    setRdfDeleting(null);
    setSelected('');
    setSelectedEdge('');
    applySaved(saved, `Deleted ${label}.`);
  }

  return (
    <>
      {rdfEditing && docsRef.current.get(rdfEditing.docId) && (
        <RdfItemEditor
          key={rdfEditing.docId + '#' + rdfEditing.subject}
          doc={docsRef.current.get(rdfEditing.docId)!}
          base={docText(rdfEditing.docId)}
          subject={rdfEditing.subject}
          label={rdfEditing.label}
          kind={rdfEditing.kind}
          onClose={() => setRdfEditing(null)}
          onSaved={handleRdfItemEditorSaved}
          onDelete={handleRdfItemEditorDelete}
          onOpenSource={handleRdfItemEditorOpenSource}
        />
      )}
      {rdfAdding && docsRef.current.get(rdfAdding) && <RdfAddItem doc={docsRef.current.get(rdfAdding)!} base={docText(rdfAdding)} onClose={() => setRdfAdding(null)} onSaved={handleRdfAddItemSaved} />}
      {rdfDeleting && docsRef.current.get(rdfDeleting.docId) && (
        <RdfDeleteItem
          doc={docsRef.current.get(rdfDeleting.docId)!}
          base={docText(rdfDeleting.docId)}
          subject={rdfDeleting.subject}
          label={rdfDeleting.label}
          projectDocs={projectDocsOf(rdfDeleting.docId)}
          onClose={() => setRdfDeleting(null)}
          onDeleted={handleRdfDeleteItemDeleted}
        />
      )}
    </>
  );
}
