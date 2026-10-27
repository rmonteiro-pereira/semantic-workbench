/** Presentation and event handling for structured item dialogs. */
import React from 'react';
import { AddItem } from '../edit/AddItem';
import { DeleteItem } from '../edit/DeleteItem';
import type { Choices, ItemKind, Path } from '../../shared/edit/item-model';
import { itemName } from '../../shared/edit/item-model';
import type { Saved } from '../edit/ItemEditor';
import { ItemEditor } from '../edit/ItemEditor';
import { itemValue } from '../../shared/edit/yaml-patch';
import type { Doc } from '../projects/api';
import type { ItemTarget } from './types';

type Props = {
  editing: ItemTarget | null;
  docsRef: React.RefObject<Map<string, Doc>>;
  docText: (id: string) => string;
  projectDocsOf: (id: string) => Doc[];
  choicesFor: (id: string) => Choices;
  setEditing: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  itemHints: React.RefObject<Record<string, Record<string, string>>>;
  applySaved: (saved: Saved[], label: string) => void;
  setAdding: React.Dispatch<
    React.SetStateAction<{
      docId: string;
      kind?: ItemKind | undefined;
      owner?: Path | undefined;
      preset?: Record<string, any> | undefined;
    } | null>
  >;
  setDeleting: React.Dispatch<React.SetStateAction<ItemTarget | null>>;
  openSourceAt: (id: string, line: number) => void;
  adding: {
    docId: string;
    kind?: ItemKind | undefined;
    owner?: Path | undefined;
    preset?: Record<string, any> | undefined;
  } | null;
  documentOf: (id: string) => any;
  current: Doc | null;
  setSelected: React.Dispatch<React.SetStateAction<string>>;
  setSelectedEdge: React.Dispatch<React.SetStateAction<string>>;
  deleting: ItemTarget | null;
};
/** Renders structured item dialogs. */
export function StructuredItemDialogs({
  editing,
  docsRef,
  docText,
  projectDocsOf,
  choicesFor,
  setEditing,
  itemHints,
  applySaved,
  setAdding,
  setDeleting,
  openSourceAt,
  adding,
  documentOf,
  current,
  setSelected,
  setSelectedEdge,
  deleting,
}: Props) {
  function handleItemEditorSaved(saved: import('../edit/ItemEditor').Saved[]) {
    if (editing == null) return;

    const file = docsRef.current.get(editing.docId)?.path;
    const documentValue = docsRef.current.get(editing.docId);
    if (documentValue && file) {
      const name = itemName(editing.kind, itemValue(docText(editing.docId), editing.path));
      if (name) (itemHints.current[documentValue.project] ??= {})[file] = name;
    }
    setEditing(null);
    const otherFiles = saved.length - 1;
    const suffix =
      otherFiles > 0 ? ` and ${otherFiles} other file${otherFiles > 1 ? 's' : ''}` : '';
    applySaved(saved, `Saved to ${file}${suffix}.`);
  }

  function handleItemEditorAddChild(
    kind: import('../../shared/edit/item-model').ItemKind,
    owner: import('../../shared/edit/item-model').Path,
  ) {
    if (editing == null) return;

    setAdding({ docId: editing.docId, kind, owner });
    setEditing(null);
  }

  function handleItemEditorOpenSource(line: number) {
    if (editing == null) return;

    const id = editing.docId;
    setEditing(null);
    openSourceAt(id, line);
  }

  function handleAddItemSaved(
    saved: import('../edit/ItemEditor').Saved,
    path: import('../../shared/edit/item-model').Path,
    kind: import('../../shared/edit/item-model').ItemKind,
  ) {
    setAdding(null);
    applySaved([saved], `Added to ${docsRef.current.get(saved.docId)?.path}.`);
    if (
      saved.docId === current?.id &&
      !['ontology-relationship', 'join', 'odcs-foreign-key'].includes(kind)
    ) {
      setSelected(path.join('/'));
      setSelectedEdge('');
    }
  }

  return (
    <>
      {editing && docsRef.current.get(editing.docId) && (
        <ItemEditor
          key={editing.docId + '#' + editing.path.join('/')}
          doc={docsRef.current.get(editing.docId)!}
          base={docText(editing.docId)}
          path={editing.path}
          kind={editing.kind}
          projectDocs={projectDocsOf(editing.docId)}
          choices={choicesFor(editing.docId)}
          onClose={() => setEditing(null)}
          onSaved={handleItemEditorSaved}
          onOpenItem={(path, kind) => setEditing({ docId: editing.docId, path, kind })}
          onAddChild={handleItemEditorAddChild}
          onDelete={() => {
            setDeleting(editing);
            setEditing(null);
          }}
          onOpenSource={handleItemEditorOpenSource}
        />
      )}
      {adding && docsRef.current.get(adding.docId) && (
        <AddItem
          doc={docsRef.current.get(adding.docId)!}
          base={docText(adding.docId)}
          document={documentOf(adding.docId)}
          kind={adding.kind}
          owner={adding.owner}
          preset={adding.preset}
          choices={choicesFor(adding.docId)}
          onClose={() => setAdding(null)}
          onSaved={handleAddItemSaved}
        />
      )}
      {deleting &&
        docsRef.current.get(deleting.docId) &&
        (() => {
          function handleDeleteItemDeleted(saved: import('../edit/ItemEditor').Saved[]) {
            if (deleting == null) return;

            setDeleting(null);
            setSelected('');
            setSelectedEdge('');
            const name = itemName(deleting.kind, item);
            const fileCount = saved.length;
            applySaved(
              saved,
              `Deleted ${name} and saved ${fileCount} file${fileCount === 1 ? '' : 's'}.`,
            );
          }

          const base = docText(deleting.docId);
          const item = itemValue(base, deleting.path);
          const owner =
            deleting.kind === 'field' || deleting.kind === 'odcs-property'
              ? String(itemValue(base, deleting.path.slice(0, -2))?.name ?? '')
              : undefined;
          return (
            <DeleteItem
              doc={docsRef.current.get(deleting.docId)!}
              base={base}
              path={deleting.path}
              kind={deleting.kind}
              name={itemName(deleting.kind, item) || 'this item'}
              owner={owner}
              projectDocs={projectDocsOf(deleting.docId)}
              onClose={() => setDeleting(null)}
              onDeleted={handleDeleteItemDeleted}
            />
          );
        })()}
    </>
  );
}
